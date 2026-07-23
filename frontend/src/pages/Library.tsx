import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type VlmReview = { state: 'completed' | 'unavailable' | 'failed'; score?: number; pass?: boolean; summary?: string; issues?: string[]; hard_failures?: string[]; prompt_patch?: string; detail?: string; model?: string }
type LibraryEntry = { libraryItemId: string; displayName: string; review?: VlmReview }
type ReferenceHandle = { referenceId: string; displayName: string }
type Preview = { mimeType: string; base64: string }
type CleanupPlan = { planId: string; itemCount: number; totalBytes: number; expiresAt: number }

function previewUrl(preview: Preview | undefined) {
  return preview ? `data:${preview.mimeType};base64,${preview.base64}` : ''
}

function byteLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export default function Library() {
  const [items, setItems] = useState<LibraryEntry[]>([])
  const [previews, setPreviews] = useState<Record<string, Preview>>({})
  const [message, setMessage] = useState('正在读取本地半成品库…')
  const [notice, setNotice] = useState('')
  const [cleanupPlan, setCleanupPlan] = useState<CleanupPlan | null>(null)
  const [clearing, setClearing] = useState(false)
  const [reviewingId, setReviewingId] = useState('')

  const refresh = useCallback(async () => {
    if (!window.imageWorkbench?.request) { setMessage('桌面数据服务未加载。'); return }
    try {
      const result = await window.imageWorkbench.request({ type: 'library:list', payload: { kind: 'semifinished' } })
      const entries = Array.isArray(result) ? result as LibraryEntry[] : []
      setItems(entries)
      setMessage(entries.length ? '' : '本地半成品库中暂时没有真实图片。')
    } catch { setMessage('无法读取本地半成品库。') }
  }, [])

  const loadPreview = async (item: LibraryEntry) => {
    if (!window.imageWorkbench?.previewLibraryItem || previews[item.libraryItemId]) return
    try {
      const preview = await window.imageWorkbench.previewLibraryItem(item.libraryItemId)
      setPreviews(current => ({ ...current, [item.libraryItemId]: preview }))
    } catch { setNotice(`无法读取“${item.displayName}”的缩略图。原图未被传入页面。`) }
  }

  const setAsReference = async (item: LibraryEntry) => {
    if (!window.imageWorkbench?.request) return
    try {
      const reference = await window.imageWorkbench.request({ type: 'library:reference:select', payload: { libraryItemId: item.libraryItemId } }) as ReferenceHandle
      if (!reference?.referenceId || !reference.displayName) throw new Error('REFERENCE_HANDLE_INVALID')
      sessionStorage.setItem('dgx-image-workbench:selected-reference', JSON.stringify(reference))
      setNotice(`已将“${reference.displayName}”设为下一次生图的参考图。`)
    } catch { setNotice('无法将该半成品设为参考图。请刷新素材库后重试。') }
  }

  const reviewItem = async (item: LibraryEntry) => {
    if (!window.imageWorkbench?.request || reviewingId) return
    setReviewingId(item.libraryItemId); setNotice('')
    try {
      const review = await window.imageWorkbench.request({ type: 'library:review', payload: { libraryItemId: item.libraryItemId } }) as VlmReview
      setItems(current => current.map(entry => entry.libraryItemId === item.libraryItemId ? { ...entry, review } : entry))
      setNotice(review.state === 'completed' ? `已完成“${item.displayName}”的真实 VLM 审核。` : review.detail ?? 'VLM 审核未完成。')
    } catch { setNotice('无法执行 VLM 审核。请确认 VLM 连接后重试。') } finally { setReviewingId('') }
  }

  const requestClear = async () => {
    if (!window.imageWorkbench?.request) { setNotice('桌面数据服务未加载，无法清空半成品库。'); return }
    setClearing(true); setNotice('')
    try {
      const result = await window.imageWorkbench.request({ type: 'library:semifinished:clear:plan', payload: {} }) as Partial<CleanupPlan>
      const planId = result.planId
      const itemCount = result.itemCount
      const totalBytes = result.totalBytes
      if (typeof planId !== 'string' || typeof itemCount !== 'number' || !Number.isInteger(itemCount) || typeof totalBytes !== 'number' || !Number.isFinite(totalBytes)) throw new Error('LIBRARY_CLEANUP_PLAN_INVALID')
      if (itemCount === 0) {
        setCleanupPlan(null)
        setNotice('半成品库当前没有可清空的图片。')
        await refresh()
        return
      }
      setCleanupPlan({ planId, itemCount, totalBytes, expiresAt: Number(result.expiresAt ?? 0) })
    } catch {
      setCleanupPlan(null)
      setNotice('无法创建清空计划。半成品库未发生删除，请刷新后重试。')
    } finally { setClearing(false) }
  }

  const confirmClear = async () => {
    if (!cleanupPlan || !window.imageWorkbench?.request) return
    setClearing(true); setNotice('')
    try {
      const result = await window.imageWorkbench.request({ type: 'library:semifinished:clear:confirm', payload: { planId: cleanupPlan.planId } }) as { removed?: number; totalBytes?: number }
      const removed = result.removed
      const totalBytes = result.totalBytes
      if (typeof removed !== 'number' || !Number.isInteger(removed) || typeof totalBytes !== 'number' || !Number.isFinite(totalBytes)) throw new Error('LIBRARY_CLEANUP_RESULT_INVALID')
      setCleanupPlan(null)
      await refresh()
      setNotice(`已清空 ${removed} 张半成品图片，释放 ${byteLabel(totalBytes)}。`)
    } catch (error) {
      setCleanupPlan(null)
      const code = error instanceof Error ? error.message : ''
      setNotice(code === 'LIBRARY_CLEANUP_CONTENT_CHANGED'
        ? '半成品库内容已变化，未执行删除。请重新点击“清空当前内容”核对后再确认。'
        : '清空未完成，半成品库未被整体删除。请刷新后重新核对。')
    } finally { setClearing(false) }
  }

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div style={{ maxWidth: 1100 }}>
      <p className="text-secondary">这里仅显示此工作台实际归档的本地半成品；每次完成的生成图会自动保存，并写入生成参数。</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>半成品库</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => void refresh()} disabled={clearing}>刷新真实文件</button>
          <button className="btn btn-danger btn-sm" onClick={() => void requestClear()} disabled={clearing || !items.length}>{clearing ? '正在核对…' : '清空当前内容'}</button>
        </div>
      </div>
      {notice && <div className="card" style={{ marginBottom: 16, padding: 12 }}>{notice}</div>}
      {cleanupPlan && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--error)', display: 'grid', gap: 10 }}>
        <strong>二次确认：清空当前半成品库</strong>
        <div className="text-secondary">将永久删除本工作台半成品库中的 {cleanupPlan.itemCount} 张图片（{byteLabel(cleanupPlan.totalBytes)}）。不会删除 ComfyUI 输出、模型或其他文件夹。</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-danger" onClick={() => void confirmClear()} disabled={clearing}>确认清空 {cleanupPlan.itemCount} 张图片</button>
          <button className="btn btn-secondary" onClick={() => setCleanupPlan(null)} disabled={clearing}>取消</button>
        </div>
      </div>}
      {message ? <div className="empty-state"><div className="empty-state-icon">🖼️</div><div className="empty-state-text">{message}</div></div> : (
        <div className="grid grid-4">{items.map(item => <div className="card" key={item.libraryItemId}>
          {previewUrl(previews[item.libraryItemId]) ? <img src={previewUrl(previews[item.libraryItemId])} alt={item.displayName} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, display: 'block', marginBottom: 12, background: 'var(--bg-secondary)' }} /> : <button className="btn btn-secondary btn-sm" style={{ width: '100%', aspectRatio: '1 / 1', marginBottom: 12 }} onClick={() => void loadPreview(item)}>加载缩略图</button>}
          <div className="mono" title={item.displayName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.displayName}</div>
          <div className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>真实本地半成品文件</div>
          <div style={{ marginTop: 10, display: 'grid', gap: 7, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {item.review?.state === 'completed' ? <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><strong>VLM：{typeof item.review.score === 'number' ? `${item.review.score}/100` : '已完成'}</strong><span className={`badge ${item.review.pass ? 'badge-success' : 'badge-error'}`}>{item.review.pass ? '通过' : '需修改'}</span></div>
              {item.review.summary && <div className="text-secondary" style={{ fontSize: 12 }}>{item.review.summary}</div>}
              {item.review.issues?.length ? <div className="text-warning" style={{ fontSize: 12 }}>问题：{item.review.issues.join('；')}</div> : null}
              {item.review.hard_failures?.length ? <div className="text-warning" style={{ fontSize: 12 }}>硬性问题：{item.review.hard_failures.join('；')}</div> : null}
              {item.review.prompt_patch ? <button className="btn btn-secondary btn-sm" onClick={() => { if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(item.review!.prompt_patch!) }}>复制 VLM 修改建议</button> : null}
            </> : <div className="text-muted" style={{ fontSize: 12 }}>{item.review?.detail ?? '暂无 VLM 审核'}</div>}
            <button className="btn btn-secondary btn-sm" onClick={() => void reviewItem(item)} disabled={Boolean(reviewingId)}>{reviewingId === item.libraryItemId ? 'VLM 审核中…' : item.review?.state === 'completed' ? '重新执行 VLM 审核' : '执行 VLM 审核'}</button>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => void setAsReference(item)}>设为下一轮参考图</button>
        </div>)}</div>
      )}
      <div className="card" style={{ marginTop: 20 }}><div className="card-header"><h3 className="card-title">继续创作</h3></div><div className="text-muted">半成品被设为参考图后，返回工作台即可继续调整提示词、权重和轮次。</div><Link className="btn btn-primary btn-sm" style={{ marginTop: 12 }} to="/image-studio">回到生图工作台</Link></div>
    </div>
  )
}
