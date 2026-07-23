import { useEffect, useMemo, useState } from 'react'
import { normalizeComfyUiConnectionInput } from '../lib/connection-profile'

type ConnectionMode = 'local' | 'lan' | 'gateway' | 'missing'
type ConnectionResult = { service: 'comfyui' | 'vlm'; state: 'reachable' | 'unreachable' | 'timeout' | 'unresolved' | 'not_lan' | 'not_comfyui' | 'not_vlm'; detail: string }

const modeCopy: Record<Exclude<ConnectionMode, 'missing'>, { title: string; help: string; label: string; placeholder: string }> = {
  local: { title: '这台电脑', help: 'ComfyUI 与工作台运行在同一台电脑。通常无需知道局域网 IP；先试用本机地址。', label: '本机地址', placeholder: '127.0.0.1 或 localhost' },
  lan: { title: '局域网另一台电脑', help: '请在运行 ComfyUI 的电脑上查看其启动信息或向管理员索取“访问地址和端口”。不要填写这台电脑自己的 IP。', label: '运行 ComfyUI 的设备地址', placeholder: '例如 192.168.1.20' },
  gateway: { title: '已配置的安全远端', help: '仅支持已通过 VPN、内网网关或公司网络可达的私网地址。此页不会建立 SSH 隧道、登录服务器或公开端口。', label: '安全远端地址', placeholder: '由管理员提供的内网名称或 IP' },
}

