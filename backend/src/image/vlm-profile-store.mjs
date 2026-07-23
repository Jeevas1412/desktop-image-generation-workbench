import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePrivateNetworkProfile } from './private-network.mjs';

export function createVlmProfileStore({ userDataRoot } = {}) {
  if (typeof userDataRoot !== 'string' || !path.isAbsolute(userDataRoot)) throw new Error('VLM_PROFILE_ROOT_REQUIRED');
  const directory = path.join(userDataRoot, 'profiles');
  const target = path.join(directory, 'vlm.json');
  return Object.freeze({
    async load() {
      const raw = await readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      return raw === null ? null : normalizePrivateNetworkProfile(JSON.parse(raw), 'VLM_PROFILE');
    },
    async save(profile) {
      const safe = normalizePrivateNetworkProfile(profile, 'VLM_PROFILE');
      await mkdir(directory, { recursive: true });
      const temporary = `${target}.partial`;
      await writeFile(temporary, `${JSON.stringify(safe)}\n`, 'utf8');
      await rename(temporary, target);
      return safe;
    },
  });
}
