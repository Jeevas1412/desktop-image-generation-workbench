import { expect, test } from 'vitest'
import { normalizeComfyUiConnectionInput } from './connection-profile'

test('accepts a copied ComfyUI HTTP address and extracts its host and port', () => {
  expect(normalizeComfyUiConnectionInput('http://192.168.10.8:8189', '8189')).toEqual({ host: '192.168.10.8', port: 8189 })
})

test('keeps the host and port form supported', () => {
  expect(normalizeComfyUiConnectionInput('192.168.10.8', '8189')).toEqual({ host: '192.168.10.8', port: 8189 })
})

test('does not accept URL credentials, routes or conflicting ports', () => {
  expect(() => normalizeComfyUiConnectionInput('http://user:pass@192.168.10.8:8189', '')).toThrow('CONNECTION_URL_UNSUPPORTED')
  expect(() => normalizeComfyUiConnectionInput('http://192.168.10.8:8189/api', '')).toThrow('CONNECTION_URL_UNSUPPORTED')
  expect(() => normalizeComfyUiConnectionInput('http://192.168.10.8:8189', '8188')).toThrow('CONNECTION_PORT_CONFLICT')
})
