export function createTrayController({ app, Menu, Tray, iconPath, getMainWindow, createWindow }) {
  let isQuitting = false;
  let tray;

  function showMainWindow() {
    let window = getMainWindow();
    if (!window || window.isDestroyed()) window = createWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return window;
  }

  function hideMainWindow() {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) window.hide();
  }

  function install() {
    tray = new Tray(iconPath);
    tray.setToolTip('DGX 智能生图工作台（本地验收）');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]));
    tray.on('double-click', showMainWindow);
    return tray;
  }

  app.on('before-quit', () => { isQuitting = true; });
  return { hideMainWindow, install, shouldHideOnClose: () => !isQuitting, showMainWindow };
}
