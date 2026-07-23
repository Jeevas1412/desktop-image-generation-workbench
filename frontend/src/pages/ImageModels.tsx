import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'

type BackendCapabilityStatus = { status?: string; reason?: string }
type Candidate = { candidateId: string; displayName: string; directoryId: string }
type ScanResult = { state?: string; candidates?: Candidate[]; queue?: { running?: number; pending?: number }; detail?: string }
type ModelSelection = { coreCandidateId: string; coreId?: string; displayName?: string; directoryId?: string; verifiedAt?: string; integrity?: string; legacy?: boolean }

const REGISTERED_CORE_LABELS: Record<string, string> = {
  'comfy.checkpoints:ponyDiffusionV6XL_v6StartWithThisOne.safetensors': 'Pony Diffusion V6 XL（动画人像）',
  'comfy.checkpoints:Illustrious-XL-v0.1.safetensors': 'Illustrious XL v0.1（动画人像）',
  'comfy.checkpoints:flux1-dev-kontext_fp8_scaled.safetensors': 'FLUX.1 Dev Kontext FP8（真实通用）',
}

function isMisplacedLora(item: Candidate) {
  return item.directoryId === 'comfy.checkpoints' && item.displayName.replace(/\\/g, '/').startsWith('_misplaced_from_loras/')
}

function unavailableReason(value: unknown) {
  const result = value as BackendCapabilityStatus
  if (result?.status === 'saved' && result?.reason === 'COMFYUI_PROFILE_SAVED') return 'ComfyUI 配置已保存且近期通过验证。点击“读取真实状态”重新读取真实模型候选与队列。'
  if (result?.status === 'stale' && result?.reason === 'COMFYUI_PROFILE_STALE') return 'ComfyUI 配置仍保留，但最近验证已过期。请点击“读取真实状态”重新进行只读检查。'
  if (result?.reason === 'IMAGE_BACKEND_PROFILE_NOT_CONFIGURED') return '尚未连接 ComfyUI。请先在“连接 ComfyUI”页面完成只读连接检查。'
  if (typeof result?.reason === 'string') return result.reason
  return '尚未获得真实能力扫描结果。'
}

