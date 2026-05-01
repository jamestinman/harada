import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { Capacitor } from '@capacitor/core';

function trimOrigin(url) {
	if (!url || typeof url !== 'string') return '';
	return url.trim().replace(/\/$/, '');
}

/**
 * Base URL (https://…) for Supabase auth redirects. Must match entries under
 * Authentication → URL Configuration → Redirect URLs in Supabase.
 * Do not use `window.location.origin` on Capacitor - it is `capacitor://localhost`
 * and breaks confirmation links, password recovery, and OAuth.
 */
export function getAuthRedirectOrigin() {
	const fromEnv = trimOrigin(env.PUBLIC_APP_ORIGIN);
	if (fromEnv) return fromEnv;

	if (!browser || typeof window === 'undefined') return '';

	const o = window.location.origin;
	if (/^https:\/\//i.test(o)) return o;
	// Local dev only
	if (/^http:\/\/localhost(?::\d+)?$/i.test(o)) return o;
	if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(o)) return o;

	return '';
}

/** Same-origin URL for OAuth `redirectTo` (Supabase redirects back here after provider login). */
export function getOAuthRedirectUrl() {
	const origin = getAuthRedirectOrigin();
	if (origin) return `${origin}/`;

	if (browser && typeof window !== 'undefined') {
		try {
			if (!Capacitor.isNativePlatform()) return `${window.location.origin}/`;
		} catch {
			return `${window.location.origin}/`;
		}
	}

	return undefined;
}

/** Used with signUp → options.emailRedirectTo (confirmation email link target). */
export function getEmailConfirmationRedirectUrl() {
	const origin = getAuthRedirectOrigin();
	return origin ? `${origin}/` : undefined;
}

/**
 * Password recovery email link. Supabase appends recovery tokens in the hash.
 * Our dedicated /reset-password route then lets the user set a new password.
 */
export function getPasswordRecoveryRedirectUrl() {
	const origin = getAuthRedirectOrigin();
	return origin ? `${origin}/reset-password` : undefined;
}
