import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrayController } from '../src/tray-controller.mjs';

function createHarness({ destroyed = false, minimized = false } = {}) {
  const calls = [];
  const window = {
    focus: () => calls.push('focus'),
    hide: () => calls.push('hide'),
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
  };
  const events = new Map();
  const app = { on: (name, handler) => events.set(name, handler), quit: () => calls.push('quit') };
  const tray = { on: (name, handler) => events.set(`tray:${name}`, handler), setContextMenu: (menu) => { tray.menu = menu; }, setToolTip: (value) => { tray.tooltip = value; } };
  const controller = createTrayController({
    app,
    Menu: { buildFromTemplate: (template) => template },
    Tray: class { constructor(iconPath) { tray.iconPath = iconPath; return tray; } },
    iconPath: 'icon.ico',
    getMainWindow: () => window,
    createWindow: () => window,
  });
  return { app, calls, controller, events, tray };
}

test('tray controller shows, restores and focuses the main window', () => {
  const harness = createHarness({ minimized: true });
  harness.controller.showMainWindow();
  assert.deepEqual(harness.calls, ['restore', 'show', 'focus']);
});

test('tray controller hides on close until the app is quitting', () => {
  const harness = createHarness();
  assert.equal(harness.controller.shouldHideOnClose(), true);
  harness.controller.hideMainWindow();
  harness.events.get('before-quit')();
  assert.equal(harness.controller.shouldHideOnClose(), false);
  assert.deepEqual(harness.calls, ['hide']);
});

test('tray menu restores the app and has an explicit quit action', () => {
  const harness = createHarness();
  harness.controller.install();
  assert.equal(harness.tray.iconPath, 'icon.ico');
  assert.match(harness.tray.tooltip, /本地验收/);
  harness.tray.menu[0].click();
  harness.tray.menu[2].click();
  assert.deepEqual(harness.calls, ['show', 'focus', 'quit']);
});
