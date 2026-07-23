import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Windows installer excludes model and user data from packaged resources and preserves app data on uninstall', async () => {
  const config = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(config.build.asar, true); assert.equal(config.build.nsis.deleteAppDataOnUninstall, false); assert.equal(config.build.nsis.createDesktopShortcut, true);
  assert.ok(config.build.files.includes('build/icon.ico'));
  assert.deepEqual(config.build.extraResources.map((item) => item.to), ['frontend/dist', 'backend/src', 'model-catalog', 'contracts']);
  assert.equal(JSON.stringify(config.build.extraResources).match(/models|outputs|semifinished|logs/), null);
});

test('desktop main process keeps one instance and restores the existing workbench window', async () => {
  const source = await readFile(new URL('../src/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /app\.requestSingleInstanceLock\(\)/);
  assert.match(source, /app\.on\('second-instance', \(\) => showMainWindow\(\)\)/);
  assert.match(source, /mainWindow\.show\(\);\s*mainWindow\.focus\(\);/);
});
