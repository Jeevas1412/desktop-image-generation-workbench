export const PROMPT_PART_ORDER = [
  'subject', 'action', 'scene', 'shotSize', 'viewpoint',
  'lighting', 'colorTone', 'lensDepth', 'composition', 'styleQuality',
] as const

export type PromptPartKey = typeof PROMPT_PART_ORDER[number]
export type PromptStructure = Record<PromptPartKey, string>

export const EMPTY_PROMPT_STRUCTURE: PromptStructure = {
  subject: '', action: '', scene: '', shotSize: '', viewpoint: '',
  lighting: '', colorTone: '', lensDepth: '', composition: '', styleQuality: '',
}

export const PROMPT_PARTS: ReadonlyArray<{ key: PromptPartKey; label: string; hint: string; placeholder: string }> = [
  { key: 'subject', label: '主体', hint: '谁或什么；外观、服装、材质可写在这里。', placeholder: '例：穿黑色风衣的侦探' },
  { key: 'action', label: '动作', hint: '主体正在做什么，或保持什么姿态。', placeholder: '例：站在街口，手持旧伞' },
  { key: 'scene', label: '场景', hint: '地点、时间、天气与背景信息。', placeholder: '例：雨夜城市街口，地面有霓虹倒影' },
  { key: 'shotSize', label: '景别', hint: '决定主体在画面中的范围；全身请明确头到脚与双脚入镜。', placeholder: '例：全身构图，头到脚完整可见' },
  { key: 'viewpoint', label: '视角', hint: '只选一个主视角，避免正面、侧面、背面互相冲突。', placeholder: '例：四分之三侧面，略微仰视' },
  { key: 'lighting', label: '光线', hint: '写光线方向、软硬或时间光线。', placeholder: '例：霓虹侧逆光，轻微体积光' },
  { key: 'colorTone', label: '色调', hint: '写冷暖、饱和度、明暗或电影调色。', placeholder: '例：冷色低饱和，青橙色调' },
  { key: 'lensDepth', label: '镜头/景深', hint: '焦段和焦点关系；人物变形可优先用 50mm 或 85mm。', placeholder: '例：50mm 镜头，浅景深，背景柔和虚化' },
  { key: 'composition', label: '构图', hint: '决定主体位置、留白与空间层次。', placeholder: '例：三分法构图，人物右侧，左侧留白' },
  { key: 'styleQuality', label: '风格与画质', hint: '确定一种主媒介或质感，避免互相矛盾的风格堆叠。', placeholder: '例：电影剧照，细节清晰，胶片颗粒' },
]

export function composePromptStructure(value: Partial<PromptStructure>): string {
  return PROMPT_PART_ORDER
    .map((key) => String(value[key] ?? '').trim())
    .filter(Boolean)
    .join('，')
}

export function appendPrompt(base: string, addition: string): string {
  const existing = base.trim(); const next = addition.trim()
  if (!existing) return next
  if (!next) return existing
  return `${existing}，${next}`
}
