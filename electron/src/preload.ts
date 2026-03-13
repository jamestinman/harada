import { contextBridge, ipcRenderer } from 'electron';

require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below
console.log('User Preload!');

contextBridge.exposeInMainWorld('HaradatoElectron', {
  onMenuCommand(callback: (command: string) => void) {
    const channel = 'haradato-menu-command';
    const listener = (_event: unknown, command: string) => {
      if (typeof callback === 'function') {
        callback(command);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },

  setAuthMenuState(isSignedIn: boolean) {
    ipcRenderer.send('haradato-auth-state', !!isSignedIn);
  },
});
