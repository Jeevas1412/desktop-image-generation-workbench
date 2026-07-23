import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n/LanguageContext'
import Jobs from './Jobs'

describe('Jobs', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('renders no fabricated task records', async () => {
    vi.stubGlobal('imageWorkbench', { request: vi.fn(async () => []) })
    render(<LanguageProvider><BrowserRouter><Jobs /></BrowserRouter></LanguageProvider>)
    expect(await screen.findByText('暂无由本工作台创建的真实任务记录。')).toBeDefined()
    expect(screen.queryByText('job-001')).toBeNull()
  })
})
