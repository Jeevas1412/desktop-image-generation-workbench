export type ComfyUiConnectionInput = Readonly<{ host: string; port: number }>

function validPort(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

// The ComfyUI verifier intentionally accepts only a host and port.  This
// parser lets the connection form accept the common copy/paste form without
// ever turning a renderer-supplied URL path, credential or query into a
// backend request target.
export function normalizeComfyUiConnectionInput(hostValue: string, portValue: string): ComfyUiConnectionInput {
  const suppliedHost = hostValue.trim()
  const suppliedPort = portValue.trim()
  if (!suppliedHost) throw new Error('CONNECTION_HOST_REQUIRED')

  let host = suppliedHost
  let portFromUrl: number | null = null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(suppliedHost)) {
    let parsed: URL
    try { parsed = new URL(suppliedHost) } catch { throw new Error('CONNECTION_URL_INVALID') }
    if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !parsed.hostname) {
      throw new Error('CONNECTION_URL_UNSUPPORTED')
    }
    host = parsed.hostname
    portFromUrl = parsed.port ? validPort(parsed.port) : null
    if (parsed.port && portFromUrl === null) throw new Error('CONNECTION_PORT_INVALID')
  }

  const portFromField = suppliedPort ? validPort(suppliedPort) : null
  if (suppliedPort && portFromField === null) throw new Error('CONNECTION_PORT_INVALID')
  if (portFromUrl !== null && portFromField !== null && portFromUrl !== portFromField) throw new Error('CONNECTION_PORT_CONFLICT')
  const port = portFromUrl ?? portFromField
  if (port === null) throw new Error('CONNECTION_PORT_REQUIRED')
  return Object.freeze({ host, port })
}
