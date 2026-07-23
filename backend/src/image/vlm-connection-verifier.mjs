import { httpBaseForPrivateAddress, normalizePrivateNetworkProfile, resolvePrivateNetworkHost } from './private-network.mjs';

const MAX_TIMEOUT_MS = 8_000;

function outcome(state, detail) { return Object.freeze({ service: 'vlm', state, detail }); }

export function createVlmConnectionVerifier({ lookup, fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('VLM_CONNECTION_FETCH_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw new TypeError('VLM_CONNECTION_TIMEOUT_INVALID');
  async function inspect(profile) {
    let safe;
    let address;
    try {
      safe = normalizePrivateNetworkProfile(profile, 'VLM_CONNECTION');
      address = await resolvePrivateNetworkHost(safe.host, lookup ? { lookup } : undefined);
    } catch (error) {
      if (error?.message === 'PRIVATE_NETWORK_ADDRESS_REQUIRED') return outcome('not_lan', '仅允许连接局域网、回环或链路本地 VLM 地址。');
      return outcome('unresolved', '无法解析为局域网 VLM 地址。');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const base = httpBaseForPrivateAddress(address, safe.port, '/v1/');
      const response = await fetchImpl(new URL('models', base), { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response?.ok) return outcome('not_vlm', '端口可达，但 VLM 固定模型列表接口未通过验证。');
      const models = await response.json();
      if (!Array.isArray(models?.data)) return outcome('not_vlm', '端口返回的不是可识别的 VLM 模型列表。');
      return Object.freeze({ ...outcome('reachable', 'VLM 模型列表已验证；未提交生成或审核任务。'), address, port: safe.port, models });
    } catch (error) {
      if (error?.name === 'AbortError') return outcome('timeout', 'VLM 连接超时。');
      return outcome('unreachable', '无法连接 VLM 端口。');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ inspect, async verify(profile) { const value = await inspect(profile); return outcome(value.state, value.detail); } });
}
