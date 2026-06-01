/** No-op replacement for Capacitor static (iOS/Android) builds. */
export { websiteTrackingBuildEnabled as consentUiEnabled } from '$lib/websiteTracking.stub.js';

export const CONSENT_STORAGE_KEY = '';
export const CONSENT_REQUIRED_REGIONS = [];
export const CONSENT_DENIED = {};
export const CONSENT_GRANTED = {};

export function loadStoredConsent() {
	return null;
}

export function saveStoredConsent() {}

export function isConsentRequiredRegion() {
	return false;
}

export function visitorLikelyRequiresConsent() {
	return false;
}

export function applyGoogleConsentDefaults() {}

export function applyGoogleConsentUpdate() {}
