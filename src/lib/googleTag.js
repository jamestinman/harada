import { browser } from '$app/environment';
import {
	applyGoogleConsentDefaults,
	applyGoogleConsentUpdate,
	CONSENT_GRANTED,
	loadStoredConsent
} from '$lib/consent.js';
import {
	isWebsiteTrackingActive,
	websiteTrackingBuildEnabled
} from '$lib/websiteTracking.js';

/** Google Ads conversion tag - omitted from Capacitor static (iOS/Android) builds. */
export const GOOGLE_ADS_ID = 'AW-18068536389';

export const googleTagEnabled = websiteTrackingBuildEnabled;

/** @param {string} [id] */
export function initGoogleTag(id = GOOGLE_ADS_ID) {
	if (!isWebsiteTrackingActive()) return;
	if (!browser) return;
	if (typeof window.gtag === 'function') return;

	window.dataLayer = window.dataLayer || [];
	function gtag() {
		window.dataLayer.push(arguments);
	}
	window.gtag = gtag;

	applyGoogleConsentDefaults();

	const saved = loadStoredConsent();
	if (saved === 'accepted') {
		applyGoogleConsentUpdate(CONSENT_GRANTED);
	}

	gtag('js', new Date());
	gtag('config', id);

	const script = document.createElement('script');
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
	document.head.appendChild(script);
}