export default function ImageModels() {
  const { t } = useLanguage()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('正在读取本机工作台状态…')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [selection, setSelection] = useState<ModelSelection | null>(null)
  const [selectedCoreId, setSelectedCoreId] = useState('')

  const refresh = useCallback(async () => {
    if (!window.imageWorkbench?.request) {
      setMessage('桌面数据服务未加载。请从已安装的“DGX 智能生图工作台”启动本页。')
      return
    }
    setLoading(true)
    try {
      const result = await window.imageWorkbench.request({ type: 'image:capabilities:get', payload: {} })
      setMessage(unavailableReason(result))
    } catch {
      setMessage('无法读取真实能力状态。ComfyUI 未连接、应用未配置或本机后台发生错误。')
    } finally { setLoading(false) }
  }, [])

  const scanNow = async () => {
    if (!window.imageWorkbench?.request) return
    setLoading(true); setScan(null)
    try { const value = await window.imageWorkbench.request({ type: 'comfyui:readonly:scan', payload: {} }) as ScanResult; setScan(value); setMessage(value.state === 'reachable' ? '已读取真实 ComfyUI 节点、模型候选与队列状态。请选择一个检查点并保存为生图核心。' : value.detail ?? '尚未获得真实扫描结果。') } catch { setMessage('真实扫描失败；请重新检查连接。') } finally { setLoading(false) }
  }

  const saveCore = async () => {
    if (!selectedCoreId || !window.imageWorkbench?.request) return
    setLoading(true)
    try {
      const value = await window.imageWorkbench.request({ type: 'model:selection:save', payload: { selection: { coreCandidateId: selectedCoreId } } }) as ModelSelection
      setSelection(value)
      setMessage(`已选择生图核心：${value.displayName ?? value.coreCandidateId}。现在可以进入生图工作台。`)
      window.dispatchEvent(new Event('image-workbench:model-selection-saved'))
    } catch { setMessage('无法保存此选择。请先重新读取真实状态，再选择扫描结果中的检查点。') } finally { setLoading(false) }
  }

  useEffect(() => {
    void refresh()
    void (async () => {
      if (!window.imageWorkbench?.request) return
      try {
        const value = await window.imageWorkbench.request({ type: 'model:selection:get', payload: {} }) as ModelSelection | null
        setSelection(value)
        setSelectedCoreId(value?.coreCandidateId ?? '')
      } catch { setSelection(null) }
    })()
    if (new URLSearchParams(location.search).get('scan') === '1') void scanNow()
  }, [location.search, refresh])

  const candidates = scan?.candidates ?? []
  const coreModels = candidates.filter((item) => item.directoryId === 'comfy.checkpoints' && !isMisplacedLora(item))
  const registeredCoreModels = coreModels.filter((item) => Boolean(REGISTERED_CORE_LABELS[item.candidateId]))
  const unverifiedCheckpoints = coreModels.filter((item) => !REGISTERED_CORE_LABELS[item.candidateId])
  const loras = candidates.filter((item) => item.directoryId.startsWith('comfy.loras'))
  const misplacedLoras = candidates.filter(isMisplacedLora)
  const otherResources = candidates.filter((item) => !coreModels.includes(item) && !loras.includes(item) && !misplacedLoras.includes(item))

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <p className="text-secondary">此页面仅显示真实 ComfyUI 扫描结果与受控下载任务；不会显示示例模型、模拟速度或虚构失败记录。</p>
      </div>

      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="section-title" style={{ marginBottom: 0, border: 'none', padding: 0 }}>{t.capability.title}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => void scanNow()} disabled={loading}>
            {loading ? '读取中…' : '读取真实状态'}
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">🔌</div>
          <div className="empty-state-text">{message}</div>
          <div className="empty-state-hint">连接成功后，这里会显示由固定 ComfyUI 接口发现的候选与兼容性状态。</div>
        </div>
        {scan?.state === 'reachable' && <div className="card" style={{ marginTop: 14 }}>
          <div className="text-muted">队列：运行 {scan.queue?.running ?? 0}，等待 {scan.queue?.pending ?? 0}；发现已登记核心 {registeredCoreModels.length} 个、未验证检查点 {unverifiedCheckpoints.length} 个、LoRA {loras.length} 个。</div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6 }}><span>生图核心（已登记基础检查点）</span><select className="input" value={selectedCoreId} onChange={(event) => setSelectedCoreId(event.target.value)}><option value="">请选择一个已登记核心</option>{registeredCoreModels.map((item) => <option key={item.candidateId} value={item.candidateId}>{REGISTERED_CORE_LABELS[item.candidateId]}</option>)}</select></label>
            <button className="btn btn-primary" onClick={() => void saveCore()} disabled={loading || !selectedCoreId}>保存为生图核心</button>
          </div>
          {selection && <p className="text-secondary" style={{ marginBottom: 0 }}>{selection.legacy ? <>当前保存的是旧版选择，需重新选择已登记核心后才可生成。</> : <>当前已登记：<code>{selection.displayName ?? selection.coreCandidateId}</code>{selection.verifiedAt ? `；工作流验证时间：${new Date(selection.verifiedAt).toLocaleString('zh-CN')}` : ''}</>}</p>}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-header"><h3 className="card-title">已登记生图核心</h3><span className="badge badge-success">{registeredCoreModels.length}</span></div>
            <p className="text-secondary">仅三套随工作台交付的工作流核心可绑定；保存时会核对其必须的 VAE、UNet 与文本编码器。ComfyUI 的只读接口不提供模型 SHA-256，因此这里验证的是“工作流兼容性”，不是文件完整性签名。</p>
            <div style={{ display: 'grid', gap: 6 }}>{registeredCoreModels.map((item) => <div className="mono" key={item.candidateId}>registered · {REGISTERED_CORE_LABELS[item.candidateId]} · {item.displayName}</div>)}</div>
          </div>
          {unverifiedCheckpoints.length > 0 && <details style={{ marginTop: 14 }}><summary className="text-warning">未验证检查点（{unverifiedCheckpoints.length}，不可绑定为生图核心）</summary><p className="text-secondary">这些文件来自真实扫描，但不在本工作台的已登记工作流中。它们不会被误显示为可用核心。</p><div style={{ display: 'grid', gap: 6 }}>{unverifiedCheckpoints.map((item) => <div className="mono" key={item.candidateId}>unverified · {item.displayName}</div>)}</div></details>}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-header"><h3 className="card-title">LoRA 与适配器</h3><span className="badge badge-info">{loras.length}</span></div>
            <p className="text-secondary">LoRA 是叠加在已选核心上的可选微调资源；请在“生图工作台”中单独选择并填写权重。</p>
            {misplacedLoras.length > 0 && <p className="text-warning">发现 {misplacedLoras.length} 个 LoRA 位于检查点候选中（`_misplaced_from_loras`）。它们不会作为生图核心，也不会出现在核心下拉框中。</p>}
            <details><summary className="text-secondary">展开查看已发现的 LoRA（前 60 个）</summary><div style={{ marginTop: 10, display: 'grid', gap: 6 }}>{loras.slice(0, 60).map((item) => <div className="mono" key={item.candidateId}>LoRA · {item.displayName}</div>)}{loras.length > 60 && <div className="text-muted">其余 {loras.length - 60} 个 LoRA 可在生图工作台点击“读取真实 LoRA”后选择。</div>}</div></details>
          </div>
          {otherResources.length > 0 && <details style={{ marginTop: 14 }}><summary className="text-muted">其他真实资源（{otherResources.length}）</summary><div style={{ marginTop: 10, display: 'grid', gap: 6 }}>{otherResources.map((item) => <div className="mono" key={item.candidateId}>{item.directoryId} · {item.displayName}</div>)}</div></details>}
        </div>}
      </div>

      <div className="section">
        <h2 className="section-title">{t.download.title}</h2>
        <p className="text-secondary" style={{ marginBottom: 16 }}>当前没有真实下载任务。</p>
        <div className="empty-state">
          <div className="empty-state-icon">📥</div>
          <div className="empty-state-text">暂无真实下载任务</div>
          <div className="empty-state-hint">真实下载器接线完成前，不会展示或执行任何下载、暂停、重试或哈希失败操作。</div>
        </div>
      </div>
    </div>
  )
}
