import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EMPTY_PROMPT_STRUCTURE, PROMPT_PARTS, appendPrompt, composePromptStructure, type PromptPartKey, type PromptStructure } from '../lib/prompt-structure'
import { lorasForEngine, type SupportedGenerationEngine } from '../lib/lora-compatibility'
import './ImageStudio.css'

type BackendStatus = { status?: string; reason?: string }
type ModelSelection = { coreCandidateId: string; coreId?: string; displayName?: string; legacy?: boolean }
type Candidate = { displayName: string; directoryId: string }
type ScanResult = { state?: string; candidates?: Candidate[] }
type OutputImage = { filename: string; subfolder: string; type: string; libraryItemId?: string }
type VlmReview = { state: 'completed' | 'unavailable' | 'failed'; detail?: string; model?: string; score?: number; pass?: boolean; issues?: string[]; hard_failures?: string[]; summary?: string; prompt_patch?: string }
type Attempt = { round: number; seed: number; promptId: string; state: string; outputs?: OutputImage[]; review?: VlmReview }
type Job = { jobId: string; state: string; engine?: string; rounds: number; currentRound: number; message?: string; stopRequested?: boolean; attempts?: Attempt[] }
type ReferenceHandle = { referenceId: string; displayName: string }
type ReferencePreview = { mimeType: string; base64: string }

const resolutions = [
  { label: '512 × 512', width: 512, height: 512 },
  { label: '640 × 640', width: 640, height: 640 },
  { label: '640 × 960（竖图）', width: 640, height: 960 },
  { label: '960 × 640（横图）', width: 960, height: 640 },
  { label: '1024 × 1024', width: 1024, height: 1024 },
]

const DRAFT_STORAGE_KEY = 'dgx-image-workbench:image-studio-draft:v1'
const ponySourceOptions = [
  { value: '', label: '不附加风格来源标签' },
  { value: 'source_anime', label: '动画风格（source_anime）' },
  { value: 'source_cartoon', label: '卡通风格（source_cartoon）' },
  { value: 'source_furry', label: '拟兽风格（source_furry）' },
  { value: 'source_pony', label: 'Pony 原生风格（source_pony）' },
] as const
const ponyRatingOptions = [
  { value: '', label: '不附加内容分级标签' },
  { value: 'rating_safe', label: '通用（rating_safe）' },
  { value: 'rating_questionable', label: '敏感（rating_questionable）' },
  { value: 'rating_explicit', label: 'Explicit（rating_explicit）' },
] as const

type PonySourceTag = typeof ponySourceOptions[number]['value']
type PonyRatingTag = typeof ponyRatingOptions[number]['value']

function supportedEngine(selection: ModelSelection | null): SupportedGenerationEngine | null {
  if (selection?.coreCandidateId === 'comfy.checkpoints:ponyDiffusionV6XL_v6StartWithThisOne.safetensors') return 'pony'
  if (selection?.coreCandidateId === 'comfy.checkpoints:Illustrious-XL-v0.1.safetensors') return 'illustrious'
  if (selection?.coreCandidateId === 'comfy.checkpoints:flux1-dev-kontext_fp8_scaled.safetensors') return 'flux'
  return null
}

function engineLabel(engine: SupportedGenerationEngine | null) {
  if (engine === 'pony') return 'Pony Diffusion 动画人像'
  if (engine === 'illustrious') return 'Illustrious XL 动画人像'
  if (engine === 'flux') return 'FLUX.1 Dev 真实通用'
  return ''
}

function loraArchitectureLabel(engine: SupportedGenerationEngine | null) {
  return engine === 'flux' ? 'Flux' : 'SDXL'
}

function copyReviewPatch(value: string) {
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(value)
}

