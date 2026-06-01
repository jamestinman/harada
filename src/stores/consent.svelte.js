import { browser } from '$app/environment';
import {
	applyGoogleConsentUpdate,
	CONSENT_GRANTED,
	CONSENT_DENIED,
	loadStoredConsent,
	saveStoredConsent,
	visitorLikelyRequiresConsent
} from '$lib/consent.js';
import { isWebsiteTrackingActive } from '$lib/websiteTracking.js';

class ConsentStore {
	/** @type {import('$lib/consent.js').ConsentChoice | null} */
	choice = $state(null);
	/** User opened cookie preferences from the footer. */
	preferencesOpen = $state(false);
	hydrated = $state(false);

	constructor() {
		if (!browser || !isWebsiteTrackingActive()) return;
		this.choice = loadStoredConsent();
		this.hydrated = true;
	}

	bannerVisible = $derived.by(() => {
		if (!isWebsiteTrackingActive() || !this.hydrated) return false;
		if (this.preferencesOpen) return true;
		if (this.choice !== null) return false;
		return visitorLikelyRequiresConsent();
	});

	accept() {
		if (!isWebsiteTrackingActive()) return;
		this.choice = 'accepted';
		this.preferencesOpen = false;
		saveStoredConsent('accepted');
		applyGoogleConsentUpdate(CONSENT_GRANTED);
	}

	reject() {
		if (!isWebsiteTrackingActive()) return;
		this.choice = 'rejected';
		this.preferencesOpen = false;
		saveStoredConsent('rejected');
		applyGoogleConsentUpdate(CONSENT_DENIED);
	}

	openPreferences() {
		if (!isWebsiteTrackingActive()) return;
		this.preferencesOpen = true;
	}

	closePreferences() {
		this.preferencesOpen = false;
	}
}

export const consentStore = new ConsentStore();
