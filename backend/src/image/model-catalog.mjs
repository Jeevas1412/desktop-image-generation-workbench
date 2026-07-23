const ALLOWED_DIRECTORY_IDS = new Set([
  'comfy.checkpoints',
  'comfy.unet',
  'comfy.vae',
  'comfy.text_encoders',
  'comfy.loras.sdxl',
  'comfy.loras.flux',
  'vlm.registry',
]);

const SHA256 = /^[a-f0-9]{64}$/i;

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
}

function verifyDistribution(artifact) {
  const distribution = artifact.distribution;
  if (!distribution || typeof distribution !== 'object') throw new Error(`${artifact.artifactId}: distribution is required.`);
  if (distribution.status !== 'downloadable') return;
  for (const field of ['sourceUrl', 'license', 'licenseUrl', 'sha256', 'sizeBytes', 'usagePolicy']) {
    if (distribution[field] === null || distribution[field] === undefined || distribution[field] === '') {
      throw new Error(`${artifact.artifactId}: downloadable artifact missing ${field}.`);
    }
  }
  if (!SHA256.test(distribution.sha256)) throw new Error(`${artifact.artifactId}: downloadable artifact has invalid sha256.`);
  if (!Number.isInteger(distribution.sizeBytes) || distribution.sizeBytes < 1) {
    throw new Error(`${artifact.artifactId}: downloadable artifact has invalid sizeBytes.`);
  }
}

export function validateModelCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('Catalog must be an object.');
  if (catalog.schemaVersion !== '1.0') throw new Error('Unsupported catalog schemaVersion.');
  if (!Array.isArray(catalog.capabilities) || !Array.isArray(catalog.artifacts)) throw new Error('Catalog requires capability and artifact arrays.');
  const artifacts = new Map();
  for (const artifact of catalog.artifacts) {
    requiredString(artifact?.artifactId, 'artifactId');
    if (artifacts.has(artifact.artifactId)) throw new Error(`Duplicate artifactId: ${artifact.artifactId}.`);
    if (!ALLOWED_DIRECTORY_IDS.has(artifact.targetDirectoryId)) throw new Error(`${artifact.artifactId}: targetDirectoryId is not allowed.`);
    requiredString(artifact.expectedFileName, `${artifact.artifactId}: expectedFileName`);
    verifyDistribution(artifact);
    for (const file of artifact.bundleFiles ?? []) {
      requiredString(file.fileName, `${artifact.artifactId}: bundle fileName`);
      if (!SHA256.test(file.sha256) || !Number.isInteger(file.sizeBytes) || file.sizeBytes < 1) {
        throw new Error(`${artifact.artifactId}: invalid bundle file metadata.`);
      }
    }
    artifacts.set(artifact.artifactId, artifact);
  }
  for (const capability of catalog.capabilities) {
    requiredString(capability?.capabilityId, 'capabilityId');
    if (!Array.isArray(capability.requiredArtifactIds) || capability.requiredArtifactIds.length === 0) {
      throw new Error(`${capability.capabilityId}: requiredArtifactIds must not be empty.`);
    }
    for (const artifactId of capability.requiredArtifactIds) {
      if (!artifacts.has(artifactId)) throw new Error(`${capability.capabilityId}: missing artifact ${artifactId}.`);
    }
  }
  return Object.freeze({
    schemaVersion: catalog.schemaVersion,
    catalogVersion: catalog.catalogVersion,
    capabilities: Object.freeze([...catalog.capabilities]),
    artifacts: Object.freeze([...catalog.artifacts]),
  });
}
