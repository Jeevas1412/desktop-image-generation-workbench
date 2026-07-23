import { describe, expect, it } from 'vitest'
import { appendPrompt, composePromptStructure } from './prompt-structure'

describe('structured prompt composer', () => {
  it('keeps the handbook order and omits empty fields', () => {
    expect(composePromptStructure({ subject: '侦探', scene: '雨夜街口', shotSize: '全身构图', lighting: '霓虹侧逆光' }))
      .toBe('侦探，雨夜街口，全身构图，霓虹侧逆光')
  })

  it('appends without removing the manually edited final prompt', () => {
    expect(appendPrompt('已有角色设定', '50mm 镜头，浅景深')).toBe('已有角色设定，50mm 镜头，浅景深')
  })
})
