import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateModelCatalog } from '../src/image/model-catalog.mjs';

const catalogPath = new URL('../../model-catalog/catalog.v1.json', import.meta.url);

async function catalogFixture() {
  return JSON.parse(await readFile(catalogPath, 'utf8'));
}

test('the checked-in catalog has only fixed target directories and complete downloadable metadata', async () => {
  const catalog = validateModelCatalog(await catalogFixture());
  assert.equal(catalog.capabilities.length, 5);
  assert.equal(catalog.artifacts.length, 8);
  assert.deepEqual(
    catalog.artifacts.filter((artifact) => artifact.distribution.status === 'downloadable').map((artifact) => artifact.artifactId),
    ['pony.checkpoint', 'sdxl.vae', 'flux.clip-l', 'flux.t5xxl'],
  );
});

test('rejects a downloadable artifact that lacks a hash or uses an arbitrary target path', async () => {
  const missingHash = await catalogFixture();
  missingHash.artifacts[0].distribution.sha256 = null;
  assert.throws(() => validateModelCatalog(missingHash), /missing sha256/);

  const arbitraryPath = await catalogFixture();
  arbitraryPath.artifacts[0].targetDirectoryId = 'C:/arbitrary/path';
  assert.throws(() => validateModelCatalog(arbitraryPath), /not allowed/);
});

test('rejects a capability that names a nonexistent dependency', async () => {
  const broken = await catalogFixture();
  broken.capabilities[0].requiredArtifactIds.push('not-in-catalog');
  assert.throws(() => validateModelCatalog(broken), /missing artifact/);
});
