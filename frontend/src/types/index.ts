// ── 生图工作台类型定义 ──

// 能力 ID
export type CapabilityId =
  | 'image.anime_portrait.pony'
  | 'image.anime_portrait.illustrious'
  | 'image.realistic_general.flux'
  | 'vision.prompt_translate'
  | 'vision.image_review'
  | 'image.backend.comfyui'

// 兼容性级别
export type CompatibilityLevel = 'verified' | 'filename-match-candidate' | 'alias-match-candidate' | 'unknown' | 'incompatible'

// 候选模型位置类型
export type LocationKind = 'fixed-comfy-directory' | 'fixed-vlm-registry' | 'manual-import'

// 验证状态
export interface VerificationEvidence {
  state: 'unverified' | 'manifest' | 'minimal-smoke' | 'fully-verified' | 'failed'
  sha256: string | null
  architectureFamily: string | null
  workflowSmoke: 'not-run' | 'passed' | 'failed'
}

// 能力状态
export type CapabilityStatus =
  | 'unknown' | 'scanning' | 'reusable' | 'compatibility_testing'
  | 'bound' | 'ready' | 'missing' | 'plan_required'
  | 'downloading' | 'manual_required' | 'incompatible' | 'failed' | 'blocked'

// 下载状态
export type DownloadState = 'planned' | 'downloading' | 'verifying' | 'completed' | 'failed' | 'paused'

// 任务状态
export type JobState = 'planned' | 'running' | 'stopped' | 'completed' | 'failed' | 'vlm_stopped'

// 生图核心类型
export type CoreType = 'pony' | 'illustrious' | 'flux'

// Seed 模式
export type SeedMode = 'locked' | 'increment' | 'range_increment'

// 采样器
export type SamplerName = 'euler' | 'euler_ancestral' | 'heun' | 'dpmpp_2m' | 'dpmpp_2m_sde_gpu'

// 调度器
export type SchedulerName = 'normal' | 'simple' | 'beta' | 'karras' | 'sgm_uniform'

// Pony 标签
export type PonySource = '' | 'source_anime' | 'source_cartoon' | 'source_furry' | 'source_pony'
export type PonyRating = '' | 'rating_safe' | 'rating_questionable' | 'rating_explicit'

// ── 候选模型 ──
export interface ModelCandidate {
  candidateId: string
  displayName: string
  family: string
  compatibility: CompatibilityLevel
  locationKind: LocationKind
  verification: VerificationEvidence
  missingDependencies: string[]
}

// ── 能力发现结果 ──
export interface CapabilityResult {
  capabilityId: CapabilityId
  status: CapabilityStatus
  binding?: {
    candidateId: string
    compatibility: CompatibilityLevel
    boundAt: string
  } | null
  candidates: ModelCandidate[]
  blockingReasons: string[]
  checkedAt: string
}

// ── 模型目录项 ──
export interface ModelCatalogEntry {
  capabilityId: CapabilityId
  displayName: string
  family: string
  artifacts: CatalogArtifact[]
}

export interface CatalogArtifact {
  artifactId: string
  kind: 'checkpoint' | 'unet' | 'vae' | 'text-encoder' | 'vision-model' | 'lora'
  family: string
  targetDirectoryId: string
  expectedFileName: string
  distribution: {
    status: 'research-required' | 'downloadable' | 'manual-import-only' | 'deprecated'
    sourceUrl?: string | null
    license?: string | null
    sha256?: string | null
    sizeBytes?: number | null
  }
}

// ── 下载项 ──
export interface DownloadItem {
  downloadId: string
  artifactId: string
  displayName: string
  fileName: string
  targetPath: string
  sizeBytes: number
  downloadedBytes: number
  state: DownloadState
  license?: string
  sourceUrl?: string
  error?: string
  startedAt?: string
}

// ── 生图请求 ──
export interface GenerationRequest {
  capabilityId: 'image.anime_portrait.pony' | 'image.anime_portrait.illustrious' | 'image.realistic_general.flux'
  prompt: string
  promptStructure?: {
    subject?: string
    action?: string
    scene?: string
    shotSize?: string
    viewpoint?: string
    lighting?: string
    colorTone?: string
    lensDepth?: string
    composition?: string
    styleQuality?: string
  }
  negativePrompt: string
  ponyTags?: { source: PonySource; rating: PonyRating }
  size: { width: number; height: number }
  sampler: { steps: number; guidance: number; name: SamplerName; scheduler: SchedulerName }
  reference?: {
    libraryItemId: string
    semanticWeight: number
    reviewEnabled: boolean
    redrawMode: 'redraw' | 'reference-only'
  } | null
  lora?: {
    bindingId: string
    modelWeight: number
    textWeight: number
  } | null
  attemptCount: 5 | 25
  seed: { mode: SeedMode; value: number; rangeEnd?: number | null }
  review: {
    enabled: boolean
    threshold: number
    stopAfterAttempts: number
    suggestionMode: 'copy-only'
  }
}

// ── 任务/Job ──
export interface JobSummary {
  jobId: string
  capabilityId: string
  state: JobState
  attemptCount: number
  completedAttempts: number
  prompt: string
  createdAt: string
  completedAt?: string
}

export interface JobDetail extends JobSummary {
  negativePrompt: string
  seed: { mode: SeedMode; value: number }
  rounds: JobRound[]
  error?: string
}

export interface JobRound {
  roundIndex: number
  seed: number
  state: 'generating' | 'reviewing' | 'completed' | 'failed' | 'vlm_stopped'
  imageUrl?: string
  vlmScore?: number
  vlmIssues?: string[]
  vlmSummary?: string
  vlmSuggestion?: string
  promptId?: string
  startedAt?: string
  completedAt?: string
}

// ── 素材库 ──
export type LibraryItemType = 'output' | 'semifinished'

export interface LibraryItem {
  itemId: string
  type: LibraryItemType
  imageUrl: string
  fileName: string
  jobId: string
  roundIndex: number
  capabilityId: string
  prompt: string
  negativePrompt: string
  englishPrompt: string
  seed: number
  size: { width: number; height: number }
  sampler: { steps: number; guidance: number; name: string; scheduler: string }
  lora?: { displayName: string; modelWeight: number; textWeight: number } | null
  vlmScore?: number
  vlmSummary?: string
  createdAt: string
  usedAsReference?: boolean
}

// ── 页面通用状态 ──
export type PageState = 'loading' | 'empty' | 'ready' | 'disabled' | 'missing' | 'manual-required' | 'failed' | 'blocked'

// ── 导航 ──
export interface NavItem {
  id: string
  label: string
  path: string
  icon: string
}
