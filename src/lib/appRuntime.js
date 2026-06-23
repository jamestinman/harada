import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';

/** True in iOS, Android, Electron, and other non-browser installs. */
export function isPackagedApp() {
	if (!browser) return false;
	if (Capacitor.isNativePlatform()) return true;
	return Boolean(window.HaradatoElectron);
}
