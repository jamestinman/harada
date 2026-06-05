import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';

/** False in Capacitor static (iOS/Android) builds - set at compile time. */
export const websiteTrackingBuildEnabled = !__STATIC_APP_BUILD__;

/** Google tags and cookie consent - website only, never in the native app. */
export function isWebsiteTrackingActive() {
	if (!websiteTrackingBuildEnabled) return false;
	if (!browser) return false;
	return !Capacitor.isNativePlatform();
}
