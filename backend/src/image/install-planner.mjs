const GIB = 1024 ** 3;

function artifactMap(catalog) {
  return new Map(catalog.artifacts.map((artifact) => [artifact.artifactId, artifact]));
}

function nonEmptyUniqueIds(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('At least one catalog artifactId is required.');
  if (value.some((item) => typeof item !== 'string' || item.length === 0)) throw new Error('artifactIds must contain only strings.');
  if (new Set(value).size !== value.length) throw new Error('artifactIds must not contain duplicates.');
  return value;
}

function requiredDiskBytes(downloadBytes) {
  // A partial download plus integrity validation needs headroom without using
  // any renderer-controlled value. 10% transfer overhead + 1 GiB floor.
  return Math.ceil(downloadBytes * 1.1) + GIB;
}

export function createInstallPlan({ catalog, artifactIds, systemState, now = () => new Date() }) {
  const ids = nonEmptyUniqueIds(artifactIds);
  if (!systemState || typeof systemState !== 'object') throw new Error('systemState is required.');
  const running = Number(systemState.queue?.running ?? 0);
  const pending = Number(systemState.queue?.pending ?? 0);
  if (!Number.isInteger(running) || !Number.isInteger(pending) || running < 0 || pending < 0) throw new Error('Queue state is invalid.');
  if (running + pending > 0) throw new Error('QUEUE_BUSY');
  const artifacts = artifactMap(catalog);
  const existing = new Map(Object.entries(systemState.existingArtifacts ?? {}));
  const items = [];
  for (const artifactId of ids) {
    const artifact = artifacts.get(artifactId);
    if (!artifact) throw new Error(`UNKNOWN_ARTIFACT:${artifactId}`);
    const distribution = artifact.distribution;
    if (distribution.status !== 'downloadable') throw new Error(`SOURCE_REQUIRES_MANUAL_IMPORT:${artifactId}`);
    const existingState = existing.get(artifactId) ?? 'missing';
    if (!['missing', 'matching', 'conflict'].includes(existingState)) throw new Error(`INVALID_EXISTING_STATE:${artifactId}`);
    if (existingState === 'conflict') throw new Error(`TARGET_CONFLICT:${artifactId}`);
    items.push(Object.freeze({
      artifactId,
      action: existingState === 'matching' ? 'reuse' : 'download',
      targetDirectoryId: artifact.targetDirectoryId,
      expectedFileName: artifact.expectedFileName,
      sourceUrl: distribution.sourceUrl,
      sha256: distribution.sha256,
      sizeBytes: distribution.sizeBytes,
      license: distribution.license,
      acknowledgementRequired: distribution.acknowledgementRequired === true,
    }));
  }
  const downloadBytes = items.filter((item) => item.action === 'download').reduce((sum, item) => sum + item.sizeBytes, 0);
  const diskRequiredBytes = requiredDiskBytes(downloadBytes);
  const availableBytes = Number(systemState.availableDiskBytes);
  if (!Number.isSafeInteger(availableBytes) || availableBytes < 0) throw new Error('DISK_STATE_INVALID');
  if (availableBytes < diskRequiredBytes) throw new Error('INSUFFICIENT_DISK');
  const timestamp = now();
  return Object.freeze({
    planId: `install-${timestamp.getTime()}`,
    kind: 'install-plan',
    state: 'awaiting-confirmation',
    createdAt: timestamp.toISOString(),
    queue: Object.freeze({ running, pending }),
    downloadBytes,
    diskRequiredBytes,
    items: Object.freeze(items),
  });
}
