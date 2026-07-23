import dns from 'node:dns/promises';
import { httpBaseForPrivateAddress, normalizePrivateNetworkProfile, resolvePrivateNetworkHost } from './private-network.mjs';

const MAX_TIMEOUT_MS = 8_000;

function outcome(state, detail) { return Object.freeze({ service: 'comfyui', state, detail }); }

export function createComfyUiConnectionVerifier({ lookup = dns.lookup, fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  if (typeof lookup !== 'function' || typeof fetchImpl !== 'function') throw new TypeError('COMFYUI_CONNECTION_DEPENDENCIES_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw new TypeError('COMFYUI_CONNECTION_TIMEOUT_INVALID');

  async function inspect(profile, { includeQueue = false } = {}) {
      const { host, port } = normalizePrivateNetworkProfile(profile, 'COMFYUI_CONNECTION');
      let address;
      try {
        address = await resolvePrivateNetworkHost(host, { lookup });
      } catch (error) {
        return error?.message === 'PRIVATE_NETWORK_ADDRESS_REQUIRED'
          ? outcome('not_lan', '仅允许连接局域网、回环或链路本地地址。')
          : outcome('unresolved', '无法解析为局域网地址。');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const base = httpBaseForPrivateAddress(address, port);
        const response = await fetchImpl(`${base}/object_info`, {
          method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal,
        });
        if (!response?.ok) return outcome('not_comfyui', '端口可达，但固定 ComfyUI 只读状态接口未通过验证。');
        const body = await response.json();
        if (!body || typeof body !== 'object') return outcome('not_comfyui', '端口返回的不是可识别的 ComfyUI 节点信息。');
        const queueResponse = includeQueue
          ? await fetchImpl(`${base}/queue`, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal })
          : null;
        const queue = queueResponse?.ok ? await queueResponse.json().catch(() => null) : null;
        const count = (value) => Array.isArray(value) ? value.length : 0;
        // Keep the resolved numeric endpoint as evidence. Callers must use
        // this address after verification instead of resolving the hostname again.
        return Object.freeze({ ...outcome('reachable', 'ComfyUI 只读节点接口已验证；未提交任务、未修改队列。'), address, port, objectInfo: body, queue: Object.freeze({ running: count(queue?.queue_running), pending: count(queue?.queue_pending) }) });
      } catch (error) {
        if (error?.name === 'AbortError') return outcome('timeout', '连接超时，请检查 ComfyUI 是否监听该局域网端口。');
        return outcome('unreachable', '无法连接该 ComfyUI 端口。');
      } finally { clearTimeout(timer); }
  }

  return Object.freeze({
    // Connection setup checks one fixed, read-only ComfyUI endpoint. Queue
    // inspection is deliberately deferred until the user asks to read models.
    async inspect(profile) { return inspect(profile, { includeQueue: true }); },
    async verify(profile) { const value = await inspect(profile); return outcome(value.state, value.detail); },
  });
}
