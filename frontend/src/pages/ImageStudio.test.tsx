import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n/LanguageContext'
import ImageStudio from './ImageStudio'

function renderWithProviders() {
  return render(
    <LanguageProvider>
      <BrowserRouter>
        <ImageStudio />
      </BrowserRouter>
    </LanguageProvider>,
  )
}

describe('ImageStudio', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

  it('renders a disabled real-submit form until a verified backend selection is available', () => {
    renderWithProviders()
    expect(screen.getByText('真实生图工作台')).toBeDefined()
    expect(screen.getByText(/不会显示模拟进度/)).toBeDefined()
    expect(screen.queryByText('影视提示词引导')).toBeNull()
    expect(screen.getByRole('link', { name: '连接 ComfyUI' })).toBeDefined()
  })

  it('sends one real-start IPC request after the user supplies a positive prompt', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'image:capabilities:get') return { status: 'configured' }
      if (value.type === 'model:selection:get') return { coreCandidateId: 'comfy.checkpoints:Illustrious-XL-v0.1.safetensors', coreId: 'illustrious-xl-v01' }
      if (value.type === 'image:job:start') return { jobId: 'job_realstart', state: 'queued', rounds: 5, currentRound: 0, attempts: [] }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    renderWithProviders()
    const startButton = await screen.findByRole('button', { name: /开始连续生成 5 轮/ })
    const textareas = document.querySelectorAll('textarea')
    fireEvent.change(textareas[1], { target: { value: 'a fully English prompt' } })
    fireEvent.click(startButton)
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: 'image:job:start' })))
  })

  it('explains why a real task was not submitted when the positive prompt is empty', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'image:capabilities:get') return { status: 'configured' }
      if (value.type === 'model:selection:get') return { coreCandidateId: 'comfy.checkpoints:Illustrious-XL-v0.1.safetensors', coreId: 'illustrious-xl-v01' }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    renderWithProviders()
    fireEvent.click(await screen.findByRole('button', { name: /开始连续生成 5 轮/ }))
    expect((await screen.findAllByText(/尚未填写正面提示词/)).length).toBeGreaterThan(0)
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'image:job:start' }))
  })

  it('shows Pony source and content-rating controls and passes their exact tags only on submission', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'image:capabilities:get') return { status: 'configured' }
      if (value.type === 'model:selection:get') return { coreCandidateId: 'comfy.checkpoints:ponyDiffusionV6XL_v6StartWithThisOne.safetensors', coreId: 'pony-v6-xl' }
      if (value.type === 'image:job:start') return { jobId: 'job_pony', state: 'queued', rounds: 5, currentRound: 0, attempts: [] }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    renderWithProviders()
    expect(await screen.findByText('当前生图核心')).toBeTruthy()
    expect(screen.getByText('Pony Diffusion 动画人像')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('正面提示词（必填）'), { target: { value: 'an animated fox' } })
    fireEvent.change(screen.getByLabelText('画面风格'), { target: { value: 'source_anime' } })
    fireEvent.change(screen.getByLabelText('内容分级'), { target: { value: 'rating_questionable' } })
    fireEvent.click(screen.getByRole('button', { name: /开始连续生成 5 轮/ }))
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: 'image:job:start', payload: { generation: expect.objectContaining({ ponySourceTag: 'source_anime', ponyRatingTag: 'rating_questionable' }) } })))
  })

  it('keeps a local prompt draft when the workbench component is unmounted and opened again', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'image:capabilities:get') return { status: 'configured' }
      if (value.type === 'model:selection:get') return { coreCandidateId: 'comfy.checkpoints:Illustrious-XL-v0.1.safetensors', coreId: 'illustrious-xl-v01' }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    const first = renderWithProviders()
    const prompt = await screen.findByLabelText('正面提示词（必填）')
    fireEvent.change(prompt, { target: { value: 'keep this local draft' } })
    await waitFor(() => expect(localStorage.getItem('dgx-image-workbench:image-studio-draft:v1')).toContain('keep this local draft'))
    first.unmount()
    renderWithProviders()
    expect(await screen.findByDisplayValue('keep this local draft')).toBeTruthy()
  })

  it('renders a returned VLM score, review summary and copy-only prompt patch in the preview column', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'image:capabilities:get') return { status: 'configured' }
      if (value.type === 'model:selection:get') return { coreCandidateId: 'comfy.checkpoints:Illustrious-XL-v0.1.safetensors', coreId: 'illustrious-xl-v01' }
      if (value.type === 'image:job:start') return { jobId: 'job_review', state: 'completed', rounds: 5, currentRound: 1, attempts: [{ round: 1, seed: 1, promptId: 'prompt-review', state: 'completed', outputs: [], review: { state: 'completed', score: 88, pass: true, issues: ['构图稳定'], hard_failures: [], summary: '提示词一致。', prompt_patch: 'wider shot', model: 'qwen-vl' } }] }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    renderWithProviders()
    fireEvent.change(await screen.findByLabelText('正面提示词（必填）'), { target: { value: 'a valid English prompt' } })
    fireEvent.click(screen.getByRole('button', { name: /开始连续生成 5 轮/ }))
    expect((await screen.findAllByText('VLM 审核：88/100')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('提示词一致。').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: '复制 VLM 修改建议' }).length).toBeGreaterThan(0)
  })
})
