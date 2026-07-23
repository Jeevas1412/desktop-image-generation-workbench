import dns from 'node:dns/promises';
import net from 'node:net';

export function isPrivateNetworkAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || (a === 192 && b === 168)
      || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return false;
}

export function normalizePrivateNetworkProfile(profile, code) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`${code}_PROFILE_INVALID`);
  if (Object.keys(profile).some((key) => !['host', 'port'].includes(key))) throw new Error(`${code}_PROFILE_INVALID`);
  if (typeof profile.host !== 'string' || profile.host.trim().length < 1 || profile.host.length > 253 || /[\\/@?#\s]/.test(profile.host)) throw new Error(`${code}_HOST_INVALID`);
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error(`${code}_PORT_INVALID`);
  return Object.freeze({ host: profile.host.trim(), port: profile.port });
}

export async function resolvePrivateNetworkHost(host, { lookup = dns.lookup } = {}) {
  const address = net.isIP(host) ? host : (await lookup(host, { family: 0 })).address;
  if (!isPrivateNetworkAddress(address)) throw new Error('PRIVATE_NETWORK_ADDRESS_REQUIRED');
  return address;
}

export function httpBaseForPrivateAddress(address, port, suffix = '') {
  return `http://${net.isIP(address) === 6 ? `[${address}]` : address}:${port}${suffix}`;
}