function VlmReviewPanel({ review, generating }: { review?: VlmReview; generating: boolean }) {
  if (!review) return generating ? <div className="studio-vlm-review text-muted">VLM 审核：等待本轮图像完成。</div> : null
  if (review.state !== 'completed') return <div className="studio-vlm-review text-muted">{review.detail ?? 'VLM 审核未运行。'}</div>
  return <div className="studio-vlm-review">
    <div className="studio-vlm-review-header"><strong>VLM 审核：{typeof review.score === 'number' ? `${review.score}/100` : '已完成'}</strong><span className={`badge ${review.pass ? 'badge-success' : 'badge-error'}`}>{review.pass ? '通过' : '需修改'}</span></div>
    {review.summary && <p className="text-secondary">{review.summary}</p>}
    {review.issues?.length ? <ul className="studio-vlm-issues">{review.issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul> : null}
    {review.hard_failures?.length ? <p className="text-warning">硬性问题：{review.hard_failures.join('；')}</p> : null}
    {review.prompt_patch && <div className="studio-vlm-patch"><code>{review.prompt_patch}</code><button className="btn btn-secondary btn-sm" onClick={() => copyReviewPatch(review.prompt_patch!)}>复制 VLM 修改建议</button></div>}
    {review.model && <div className="text-muted studio-vlm-model">审核模型：{review.model}</div>}
  </div>
}

export default function ImageStudio() {
  const [status, setStatus] = useState('正在读取真实后端状态…')
  const [configured, setConfigured] = useState(false)
  const [selection, setSelection] = useState<ModelSelection | null>(null)
  const [prompt, setPrompt] = useState('')
  const [promptStructure, setPromptStructure] = useState<PromptStructure>(EMPTY_PROMPT_STRUCTURE)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [resolutionIndex, setResolutionIndex] = useState(1)
  const [steps, setSteps] = useState(24)
  const [guidance, setGuidance] = useState(6)
  const [seed, setSeed] = useState(1)
  const [rounds, setRounds] = useState<5 | 25>(5)
  const [seedMode, setSeedMode] = useState<'locked' | 'increment' | 'range_increment'>('increment')
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(9999)
  const [reference, setReference] = useState<ReferenceHandle | null>(null)
  const [referencePreview, setReferencePreview] = useState<ReferencePreview | null>(null)
  const [referenceStrength, setReferenceStrength] = useState(0.1)
  const [referenceMode, setReferenceMode] = useState<'redraw' | 'reference_only'>('redraw')
  const [loraName, setLoraName] = useState('')
  const [loraModelStrength, setLoraModelStrength] = useState(0.8)
  const [loraClipStrength, setLoraClipStrength] = useState(0.8)
  const [ponySourceTag, setPonySourceTag] = useState<PonySourceTag>('')
  const [ponyRatingTag, setPonyRatingTag] = useState<PonyRatingTag>('')
  const [loras, setLoras] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [outputPreviews, setOutputPreviews] = useState<Record<string, ReferencePreview>>({})
  const [translatedPrompt, setTranslatedPrompt] = useState('')
  const [translationStatus, setTranslationStatus] = useState('')
  const [translating, setTranslating] = useState(false)
  const [startFeedback, setStartFeedback] = useState('')
  const [draftHydrated, setDraftHydrated] = useState(false)

  const engine = useMemo(() => supportedEngine(selection), [selection])
  const selectedEngineLabel = engineLabel(engine)
  const loraArchitecture = loraArchitectureLabel(engine)
  const resolution = resolutions[resolutionIndex]
  const structuredDraft = useMemo(() => composePromptStructure(promptStructure), [promptStructure])

  const updatePromptPart = (key: PromptPartKey, value: string) => {
    setPromptStructure(current => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      const saved = raw ? JSON.parse(raw) as Record<string, unknown> : null
      if (!saved || typeof saved !== 'object') return
      if (typeof saved.prompt === 'string') setPrompt(saved.prompt)
      if (typeof saved.negativePrompt === 'string') setNegativePrompt(saved.negativePrompt)
      if (typeof saved.translatedPrompt === 'string') setTranslatedPrompt(saved.translatedPrompt)
      if (Number.isInteger(saved.resolutionIndex) && Number(saved.resolutionIndex) >= 0 && Number(saved.resolutionIndex) < resolutions.length) setResolutionIndex(Number(saved.resolutionIndex))
      for (const [key, setter, fallback, min, max] of [
        ['steps', setSteps, 24, 1, 80], ['guidance', setGuidance, 6, 0, 30], ['seed', setSeed, 1, 0, 4294967295],
        ['rangeStart', setRangeStart, 1, 0, 4294967295], ['rangeEnd', setRangeEnd, 9999, 0, 4294967295],
        ['referenceStrength', setReferenceStrength, 0.1, 0, 0.5], ['loraModelStrength', setLoraModelStrength, 0.8, -2, 2], ['loraClipStrength', setLoraClipStrength, 0.8, -2, 2],
      ] as const) { const value = Number(saved[key]); if (Number.isFinite(value) && value >= min && value <= max) setter(value); else void fallback }
      if (saved.rounds === 5 || saved.rounds === 25) setRounds(saved.rounds)
      if (saved.seedMode === 'locked' || saved.seedMode === 'increment' || saved.seedMode === 'range_increment') setSeedMode(saved.seedMode)
      if (saved.referenceMode === 'redraw' || saved.referenceMode === 'reference_only') setReferenceMode(saved.referenceMode)
      if (ponySourceOptions.some(option => option.value === saved.ponySourceTag)) setPonySourceTag(saved.ponySourceTag as PonySourceTag)
      if (ponyRatingOptions.some(option => option.value === saved.ponyRatingTag)) setPonyRatingTag(saved.ponyRatingTag as PonyRatingTag)
      if (saved.promptStructure && typeof saved.promptStructure === 'object') {
        const source = saved.promptStructure as Record<string, unknown>
        const restored = { ...EMPTY_PROMPT_STRUCTURE }
        for (const key of Object.keys(restored) as PromptPartKey[]) if (typeof source[key] === 'string') restored[key] = source[key] as string
        setPromptStructure(restored)
      }
    } catch { localStorage.removeItem(DRAFT_STORAGE_KEY) } finally { setDraftHydrated(true) }
  }, [])

  useEffect(() => {
    if (!draftHydrated) return
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ prompt, promptStructure, negativePrompt, translatedPrompt, resolutionIndex, steps, guidance, seed, rounds, seedMode, rangeStart, rangeEnd, referenceStrength, referenceMode, loraModelStrength, loraClipStrength, ponySourceTag, ponyRatingTag }))
  }, [draftHydrated, prompt, promptStructure, negativePrompt, translatedPrompt, resolutionIndex, steps, guidance, seed, rounds, seedMode, rangeStart, rangeEnd, referenceStrength, referenceMode, loraModelStrength, loraClipStrength, ponySourceTag, ponyRatingTag])

  const clearLocalDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setPrompt(''); setPromptStructure({ ...EMPTY_PROMPT_STRUCTURE }); setNegativePrompt(''); setTranslatedPrompt('')
    setResolutionIndex(1); setSteps(24); setGuidance(engine === 'flux' ? 3.5 : 6); setSeed(1); setRounds(5); setSeedMode('increment'); setRangeStart(1); setRangeEnd(9999)
    setReferenceStrength(0.1); setReferenceMode('redraw'); setLoraModelStrength(0.8); setLoraClipStrength(0.8); setPonySourceTag(''); setPonyRatingTag('')
  }

  const appendStructuredDraft = () => {
    if (!structuredDraft) return
    setPrompt(current => appendPrompt(current, structuredDraft))
  }

  const translateDraft = async () => {
    const source = (structuredDraft || prompt).trim()
    if (!source || !window.imageWorkbench?.request) return
    setTranslating(true); setTranslationStatus('正在请求已连接的 VLM 翻译…')
    try {
      const result = await window.imageWorkbench.request({ type: 'prompt:translate', payload: { text: source } }) as { prompt?: string; model?: string }
      if (!result?.prompt) throw new Error('TRANSLATION_EMPTY')
      setTranslatedPrompt(result.prompt)
      setTranslationStatus(`翻译完成（${result.model ?? 'VLM'}）。请确认后写入正面提示词。`)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN'
      setTranslationStatus(code === 'TRANSLATION_VLM_TIMEOUT' ? '翻译服务响应超时；VLM 可能正在处理其他工作，请稍后重试。' : `翻译失败：${code}`)
    } finally { setTranslating(false) }
  }

  useEffect(() => {
    const load = async () => {
      if (!window.imageWorkbench?.request) { setStatus('桌面数据服务未加载。请从已安装的工作台启动。'); return }
      try {
        const value = await window.imageWorkbench.request({ type: 'image:capabilities:get', payload: {} }) as BackendStatus
        const isConfigured = ['configured', 'saved', 'stale'].includes(String(value.status))
        setConfigured(isConfigured)
        const modelSelection = isConfigured ? await window.imageWorkbench.request({ type: 'model:selection:get', payload: {} }) as ModelSelection | null : null
        setSelection(modelSelection)
        setStatus(isConfigured && modelSelection
          ? modelSelection.legacy || !modelSelection.coreId
            ? '已保存的核心来自旧版本，需在“模型与下载”重新选择并完成当前工作流验证后才能生成。'
            : `已选择并登记生图核心：${modelSelection.displayName ?? modelSelection.coreCandidateId}。提交前仍会重新读取 ComfyUI 队列和依赖资源。`
          : isConfigured
            ? value.status === 'stale' ? 'ComfyUI 配置的最近验证已过期；请先在“连接 ComfyUI”复核，再选择生图核心。' : 'ComfyUI 配置已保存，但尚未选择生图核心。'
            : value.reason === 'IMAGE_BACKEND_PROFILE_NOT_CONFIGURED'
              ? 'ComfyUI 尚未完成真实 Profile 配置，生成已禁用。'
              : '尚未获得可用于真实生成的能力状态。')
      } catch { setConfigured(false); setSelection(null); setStatus('无法读取真实生成状态，生成已禁用。') }
    }
    void load()
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem('dgx-image-workbench:selected-reference')
    if (!stored) return
    try {
      const selected = JSON.parse(stored) as ReferenceHandle
      if (typeof selected.referenceId === 'string' && /^ref_[A-Za-z0-9_-]+$/.test(selected.referenceId) && typeof selected.displayName === 'string') {
        setReference(selected)
        sessionStorage.removeItem('dgx-image-workbench:selected-reference')
      }
    } catch { sessionStorage.removeItem('dgx-image-workbench:selected-reference') }
  }, [])

  useEffect(() => {
    if (!reference || !window.imageWorkbench?.previewReference) { setReferencePreview(null); return }
    let active = true
    void window.imageWorkbench.previewReference(reference.referenceId)
      .then((preview) => { if (active) setReferencePreview(preview) })
      .catch(() => { if (active) setReferencePreview(null) })
    return () => { active = false }
  }, [reference?.referenceId])

  const loadOutputPreview = async (libraryItemId: string) => {
    if (!window.imageWorkbench?.previewLibraryItem || outputPreviews[libraryItemId]) return
    try {
      const preview = await window.imageWorkbench.previewLibraryItem(libraryItemId)
      setOutputPreviews(current => ({ ...current, [libraryItemId]: preview }))
    } catch { setStatus('无法读取该输出的缩略图；原图没有被自动载入页面。') }
  }

  useEffect(() => {
    if (engine === 'flux') setGuidance((current) => current === 6 ? 3.5 : current)
  }, [engine])

  const readLoras = async () => {
    if (!window.imageWorkbench?.request || !engine) return
    setLoading(true)
    try {
      const scan = await window.imageWorkbench.request({ type: 'comfyui:readonly:scan', payload: {} }) as ScanResult
      if (scan.state !== 'reachable') throw new Error('scan unavailable')
      window.dispatchEvent(new Event('image-workbench:comfyui-reachable'))
      const compatible = lorasForEngine(scan.candidates ?? [], engine)
      setLoras(compatible)
      setLoraName(current => compatible.includes(current) ? current : '')
      setStatus(compatible.length ? `已从真实 ComfyUI 筛出 ${compatible.length} 个可用于 ${selectedEngineLabel} 的 ${loraArchitecture} LoRA。` : `没有发现可用于 ${selectedEngineLabel} 的 ${loraArchitecture} LoRA。`)
    } catch { setStatus('无法读取真实 LoRA 列表。请先检查 ComfyUI 连接。') } finally { setLoading(false) }
  }

  const chooseReference = async () => {
    if (!window.imageWorkbench?.pickReference) { setStatus('此安装版本尚未加载本机参考图选择器。'); return }
    try {
      const selected = await window.imageWorkbench.pickReference()
      if (selected) setReference(selected)
    } catch { setStatus('无法选择参考图。请使用 PNG、JPG 或 WebP。') }
  }

  const start = async () => {
    if (!window.imageWorkbench?.request) {
      const message = '桌面数据服务尚未加载，无法提交真实生图。请从已安装的工作台启动后重试。'
      setStatus(message); setStartFeedback(message)
      return
    }
    if (!configured || !selection || !engine) {
      const message = '尚未完成真实生图核心的连接与验证，未提交任务。请先在“模型与下载”中选择已验证的 Pony 或 Illustrious 核心。'
      setStatus(message); setStartFeedback(message)
      return
    }
    if (!prompt.trim()) {
      const message = '尚未填写正面提示词，未提交任务。请直接填写英文提示词，或先点击“翻译为英文”并选择“写入正面提示词”。'
      setStatus(message); setStartFeedback(message)
      return
    }
    setLoading(true); setStartFeedback('正在检查真实 ComfyUI 队列并创建任务…')
    try {
      const value = await window.imageWorkbench.request({
        type: 'image:job:start',
        payload: { generation: { prompt, negativePrompt, width: resolution.width, height: resolution.height, steps, guidance, seed, rounds, seedMode, rangeStart, rangeEnd, referenceId: reference?.referenceId ?? '', referenceStrength, referenceMode, loraName, loraModelStrength, loraClipStrength, ponySourceTag, ponyRatingTag } },
      }) as Job
      setJob(value)
      // A successful start has passed the same read-only ComfyUI preflight as
      // the backend submission path.  Notify the shared header immediately;
      // its periodic probe will continue to verify the state afterwards.
      window.dispatchEvent(new Event('image-workbench:comfyui-reachable'))
      const message = `真实 ComfyUI 已创建 ${rounds} 轮任务。任务会逐轮串行提交；不会中断任何既有任务或 VLM。`
      setStatus(message); setStartFeedback(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN'
      const readable: Record<string, string> = {
        GENERATION_QUEUE_NOT_IDLE: 'ComfyUI 队列当前不为空。为避免影响其他工作，本工作台没有提交任务。',
        GENERATION_CORE_NOT_YET_SUPPORTED: '当前选中的核心尚无已验证工作流。请改选 Pony、Illustrious 或 FLUX.1 Dev。',
        GENERATION_VAE_NOT_DISCOVERED: '未在真实 ComfyUI 中发现当前核心需要的 VAE，未提交任务。',
        GENERATION_FLUX_UNET_NOT_DISCOVERED: 'Flux 核心缺少已发现的 flux1-dev-kontext_fp8_scaled UNET，未提交任务。',
        GENERATION_FLUX_TEXT_ENCODER_NOT_DISCOVERED: 'Flux 核心缺少 clip_l 或 t5xxl_fp16 文本编码器，未提交任务。',
        GENERATION_LORA_NOT_DISCOVERED: '所选 LoRA 不在最新的真实扫描结果中，未提交任务。',
        GENERATION_LORA_INCOMPATIBLE: '所选 LoRA 与当前核心架构不匹配，未提交任务。请重新读取并从对应的 SDXL 或 Flux 列表中选择。',
      }
      const display = readable[message] ?? `真实提交失败：${message}`
      setStatus(display); setStartFeedback(display)
    } finally { setLoading(false) }
  }

  const refreshJob = async () => {
    if (!job || !window.imageWorkbench?.request) return
    setLoading(true)
    try {
      const value = await window.imageWorkbench.request({ type: 'image:job:get', payload: { jobId: job.jobId } }) as Job
      setJob(value)
      setStatus(`真实任务状态：${value.state}；当前 ${value.currentRound}/${value.rounds} 轮。${value.message ?? ''}`)
    } catch (error) { setStatus(`无法读取真实任务状态：${error instanceof Error ? error.message : 'UNKNOWN'}`) } finally { setLoading(false) }
  }

  const stopJob = async () => {
    if (!job || !window.imageWorkbench?.request) return
    setLoading(true)
    try {
      const value = await window.imageWorkbench.request({ type: 'image:job:stop', payload: { jobId: job.jobId } }) as Job
      setJob(value)
      setStatus(value.message ?? '已请求停止后续轮次。')
    } catch (error) { setStatus(`无法停止任务：${error instanceof Error ? error.message : 'UNKNOWN'}`) } finally { setLoading(false) }
  }

  const canSubmit = configured && Boolean(selection?.coreId) && !selection?.legacy && Boolean(engine)

  useEffect(() => {
    if (!job || ['completed', 'partial_failed', 'failed', 'stopped'].includes(job.state)) return
    const timer = window.setInterval(() => { void refreshJob() }, 2_000)
    return () => window.clearInterval(timer)
  // The poller follows only an active job, not ordinary field edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.jobId, job?.state])
  return (
    <div className="studio-page">
      <p className="text-secondary">此页面只会提交经固定 ComfyUI 接口验证过的真实任务；提交前会再次确认模型、VAE、LoRA 与队列状态。不会显示模拟进度、虚构 VLM 分数或假图。</p>
      <div className="studio-workbench"><section className="studio-input-column"><div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h3 className="card-title">真实生图工作台</h3></div>
        <p className="text-secondary">{status}</p>
        {!canSubmit && <div style={{ display: 'flex', gap: 8 }}><Link className="btn btn-primary" to={configured ? '/image-models?scan=1' : '/comfyui-connection'}>{configured ? '选择已验证的生图核心' : '连接 ComfyUI'}</Link></div>}
        {configured && selection && !engine && <p className="text-warning">当前核心已保存，但尚未有已验证的真实工作流。请在模型与下载页面改选 Pony、Illustrious 或 FLUX.1 Dev。</p>}
        {canSubmit && <div style={{ display: 'grid', gap: 16 }}>
          <div className="card" style={{ margin: 0, borderColor: 'var(--accent)' }}>
            <div className="card-header"><h3 className="card-title">当前生图核心</h3><span className="badge badge-success">已登记工作流</span></div>
            <strong style={{ fontSize: 18 }}>{selectedEngineLabel}</strong>
            <div className="text-secondary" style={{ marginTop: 6 }}>当前核心文件：<code>{selection?.coreCandidateId.replace('comfy.checkpoints:', '')}</code></div>
            <div className="text-muted" style={{ marginTop: 6 }}>切换核心请到“模型与下载”保存新的已登记核心；LoRA 不是生图核心。</div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header" style={{ marginBottom: 8 }}><h3 className="card-title">影视提示词引导</h3></div>
            <p className="text-secondary" style={{ marginBottom: 14 }}>按镜头语言逐项补全。填写内容会按“主体 → 动作 → 场景 → 景别 → 视角 → 光线 → 色调 → 镜头/景深 → 构图 → 风格与画质”组成草稿；不会自动覆盖你手写的正面提示词。</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {PROMPT_PARTS.map(part => <label key={part.key} style={{ display: 'grid', gap: 5 }}>
                <span>{part.label}</span>
                <input value={promptStructure[part.key]} onChange={event => updatePromptPart(part.key, event.target.value)} placeholder={part.placeholder} />
                <span className="text-muted" style={{ fontSize: 12 }}>{part.hint}</span>
              </label>)}
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <span className="text-secondary">引导草稿预览（保留中文仅供编辑；实际提交前请使用英文提示词或完成翻译）：</span>
              <div className="mono" style={{ minHeight: 44, padding: 10, border: '1px solid var(--border)', borderRadius: 8, color: structuredDraft ? 'var(--text-primary)' : 'var(--text-muted)' }}>{structuredDraft || '填写上方任意字段后，会在此处显示按影视提示词顺序组合的草稿。'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={appendStructuredDraft} disabled={!structuredDraft}>追加到正面提示词</button>
                <button className="btn btn-secondary" onClick={() => setPromptStructure(EMPTY_PROMPT_STRUCTURE)} disabled={!structuredDraft}>清空引导字段</button>
                <button className="btn btn-secondary" onClick={clearLocalDraft}>清空本机草稿</button>
              </div>
            </div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header"><h3 className="card-title">提示词翻译</h3><span className="badge badge-info">中文 → 英文</span></div>
            <p className="text-secondary">翻译上方“引导草稿”，若草稿为空则翻译当前正面提示词。只在点击时请求 VLM，不会修改原文。</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => void translateDraft()} disabled={translating || !(structuredDraft || prompt).trim()}>{translating ? '翻译中…' : '翻译为英文'}</button>
              <button className="btn btn-primary" onClick={() => setPrompt(translatedPrompt)} disabled={!translatedPrompt || translating}>写入正面提示词</button>
              {translationStatus && <span className="text-muted">{translationStatus}</span>}
            </div>
            <textarea rows={4} value={translatedPrompt} onChange={event => setTranslatedPrompt(event.target.value)} placeholder="翻译结果会显示在这里；你可以编辑后再写入正面提示词。" style={{ marginTop: 12 }} />
          </div>
          <label style={{ display: 'grid', gap: 6 }}><span>正面提示词（必填）</span><textarea rows={5} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="使用英文提示词；翻译服务接线前不会把中文伪装成已翻译。" /></label>
          <label style={{ display: 'grid', gap: 6 }}><span>负面提示词（可选，默认无）</span><textarea rows={3} value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} placeholder="留空即不附加负面提示词" /></label>
          {engine === 'pony' && <div className="card" style={{ margin: 0 }}>
            <div className="card-header"><h3 className="card-title">Pony 画面风格与内容分级</h3><span className="badge badge-info">写入 Pony 标签</span></div>
            <p className="text-secondary">仅在 Pony 核心下显示。选择项会作为 <code>source_*</code> 与 <code>rating_*</code> 标签追加到实际提交的正面提示词，不会替换你的文字。</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}><span>画面风格</span><select value={ponySourceTag} onChange={event => setPonySourceTag(event.target.value as PonySourceTag)}>{ponySourceOptions.map(option => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}</select></label>
              <label style={{ display: 'grid', gap: 6 }}><span>内容分级</span><select value={ponyRatingTag} onChange={event => setPonyRatingTag(event.target.value as PonyRatingTag)}>{ponyRatingOptions.map(option => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}</select></label>
            </div>
          </div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}><span>分辨率</span><select value={resolutionIndex} onChange={event => setResolutionIndex(Number(event.target.value))}>{resolutions.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select></label>
            <label style={{ display: 'grid', gap: 6 }}><span>步数</span><input type="number" min={1} max={80} value={steps} onChange={event => setSteps(Number(event.target.value))} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span>引导值 CFG</span><input type="number" min={0} max={30} step="0.1" value={guidance} onChange={event => setGuidance(Number(event.target.value))} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span>Seed</span><input type="number" min={0} max={4294967295} value={seed} onChange={event => setSeed(Number(event.target.value))} /></label>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header"><h3 className="card-title">参考图（可选）</h3><span className="badge badge-info">提示词优先</span></div>
            <p className="text-secondary">参考图用于特征参考或全身重绘；它不会替代你的提示词，也不会被当作核心模型。</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 12, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 6 }}><span>已选文件</span><input value={reference?.displayName ?? '未添加参考图'} readOnly /></label>
              <button className="btn btn-secondary" onClick={() => void chooseReference()} disabled={loading}>选择参考图</button>
              <button className="btn btn-secondary" onClick={() => setReference(null)} disabled={!reference || loading}>移除</button>
            </div>
            {reference && <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 12, alignItems: 'end' }}>
              {referencePreview ? <img src={`data:${referencePreview.mimeType};base64,${referencePreview.base64}`} alt={`参考图：${reference.displayName}`} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, background: 'var(--bg-secondary)' }} /> : <div className="text-muted" style={{ width: 140, height: 140, display: 'grid', placeItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8 }}>预览不可用</div>}
              <label style={{ display: 'grid', gap: 6 }}><span>参考方式</span><select value={referenceMode} onChange={event => setReferenceMode(event.target.value as 'redraw' | 'reference_only')}><option value="redraw">重绘全身（重新构图）</option><option value="reference_only">仅作图像参考</option></select></label>
              <label style={{ display: 'grid', gap: 6 }}><span>参考图权重（0–0.50）</span><input type="number" min={0} max={0.5} step="0.05" value={referenceStrength} onChange={event => setReferenceStrength(Number(event.target.value))} /></label>
            </div>}
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="studio-round-settings">
              <label style={{ display: 'grid', gap: 6 }}><span>任务轮次</span><select value={rounds} onChange={event => setRounds(Number(event.target.value) as 5 | 25)}><option value={5}>连续生成 5 轮</option><option value={25}>连续生成 25 轮</option></select></label>
              <label style={{ display: 'grid', gap: 6 }}><span>Seed 模式</span><select value={seedMode} onChange={event => setSeedMode(event.target.value as 'locked' | 'increment' | 'range_increment')}><option value="locked">锁定：每轮相同</option><option value="increment">递进：每轮 +1</option><option value="range_increment">范围递进：循环范围</option></select></label>
              <div className="text-muted studio-round-note">任务逐轮提交。停止只阻止后续轮次，不会发送 ComfyUI 全局中断。</div>
            </div>
            {seedMode === 'range_increment' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}><label style={{ display: 'grid', gap: 6 }}><span>范围起始 Seed</span><input type="number" min={0} max={4294967295} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))} /></label><label style={{ display: 'grid', gap: 6 }}><span>范围结束 Seed</span><input type="number" min={rangeStart} max={4294967295} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))} /></label></div>}
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="studio-lora-settings">
              <label className="studio-lora-select"><span>LoRA（可选，仅显示当前核心可用的 {loraArchitecture} LoRA）</span><select value={loraName} onChange={event => setLoraName(event.target.value)}><option value="">不使用 LoRA</option>{loras.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
              <button className="btn btn-secondary" onClick={() => void readLoras()} disabled={loading}>读取真实 LoRA</button>
              <div className="studio-lora-weights">
                <label><span>LoRA 模型权重</span><input type="number" min={-2} max={2} step="0.05" value={loraModelStrength} disabled={!loraName} onChange={event => setLoraModelStrength(Number(event.target.value))} /></label>
                <label><span>LoRA 文本权重</span><input type="number" min={-2} max={2} step="0.05" value={loraClipStrength} disabled={!loraName} onChange={event => setLoraClipStrength(Number(event.target.value))} /></label>
              </div>
              {!loraName && <p className="text-muted studio-lora-hint">选择 LoRA 后可填写模型权重与文本权重；两项均会提交给 ComfyUI。</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={() => void start()} disabled={loading}>{loading ? '正在创建任务…' : `开始连续生成 ${rounds} 轮`}</button>
            <span className="text-muted">当前核心：{selectedEngineLabel}；此按钮不会取消或清空 ComfyUI 的其他任务。</span>
          </div>
          <p className="text-muted studio-start-feedback" role="status" aria-live="polite">{startFeedback || '点击后会在此显示提交状态或未提交的具体原因。'}</p>
        </div>}
      </div></section>
      <aside className="studio-preview-column">
        <div className="card studio-preview-card">
          <div className="card-header"><h3 className="card-title">生成预览与意见</h3>{job && <span className={`badge ${job.state === 'completed' ? 'badge-success' : ['partial_failed', 'failed'].includes(job.state) ? 'badge-error' : 'badge-info'}`}>{job.state}</span>}</div>
          {job ? <>
            <p className="text-secondary">{job.message}</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}><button className="btn btn-secondary btn-sm" onClick={() => void refreshJob()} disabled={loading}>刷新状态</button><button className="btn btn-danger btn-sm" onClick={() => void stopJob()} disabled={loading || ['completed', 'partial_failed', 'failed', 'stopped'].includes(job.state)}>停止后续轮次</button></div>
            <div className="studio-output-grid">{job.attempts?.map(attempt => <article className="studio-output-item" key={attempt.round}><div className="mono">第 {attempt.round} 轮 · Seed {attempt.seed}</div><div className="text-muted">{attempt.state}</div>{attempt.outputs?.map((item) => { const preview = item.libraryItemId ? outputPreviews[item.libraryItemId] : undefined; const key = `${item.type}:${item.subfolder}:${item.filename}`; return preview ? <img key={key} src={`data:${preview.mimeType};base64,${preview.base64}`} alt={`第 ${attempt.round} 轮生成图`} className="studio-generated-image" /> : item.libraryItemId ? <button className="btn btn-secondary btn-sm" key={key} onClick={() => void loadOutputPreview(item.libraryItemId!)}>加载缩略图</button> : <div className="studio-output-waiting" key={key}>归档中</div> })}<VlmReviewPanel review={attempt.review} generating={attempt.state === 'generating' || job.state === 'auditing'} /></article>)}</div>
          </> : <div className="studio-output-empty"><div className="text-muted">开始生成后，这里会展示真实生成图、每轮状态和可用的运行意见。</div>{referencePreview && <img src={`data:${referencePreview.mimeType};base64,${referencePreview.base64}`} alt="当前参考图预览" className="studio-generated-image" />}</div>}
        </div>
      </aside></div>
      {job && <div className="card studio-job-details" style={{ marginTop: 18 }}>
        <div className="card-header"><h3 className="card-title">本次真实任务</h3><span className={`badge ${job.state === 'completed' ? 'badge-success' : ['partial_failed', 'failed'].includes(job.state) ? 'badge-error' : 'badge-info'}`}>{job.state}</span></div>
        <p className="mono">{job.jobId} · 第 {job.currentRound}/{job.rounds} 轮</p>
        <p className="text-secondary">{job.message}</p>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => void refreshJob()} disabled={loading}>刷新真实任务状态</button><button className="btn btn-danger" onClick={() => void stopJob()} disabled={loading || ['completed', 'partial_failed', 'failed', 'stopped'].includes(job.state)}>停止后续轮次</button></div>
        {job.attempts?.length ? <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>{job.attempts.map(attempt => <div className="card" style={{ margin: 0 }} key={attempt.round}><div className="mono">第 {attempt.round} 轮 · Seed {attempt.seed} · {attempt.state}</div><div className="mono text-muted">{attempt.promptId}</div>{attempt.outputs?.map(item => <div className="mono" key={`${item.type}:${item.subfolder}:${item.filename}`}>{item.type} · {item.subfolder || '/'} · {item.filename}</div>)}<VlmReviewPanel review={attempt.review} generating={attempt.state === 'generating' || job.state === 'auditing'} /></div>)}</div> : null}
      </div>}
    </div>
  )
}
