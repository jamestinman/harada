import { browser } from '$app/environment';
import {
	isWebsiteTrackingActive,
	websiteTrackingBuildEnabled
} from '$lib/websiteTracking.js';

/** @deprecated Use {@link isWebsiteTrackingActive} - compile-time flag for static builds. */
export const consentUiEnabled = websiteTrackingBuildEnabled;

export const CONSENT_STORAGE_KEY = 'haradato-consent-v1';

/** EEA, UK, and Switzerland - Google Consent Mode region list. */
export const CONSENT_REQUIRED_REGIONS = [
	'AT',
	'BE',
	'BG',
	'HR',
	'CY',
	'CZ',
	'DK',
	'EE',
	'FI',
	'FR',
	'DE',
	'GR',
	'HU',
	'IE',
	'IT',
	'LV',
	'LT',
	'LU',
	'MT',
	'NL',
	'PL',
	'PT',
	'RO',
	'SK',
	'SI',
	'ES',
	'SE',
	'IS',
	'LI',
	'NO',
	'GB',
	'CH',
	'AD',
	'MC',
	'SM',
	'VA',
	'GI',
	'GG',
	'JE',
	'IM'
];

/** @typedef {'accepted' | 'rejected'} ConsentChoice */

export const CONSENT_DENIED = {
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied',
	analytics_storage: 'denied'
};

export const CONSENT_GRANTED = {
	ad_storage: 'granted',
	ad_user_data: 'granted',
	ad_personalization: 'granted',
	analytics_storage: 'granted'
};

/** @returns {ConsentChoice | null} */
export function loadStoredConsent() {
	if (!isWebsiteTrackingActive()) return null;
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
		if (raw === 'accepted' || raw === 'rejected') return raw;
	} catch {
		/* ignore */
	}
	return null;
}

/** @param {ConsentChoice} choice */
export function saveStoredConsent(choice) {
	if (!isWebsiteTrackingActive()) return;
	if (!browser) return;
	try {
		localStorage.setItem(CONSENT_STORAGE_KEY, choice);
	} catch {
		/* ignore */
	}
}

/** @param {string | undefined} region */
export function isConsentRequiredRegion(region) {
	if (!region) return false;
	return CONSENT_REQUIRED_REGIONS.includes(region.toUpperCase());
}

/** Best-effort signal that the visitor is likely in the EEA/UK/CH (for showing the opt-in banner). */
export function visitorLikelyRequiresConsent() {
	if (!isWebsiteTrackingActive()) return false;
	if (!browser) return false;

	const languages = navigator.languages?.length
		? navigator.languages
		: [navigator.language].filter(Boolean);

	for (const lang of languages) {
		const part = lang.split('-')[1];
		if (isConsentRequiredRegion(part)) return true;
	}

	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		if (
			tz.startsWith('Europe/') ||
			tz === 'Atlantic/Canary' ||
			tz === 'Atlantic/Madeira' ||
			tz === 'Atlantic/Azores'
		) {
			return true;
		}
	} catch {
		/* ignore */
	}

	return false;
}

/** Apply Google Consent Mode v2 defaults (call before gtag.js loads). */
export function applyGoogleConsentDefaults() {
	if (!isWebsiteTrackingActive()) return;
	if (!browser || typeof window.gtag !== 'function') return;

	window.gtag('consent', 'default', {
		...CONSENT_DENIED,
		region: CONSENT_REQUIRED_REGIONS,
		wait_for_update: 500
	});

	window.gtag('consent', 'default', {
		...CONSENT_GRANTED
	});
}

/** @param {typeof CONSENT_GRANTED} state */
export function applyGoogleConsentUpdate(state) {
	if (!isWebsiteTrackingActive()) return;
	if (!browser || typeof window.gtag !== 'function') return;
	window.gtag('consent', 'update', state);
}
