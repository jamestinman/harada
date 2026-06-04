import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, BrowserWindow, Menu, MenuItem, ipcMain } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';

// Graceful handling of unhandled errors.
unhandled();

// Ensure the app name/menu title shows as "Haradato" (especially on macOS)
app.setName('Haradato');

const AUTH_MENU_ITEM_ID = 'haradato-auth-toggle';

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  new MenuItem({ label: 'Quit App', role: 'quit' }),
];

const getMainWindow = (): BrowserWindow | null => {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) return focused;
  const all = BrowserWindow.getAllWindows();
  return all.length > 0 ? all[0] : null;
};

const loadRoute = (path: string) => {
  const win = getMainWindow();
  if (!win) return;
  const url = `${myCapacitorApp.getCustomURLScheme()}://-/${path}`;
  win.loadURL(url);
};

const sendMenuCommand = (command: string) => {
  const win = getMainWindow();
  if (!win) return;
  win.webContents.send('haradato-menu-command', command);
};

const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  {
    label: 'Haradato',
    submenu: [
      {
        label: 'About Haradato',
        click: () => loadRoute('about'),
      },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Harada',
        click: () => loadRoute(''),
      },
      {
        label: 'Todo',
        click: () => loadRoute('todo'),
      },
    ],
  },
  {
    label: 'Settings',
    submenu: [
      {
        label: 'Settings',
        click: () => sendMenuCommand('settings'),
      },
      {
        id: AUTH_MENU_ITEM_ID,
        label: 'Sign in',
        click: () => sendMenuCommand('auth'),
      },
    ],
  },
];

ipcMain.on('haradato-auth-state', (_event, isSignedIn: boolean) => {
  const menu = Menu.getApplicationMenu();
  const authItem = menu?.getMenuItemById(AUTH_MENU_ITEM_ID);
  if (authItem) {
    authItem.label = isSignedIn ? 'Logout' : 'Sign in';
  }
});

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(
  capacitorFileConfig,
  trayMenuTemplate,
  appMenuBarMenuTemplate,
);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: capacitorFileConfig.electron.deepLinkingCustomProtocol ?? 'mycapacitorapp',
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Application
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// When the dock icon is clicked.
app.on('activate', async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

// Place all ipc or other electron api calls and custom functionality under this line
