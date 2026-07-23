export type LoraCandidate = { displayName: string; directoryId: string }

export type SupportedGenerationEngine = 'pony' | 'illustrious' | 'flux'

// Do not infer compatibility from a filename in an unclassified root.  The
// explicit architecture folders discovered from ComfyUI are the safe boundary.
export function lorasForEngine(candidates: readonly LoraCandidate[], engine: SupportedGenerationEngine) {
  const directoryId = engine === 'flux' ? 'comfy.loras.flux' : 'comfy.loras.sdxl'
  return [...new Set(candidates
    .filter((candidate) => candidate.directoryId === directoryId)
    .map((candidate) => candidate.displayName))]
    .sort((left, right) => left.localeCompare(right))
}
