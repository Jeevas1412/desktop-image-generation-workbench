import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n/LanguageContext'
import Library from './Library'

describe('Library', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('does not render fabricated images or counts', () => {
    render(<LanguageProvider><BrowserRouter><Library /></BrowserRouter></LanguageProvider>)
    expect(screen.getByText('半成品库')).toBeDefined()
    expect(screen.queryByText(/成品 \(5\)/)).toBeNull()
    expect(screen.queryByText('蓝天樱花下的少女')).toBeNull()
  })
  it('requires a second confirmation before requesting semifinished cleanup', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'library:list') return [{ libraryItemId: 'run_1.png', displayName: 'run_1.png' }]
      if (value.type === 'library:semifinished:clear:plan') return { planId: 'cleanup_plan_1', itemCount: 1, totalBytes: 2048, expiresAt: Date.now() + 60_000 }
      if (value.type === 'library:semifinished:clear:confirm') return { removed: 1, totalBytes: 2048 }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    render(<LanguageProvider><BrowserRouter><Library /></BrowserRouter></LanguageProvider>)
    const start = await screen.findByRole('button', { name: '清空当前内容' })
    fireEvent.click(start)
    expect(await screen.findByText('二次确认：清空当前半成品库')).toBeDefined()
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'library:semifinished:clear:confirm' }))
    fireEvent.click(screen.getByRole('button', { name: '确认清空 1 张图片' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith({ type: 'library:semifinished:clear:confirm', payload: { planId: 'cleanup_plan_1' } }))
  })
  it('shows only a returned VLM review and can request an audit for an archived image', async () => {
    const request = vi.fn(async (value: { type: string }) => {
      if (value.type === 'library:list') return [{ libraryItemId: 'run_1.png', displayName: 'run_1.png' }]
      if (value.type === 'library:review') return { state: 'completed', score: 92, pass: true, summary: '画面清晰。', issues: [], hard_failures: [], prompt_patch: '' }
      throw new Error(`unexpected:${value.type}`)
    })
    vi.stubGlobal('imageWorkbench', { request })
    render(<LanguageProvider><BrowserRouter><Library /></BrowserRouter></LanguageProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '执行 VLM 审核' }))
    expect(await screen.findByText('VLM：92/100')).toBeTruthy()
    expect(screen.getByText('画面清晰。')).toBeTruthy()
    expect(request).toHaveBeenCalledWith({ type: 'library:review', payload: { libraryItemId: 'run_1.png' } })
  })
})
