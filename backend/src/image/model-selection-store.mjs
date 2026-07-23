import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MODEL_SELECTION_INVALID');
  if (Object.keys(value).some((key) => !['coreCandidateId', 'coreId', 'verifiedAt', 'verification'].includes(key))) throw new Error('MODEL_SELECTION_INVALID');
  if (typeof value.coreCandidateId !== 'string' || value.coreCandidateId.length < 1 || value.coreCandidateId.length > 600 || /[\0\r\n]/.test(value.coreCandidateId)) throw new Error('MODEL_SELECTION_CORE_INVALID');
  // Pre-Alpha28 records have no verification evidence.  They remain readable
  // so the user can see what was selected, but generation and future saves
  // require a fresh registered-core verification.
  if (value.coreId === undefined) return Object.freeze({ coreCandidateId: value.coreCandidateId, legacy: true });
  if (typeof value.coreId !== 'string' || !/^[a-z0-9-]{3,80}$/.test(value.coreId)) throw new Error('MODEL_SELECTION_CORE_INVALID');
  if (typeof value.verifiedAt !== 'string' || Number.isNaN(Date.parse(value.verifiedAt))) throw new Error('MODEL_SELECTION_VERIFICATION_INVALID');
  if (!value.verification || typeof value.verification !== 'object' || Array.isArray(value.verification)
    || Object.keys(value.verification).some((key) => !['source', 'compatibility', 'missingResources'].includes(key))
    || value.verification.source !== 'comfy-object-info' || value.verification.compatibility !== 'workflow_ready'
    || !Array.isArray(value.verification.missingResources) || value.verification.missingResources.length !== 0) throw new Error('MODEL_SELECTION_VERIFICATION_INVALID');
  return Object.freeze({ coreCandidateId: value.coreCandidateId, coreId: value.coreId, verifiedAt: value.verifiedAt, verification: Object.freeze({ source: value.verification.source, compatibility: value.verification.compatibility, missingResources: Object.freeze([]) }) });
}

export function createModelSelectionStore({ userDataRoot } = {}) {
  if (typeof userDataRoot !== 'string' || !path.isAbsolute(userDataRoot)) throw new Error('MODEL_SELECTION_ROOT_REQUIRED');
  const directory = path.join(userDataRoot, 'profiles');
  const target = path.join(directory, 'model-selection.json');
  return Object.freeze({
    async load() {
      const raw = await readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      return raw === null ? null : normalizeSelection(JSON.parse(raw));
    },
    async save(selection) {
      const safe = normalizeSelection(selection);
      await mkdir(directory, { recursive: true });
      const temporary = `${target}.partial`;
      await writeFile(temporary, `${JSON.stringify(safe)}\n`, 'utf8');
      await rename(temporary, target);
      return safe;
    },
  });
}
