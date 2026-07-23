import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n/LanguageContext'
import ImageModels from './ImageModels'

function renderWithProviders() {
  return render(
    <LanguageProvider>
      <BrowserRouter>
        <ImageModels />
      </BrowserRouter>
    </LanguageProvider>,
  )
}

describe('ImageModels', () => {
  it('renders the capability section', () => {
    renderWithProviders()
    expect(screen.getByText('模型能力状态')).toBeDefined()
  })

  it('does not render mock capability cards', () => {
    renderWithProviders()
    expect(screen.getByText(/桌面数据服务未加载/)).toBeDefined()
    expect(screen.queryByText('image.anime_portrait.pony')).toBeNull()
  })

  it('renders download section', () => {
    renderWithProviders()
    expect(screen.getByText('下载管理')).toBeDefined()
    expect(screen.getByText('暂无真实下载任务')).toBeDefined()
  })
})
