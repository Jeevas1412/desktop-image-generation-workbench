import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import './Layout.css'

const navItemPaths = [
  { id: 'comfyuiConnection', path: '/comfyui-connection', icon: '🔗' },
  { id: 'imageModels', path: '/image-models', icon: '📦' },
  { id: 'imageStudio', path: '/image-studio', icon: '🎨' },
  { id: 'jobs', path: '/jobs', icon: '📋' },
  { id: 'library', path: '/library', icon: '🖼' },
]

export default function Layout() {
  const location = useLocation()
  const { t, locale, setLocale } = useLanguage()
  const [connection, setConnection] = useState<{ state: 'unconfigured' | 'saved' | 'stale' | 'verifying' | 'reachable' | 'unreachable'; host?: string; port?: number; verifiedAt?: string | null; checkedAt?: string }>(() => ({ state: 'verifying' }))
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('dgx-image-workbench:nav-collapsed') === 'true')

  useEffect(() => { localStorage.setItem('dgx-image-workbench:nav-collapsed', String(navCollapsed)) }, [navCollapsed])

  useEffect(() => {
    let active = true
    let checking = false
    const refreshProfile = async () => {
      if (checking) return
      checking = true
      if (!window.imageWorkbench?.request) { if (active) setConnection({ state: 'unconfigured' }); checking = false; return }
      try {
        const profile = await window.imageWorkbench.request({ type: 'comfyui:profile:get', payload: {} }) as { host?: string; port?: number; verifiedAt?: string | null } | null
        if (!profile?.host || typeof profile.port !== 'number' || !Number.isInteger(profile.port)) { if (active) setConnection({ state: 'unconfigured' }); return }
        if (active) setConnection({ state: 'verifying', host: profile.host, port: profile.port, verifiedAt: profile.verifiedAt })
        const status = await window.imageWorkbench.request({ type: 'comfyui:status:check', payload: {} }) as { state?: string; profile?: { host?: string; port?: number }; checkedAt?: string; verifiedAt?: string | null }
        if (!active) return
        setConnection({
          state: status.state === 'reachable' ? 'reachable' : 'unreachable',
          host: status.profile?.host ?? profile.host, port: status.profile?.port ?? profile.port,
          verifiedAt: status.verifiedAt ?? profile.verifiedAt, checkedAt: status.checkedAt,
        })
      } catch { if (active) setConnection({ state: 'unreachable' }) } finally { checking = false }
    }
    void refreshProfile()
    const markReachableFromVerifiedOperation = () => {
      if (!active) return
      setConnection(current => current.host && typeof current.port === 'number'
        ? { ...current, state: 'reachable', checkedAt: new Date().toISOString() }
        : current)
    }
    window.addEventListener('image-workbench:profile-saved', refreshProfile)
    window.addEventListener('image-workbench:comfyui-reachable', markReachableFromVerifiedOperation)
    window.addEventListener('focus', refreshProfile)
    const timer = window.setInterval(() => { void refreshProfile() }, 15_000)
    return () => { active = false; window.removeEventListener('image-workbench:profile-saved', refreshProfile); window.removeEventListener('image-workbench:comfyui-reachable', markReachableFromVerifiedOperation); window.removeEventListener('focus', refreshProfile); window.clearInterval(timer) }
  }, [])

  const navLabel = (id: string) => {
    const labels: Record<string, string> = {
      imageModels: t.nav.imageModels,
      imageStudio: t.nav.imageStudio,
      jobs: t.nav.jobs,
      library: t.nav.library,
      comfyuiConnection: '连接 ComfyUI',
    }
    return labels[id] ?? id
  }

  const currentNav = navItemPaths.find(n => n.path === location.pathname || (n.path === '/' && location.pathname === '/'))
  const pageTitle = currentNav ? navLabel(currentNav.id) : 'DGX Image Studio'

  return (
    <div className="layout">
      <aside className={`sidebar ${navCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <h1 className="logo">DGX Image Studio</h1>
        </div>

        <nav className="nav-menu">
          {navItemPaths.map(item => (
            <Link
              key={item.id}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{navLabel(item.id)}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="lang-switch">
            <button
              className={`lang-btn ${locale === 'zh-CN' ? 'active' : ''}`}
              onClick={() => setLocale('zh-CN')}
            >
              中
            </button>
            <button
              className={`lang-btn ${locale === 'en-US' ? 'active' : ''}`}
              onClick={() => setLocale('en-US')}
            >
              EN
            </button>
          </div>
          <div className="version">v{__DGX_IMAGE_WORKBENCH_VERSION__} · 本机 Alpha</div>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button className="nav-collapse-toggle" type="button" onClick={() => setNavCollapsed(value => !value)} aria-label={navCollapsed ? '展开页面导览' : '收起页面导览'} title={navCollapsed ? '展开页面导览' : '收起页面导览'}>{navCollapsed ? '›' : '‹'}</button>
            <h2 className="page-title">{pageTitle}</h2>
          </div>
          <div className="top-bar-right">
            <div className="status-indicator">
              <span className={`status-dot ${connection.state === 'reachable' ? 'running' : 'idle'}`} />
              <span>{connection.state === 'reachable' ? `ComfyUI 可达 · ${connection.host}:${connection.port}`
                : connection.state === 'verifying' ? 'ComfyUI 验证中…'
                  : connection.state === 'unreachable' ? `ComfyUI 当前不可达${connection.host && connection.port ? ` · ${connection.host}:${connection.port}` : ''}`
                    : connection.state === 'stale' ? 'ComfyUI 配置已过期'
                      : connection.state === 'saved' ? 'ComfyUI 配置已保存'
                        : 'ComfyUI 未配置'}</span>
            </div>
            <div className="timestamp">
              {new Date().toLocaleString(locale === 'en-US' ? 'en-US' : 'zh-CN')}
            </div>
          </div>
        </header>

        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
