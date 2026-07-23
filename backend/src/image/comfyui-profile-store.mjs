import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('COMFYUI_PROFILE_INVALID');
  if (Object.keys(profile).some((key) => !['host', 'port'].includes(key))) throw new Error('COMFYUI_PROFILE_INVALID');
  if (typeof profile.host !== 'string' || profile.host.trim().length < 1 || profile.host.length > 253 || /[\\/@?#\s]/.test(profile.host)) throw new Error('COMFYUI_PROFILE_HOST_INVALID');
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error('COMFYUI_PROFILE_PORT_INVALID');
  return Object.freeze({ host: profile.host.trim(), port: profile.port });
}

function normalizeRecord(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('COMFYUI_PROFILE_INVALID');
  if (Object.keys(profile).some((key) => !['host', 'port', 'verifiedAt'].includes(key))) throw new Error('COMFYUI_PROFILE_INVALID');
  const connection = normalizeProfile({ host: profile.host, port: profile.port });
  if (profile.verifiedAt !== undefined && (typeof profile.verifiedAt !== 'string' || Number.isNaN(Date.parse(profile.verifiedAt)))) throw new Error('COMFYUI_PROFILE_VERIFICATION_INVALID');
  return Object.freeze({ ...connection, verifiedAt: profile.verifiedAt ?? null });
}

export function createComfyUiProfileStore({ userDataRoot } = {}) {
  if (typeof userDataRoot !== 'string' || !path.isAbsolute(userDataRoot)) throw new Error('COMFYUI_PROFILE_ROOT_REQUIRED');
  const directory = path.join(userDataRoot, 'profiles');
  const target = path.join(directory, 'comfyui.json');
  return Object.freeze({
    async load() {
      const raw = await readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (raw === null) return null;
      const record = normalizeRecord(JSON.parse(raw));
      return Object.freeze({ host: record.host, port: record.port });
    },
    async loadRecord() {
      const raw = await readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      return raw === null ? null : normalizeRecord(JSON.parse(raw));
    },
    async save(profile, { verifiedAt = new Date().toISOString() } = {}) {
      const safe = normalizeProfile(profile);
      if (typeof verifiedAt !== 'string' || Number.isNaN(Date.parse(verifiedAt))) throw new Error('COMFYUI_PROFILE_VERIFICATION_INVALID');
      const record = Object.freeze({ ...safe, verifiedAt });
      await mkdir(directory, { recursive: true });
      const temporary = `${target}.partial`;
      await writeFile(temporary, `${JSON.stringify(record)}\n`, 'utf8');
      await rename(temporary, target);
      return safe;
    },
  });
}