export default function ComfyUiConnection() {
  const [mode, setMode] = useState<ConnectionMode | null>(null)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<ConnectionResult | null>(null)
  const [vlmHost, setVlmHost] = useState('')
  const [vlmPort, setVlmPort] = useState('')
  const [checkingVlm, setCheckingVlm] = useState(false)
  const [vlmResult, setVlmResult] = useState<ConnectionResult | null>(null)
  const copy = useMemo(() => mode && mode !== 'missing' ? modeCopy[mode] : null, [mode])

  useEffect(() => { void (async () => {
    if (!window.imageWorkbench?.request) return
    try {
      const profile = await window.imageWorkbench.request({ type: 'comfyui:profile:get', payload: {} }) as { host?: string; port?: number } | null
      if (profile?.host && Number.isInteger(profile.port)) { setHost(profile.host); setPort(String(profile.port)); if (profile.host !== '127.0.0.1' && profile.host !== 'localhost') setMode('lan') }
      const vlmProfile = await window.imageWorkbench.request({ type: 'vlm:profile:get', payload: {} }) as { host?: string; port?: number } | null
      if (vlmProfile?.host && Number.isInteger(vlmProfile.port)) { setVlmHost(vlmProfile.host); setVlmPort(String(vlmProfile.port)) }
    } catch { /* First launch is expected. */ }
  })() }, [])

  const chooseMode = (next: ConnectionMode) => {
    setMode(next); setResult(null)
    // A location is not a connection. Only a previously verified Profile may
    // prefill a host and port; switching location never guesses either value.
    setHost(''); setPort('')
  }
  const verify = async () => {
    if (!copy) return
    let profile: { host: string; port: number }
    try { profile = normalizeComfyUiConnectionInput(host, port) } catch (error) {
      const code = error instanceof Error ? error.message : ''
      const detail = code === 'CONNECTION_PORT_CONFLICT'
        ? '地址中包含的端口与右侧端口不一致。请只保留一个端口值，或让两者相同。'
        : code === 'CONNECTION_URL_UNSUPPORTED'
          ? '这里只支持纯主机/IP，或完整的 http://主机:端口；不能包含账号、路径、查询参数或 HTTPS。'
          : '请填写设备地址和 1–65535 之间的端口。也可以直接粘贴 http://地址:端口。'
      setResult({ service: 'comfyui', state: 'unreachable', detail })
      return
    }
    if (!window.imageWorkbench?.request) { setResult({ service: 'comfyui', state: 'unreachable', detail: '桌面连接服务未加载。请从已安装的工作台启动。' }); return }
    setChecking(true); setResult(null)
    try {
      setHost(profile.host); setPort(String(profile.port))
      const response = await window.imageWorkbench.request({ type: 'comfyui:connection:verify', payload: { profile } }) as ConnectionResult
      if (response.state === 'reachable') { await window.imageWorkbench.request({ type: 'comfyui:profile:save', payload: { profile } }); window.dispatchEvent(new Event('image-workbench:profile-saved')); setResult({ ...response, detail: `${response.detail} 连接配置已保存。下一步请到“模型与下载”读取真实状态。` }) } else setResult(response)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setResult({
        service: 'comfyui',
        state: 'unreachable',
        detail: code.includes('IPC_UNTRUSTED_SENDER')
          ? '本机工作台拒绝了此页面的连接检查请求。请关闭后从开始菜单重新打开“DGX 智能生图工作台”。'
          : '本机工作台没有完成这次连接检查。请关闭后从开始菜单重新打开工作台，再重试；这不会修改 ComfyUI 或服务器。',
      })
    } finally { setChecking(false) }
  }

  const verifyVlm = async () => {
    const numericPort = Number(vlmPort)
    if (!vlmHost.trim() || !Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) return
    if (!window.imageWorkbench?.request) { setVlmResult({ service: 'vlm', state: 'unreachable', detail: '桌面连接服务未加载。' }); return }
    setCheckingVlm(true); setVlmResult(null)
    try {
      const profile = { host: vlmHost.trim(), port: numericPort }
      const response = await window.imageWorkbench.request({ type: 'vlm:connection:verify', payload: { profile } }) as ConnectionResult
      if (response.state === 'reachable') {
        await window.imageWorkbench.request({ type: 'vlm:profile:save', payload: { profile } })
        setVlmResult({ ...response, detail: `${response.detail} 翻译服务配置已独立保存。` })
      } else setVlmResult(response)
    } catch { setVlmResult({ service: 'vlm', state: 'unreachable', detail: 'VLM 配置未保存。请确认局域网地址、端口和模型列表接口。' }) } finally { setCheckingVlm(false) }
  }

  return <div style={{ maxWidth: 900 }}>
    <div className="card"><div className="card-header"><h3 className="card-title">ComfyUI 在哪里运行？</h3></div>
      <p className="text-secondary">先选择运行位置，再填写该设备实际显示的访问地址和端口。工作台不会猜测、预填或保存未验证的连接；8188 只是常见示例，8189/8190 只是用于排查的相邻示例端口，三者都不是环境预设。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 16 }}>
        {(['local','lan','gateway','missing'] as ConnectionMode[]).map((item) => <button key={item} className={`btn ${mode === item ? 'btn-primary' : 'btn-secondary'}`} onClick={() => chooseMode(item)}>{item === 'missing' ? '尚未安装 ComfyUI' : modeCopy[item].title}</button>)}
      </div>
    </div>
    {mode === null ? <div className="card" style={{ marginTop: 18 }}><h3 className="card-title">请选择运行位置</h3><p className="text-secondary">选择后再填写 ComfyUI 启动窗口或管理员提供的地址和端口。未完成验证前，工作台不会把任何地址当作已配置连接。</p></div> : mode === 'missing' ? <div className="card" style={{ marginTop: 18 }}><h3 className="card-title">先准备 ComfyUI</h3><p className="text-secondary">本工作台不内置 ComfyUI、Python 或生图模型。请先在本机或可访问的设备完成 ComfyUI 安装与启动；看到其访问地址后，再回到这里选择相应位置进行只读检查。安装期间不会显示虚假模型、任务或生成按钮。</p></div> : <>
      <div className="card" style={{ marginTop: 18 }}><div className="card-header"><h3 className="card-title">{copy!.title}</h3></div><p className="text-secondary">{copy!.help}</p>
        {mode === 'lan' && <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-muted)' }}>
          <strong>不知道地址和端口？请在运行 ComfyUI 的那台电脑上打开终端并执行：</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
            <div><div className="text-muted" style={{ marginBottom: 6 }}>DGX / Linux</div><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}><code>{"hostname -I\nps -ef | grep '[m]ain.py'\nss -ltn | grep -E ':(8188|8189|8190)[[:space:]]'"}</code></pre><p className="text-muted" style={{ fontSize: 12, marginBottom: 0 }}>第一行中的局域网 IP 填入左侧；优先以 ComfyUI 启动参数中的 <code>--port</code> 为准。8188/8189/8190 只用于辅助查找，不代表当前环境必然使用它们。</p></div>
            <div><div className="text-muted" style={{ marginBottom: 6 }}>Windows（运行 ComfyUI 的电脑）</div><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}><code>{"ipconfig\nnetstat -ano | findstr :8188\nnetstat -ano | findstr :8189"}</code></pre><p className="text-muted" style={{ fontSize: 12, marginBottom: 0 }}>在 <code>ipconfig</code> 中查找 IPv4 地址；以 ComfyUI 启动窗口或实际监听结果中的端口为准。8188/8189 只是示例，不是产品或环境默认值。</p></div>
          </div>
          <p className="text-secondary" style={{ fontSize: 12, margin: '12px 0 0' }}>不要把运行工作台这台电脑的 <code>127.0.0.1</code> 或 IP 填入此处；它们只代表当前电脑，不能代表另一台运行 ComfyUI 的设备。</p>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: 12, marginTop: 18 }}>
          <label style={{ display: 'grid', gap: 6 }}><span className="text-muted">{copy!.label}</span><input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder={copy!.placeholder} autoComplete="off" aria-describedby="comfy-host-help" /><small id="comfy-host-help" className="text-muted">可填写纯地址，也可粘贴完整的 <code>http://地址:端口</code>。</small></label>
          <label style={{ display: 'grid', gap: 6 }}><span className="text-muted">ComfyUI 端口</span><input className="input" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" placeholder="例如 8188" /></label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => void verify()} disabled={checking}>{checking ? '检查中…' : '检查并保存连接'}</button><span className="text-muted" style={{ fontSize: 12 }}>仅在你点击后访问固定只读 /object_info；不保存密码、令牌或 SSH 私钥。</span></div>
      </div>
    </>}
    {result && <div role="status" className="card" style={{ marginTop: 18, borderColor: result.state === 'reachable' ? 'var(--accent)' : 'var(--warning)' }}><strong>{result.state === 'reachable' ? 'ComfyUI 已连接' : 'ComfyUI 未通过验证'}</strong><br />{result.detail}</div>}
    <div className="card" style={{ marginTop: 18 }}><div className="card-header"><h3 className="card-title">VLM 提示词翻译（可选）</h3></div>
      <p className="text-secondary">VLM 与 ComfyUI 使用独立地址和端口。只有通过局域网模型列表验证后才会保存；每次翻译都会再次验证当前地址，不能借用 ComfyUI 的地址或端口。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: 12, marginTop: 18 }}>
        <label style={{ display: 'grid', gap: 6 }}><span className="text-muted">VLM 服务地址</span><input className="input" value={vlmHost} onChange={(e) => setVlmHost(e.target.value)} placeholder="例如 192.168.1.30" autoComplete="off" /></label>
        <label style={{ display: 'grid', gap: 6 }}><span className="text-muted">VLM 端口</span><input className="input" value={vlmPort} onChange={(e) => setVlmPort(e.target.value)} inputMode="numeric" placeholder="例如 8003" /></label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}><button className="btn btn-secondary" onClick={() => void verifyVlm()} disabled={checkingVlm}>{checkingVlm ? '验证中…' : '验证并保存 VLM 翻译服务'}</button><span className="text-muted" style={{ fontSize: 12 }}>仅访问固定的 <code>/v1/models</code>；不提交翻译或生成请求。</span></div>
    </div>
    {vlmResult && <div role="status" className="card" style={{ marginTop: 18, borderColor: vlmResult.state === 'reachable' ? 'var(--accent)' : 'var(--warning)' }}><strong>{vlmResult.state === 'reachable' ? 'VLM 已连接' : 'VLM 未通过验证'}</strong><br />{vlmResult.detail}</div>}
  </div>
}
