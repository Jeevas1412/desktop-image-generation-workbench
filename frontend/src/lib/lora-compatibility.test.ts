import { describe, expect, it } from 'vitest'
import { lorasForEngine } from './lora-compatibility'

describe('lorasForEngine', () => {
  const candidates = [
      { displayName: 'SDXL/style.safetensors', directoryId: 'comfy.loras.sdxl' },
      { displayName: 'SDXL/style.safetensors', directoryId: 'comfy.loras.sdxl' },
      { displayName: 'Flux/pose.safetensors', directoryId: 'comfy.loras.flux' },
      { displayName: 'SD1.5/style.safetensors', directoryId: 'comfy.loras' },
  ]

  it('allows only explicit SDXL LoRAs for Pony and Illustrious', () => {
    expect(lorasForEngine(candidates, 'pony')).toEqual(['SDXL/style.safetensors'])
    expect(lorasForEngine(candidates, 'illustrious')).toEqual(['SDXL/style.safetensors'])
  })

  it('allows only explicit Flux LoRAs for Flux', () => {
    expect(lorasForEngine(candidates, 'flux')).toEqual(['Flux/pose.safetensors'])
  })
})
