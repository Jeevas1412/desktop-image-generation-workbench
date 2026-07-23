import { useCallback, useEffect, useState } from 'react'

type Attempt = { round: number; seed: number; promptId: string; state: string }
type Job = { jobId: string; state: string; submittedAt?: string; engine?: string; currentRound?: number; rounds?: number; message?: string; attempts?: Attempt[] }

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [message, setMessage] = useState('正在读取本工作台已保存的真实任务记录…')
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async () => {
    if (!window.imageWorkbench?.request) { setMessage('桌面数据服务未加载。'); return }
    setLoading(true)
    try {
      const value = await window.imageWorkbench.request({ type: 'image:jobs:list', payload: {} })
      const records = Array.isArray(value) ? value as Job[] : []
      setJobs(records)
      setMessage(records.length ? '' : '暂无由本工作台创建的真实任务记录。')
    } catch { setMessage('无法读取任务记录。不会显示示例任务。') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return <div style={{ maxWidth: 980 }}>
    <p className="text-secondary">这里只显示本工作台创建的真实任务记录。应用重启时不会重新提交、取消或清空 ComfyUI；未终态任务会标记为需要到 ComfyUI history 核对。</p>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><h2 className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>任务记录</h2><button className="btn btn-secondary btn-sm" onClick={() => void refresh()} disabled={loading}>{loading ? '读取中…' : '刷新真实记录'}</button></div>
    {message ? <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">{message}</div></div> : <div style={{ display: 'grid', gap: 12 }}>{jobs.map(job => <article className="card" key={job.jobId}>
      <div className="card-header"><h3 className="card-title">{job.jobId}</h3><span className={`badge ${job.state === 'completed' ? 'badge-success' : job.state === 'handoff_required' ? 'badge-warning' : ['failed', 'partial_failed'].includes(job.state) ? 'badge-error' : 'badge-info'}`}>{job.state}</span></div>
      <div className="text-secondary">{job.message}</div><div className="text-muted" style={{ marginTop: 8 }}>{job.engine ?? 'unknown'} · 第 {job.currentRound ?? 0}/{job.rounds ?? 0} 轮 · {job.submittedAt ?? '时间未记录'}</div>
      {job.state === 'handoff_required' && <div className="text-warning" style={{ marginTop: 10 }}>请在 ComfyUI 的 history 中按下列 prompt ID 核对。本工作台没有在启动时对它们发送任何写入、取消或重提操作。</div>}
      {job.attempts?.length ? <details style={{ marginTop: 10 }}><summary>查看已保存的轮次与 prompt ID</summary><div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{job.attempts.map(attempt => <div className="mono" key={`${attempt.round}-${attempt.promptId}`}>第 {attempt.round} 轮 · Seed {attempt.seed} · {attempt.state} · {attempt.promptId}</div>)}</div></details> : null}
    </article>)}</div>}
  </div>
}
