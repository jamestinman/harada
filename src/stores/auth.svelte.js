import { supabase } from '$lib/supabaseClient.js';
import { browser } from '$app/environment';
import {
	getEmailConfirmationRedirectUrl,
	getOAuthRedirectUrl,
	getPasswordRecoveryRedirectUrl
} from '$lib/authRedirect.js';

const LAST_USER_KEY = 'harada_last_user';

class AuthStore {
	user = $state(null);
	session = $state(null);
	loading = $state(true);
	error = $state(null);
	// Persisted across offline periods - used for display only, not for API auth
	lastKnownUser = $state(null);
	/** Resolves once the initial getSession() check has finished */
	_readyPromise = /** @type {Promise<void> | null} */ (null);
	_readyResolve = /** @type {(() => void) | null} */ (null);
	/** Registered by Nav so other UI (e.g. SignInBanner) can open the auth modal */
	openSignInModal = /** @type {() => void} */ (() => {});

	constructor() {
		if (browser) {
			this._readyPromise = new Promise((resolve) => {
				this._readyResolve = resolve;
			});

			// Restore cached display user immediately so UI doesn't flicker
			try {
				const cached = localStorage.getItem(LAST_USER_KEY);
				if (cached) this.lastKnownUser = JSON.parse(cached);
			} catch {}

			this.initialize();

			// When coming back online, try to silently refresh an expired session
			window.addEventListener('online', () => this._tryRefreshSession());
		}
	}

	async initialize() {
		try {
			if (!supabase) {
				this.loading = false;
				return;
			}

			const {
				data: { session }
			} = await supabase.auth.getSession();
			this._applySession(session);

			supabase.auth.onAuthStateChange((event, session) => {
				if (event === 'SIGNED_OUT') {
					// Keep lastKnownUser unless the user explicitly signs out (see signOut()).
					// When offline the token can't be refreshed so Supabase fires SIGNED_OUT
					// even though the user hasn't intentionally logged out.
					// Always clear live session/user - saves won't try to push to Supabase
					this.session = null;
					this.user = null;
				} else {
					this._applySession(session);
					if (session?.user) this._persistLastKnownUser(session.user);
				}
			});
		} catch (err) {
			console.error('Auth initialization error:', err);
			this.error = err.message;
		} finally {
			this.loading = false;
			this._readyResolve?.();
		}
	}

	whenReady() {
		if (!browser || !this.loading) return Promise.resolve();
		return this._readyPromise ?? Promise.resolve();
	}

	async _tryRefreshSession() {
		if (!supabase || this.user) return;
		// If we have a cached user but no live session, try refreshing with Supabase.
		// This succeeds when the refresh token is still valid (up to 60 days by default).
		try {
			const { data } = await supabase.auth.getSession();
			if (data.session) {
				this._applySession(data.session);
				this._persistLastKnownUser(data.session.user);
			}
		} catch (err) {
			console.warn('Session refresh on reconnect failed:', err.message);
		}
	}

	_applySession(session) {
		this.session = session;
		const user = session?.user ?? null;
		this.user = user ? { ...user } : null;
	}

	_persistLastKnownUser(user) {
		const minimal = {
			id: user.id,
			email: user.email,
			user_metadata: user.user_metadata
		};
		this.lastKnownUser = minimal;
		try {
			localStorage.setItem(LAST_USER_KEY, JSON.stringify(minimal));
		} catch {}
	}

	_clearLastKnownUser() {
		this.lastKnownUser = null;
		try {
			localStorage.removeItem(LAST_USER_KEY);
		} catch {}
	}

	async signUp(email, password) {
		try {
			this.error = null;
			this.loading = true;

			if (!supabase) {
				throw new Error('Supabase is not configured. Please set up your .env file.');
			}

			const emailRedirectTo = getEmailConfirmationRedirectUrl();
			const { data, error } = await supabase.auth.signUp({
				email,
				password,
				...(emailRedirectTo ? { options: { emailRedirectTo } } : {})
			});
			if (error) throw error;

			if (data.user && !data.session) {
				return {
					success: true,
					requiresConfirmation: true,
					message: 'Please check your email (will be from Supabase) to confirm your account'
				};
			}

			return { success: true, requiresConfirmation: false };
		} catch (err) {
			console.error('Sign up error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		} finally {
			this.loading = false;
		}
	}

	async signIn(email, password) {
		try {
			this.error = null;
			this.loading = true;

			if (!supabase) {
				throw new Error('Supabase is not configured. Please set up your .env file.');
			}

			const { data, error } = await supabase.auth.signInWithPassword({ email, password });
			if (error) throw error;

			if (data?.session) {
				this._applySession(data.session);
				this._persistLastKnownUser(data.session.user);
			}

			return { success: true };
		} catch (err) {
			console.error('Sign in error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		} finally {
			this.loading = false;
		}
	}

	async signInWithOAuth(provider) {
		try {
			this.error = null;

			if (!supabase) {
				throw new Error('Supabase is not configured. Please set up your .env file.');
			}

			const redirectTo = getOAuthRedirectUrl();
			const { data, error } = await supabase.auth.signInWithOAuth({
				provider,
				...(redirectTo ? { options: { redirectTo } } : {})
			});

			if (error) throw error;
			return { success: true };
		} catch (err) {
			console.error('OAuth sign in error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		}
	}

	async signOut() {
		try {
			this.error = null;
			this.loading = true;

			// Always clear cached user on an explicit sign-out
			this._clearLastKnownUser();

			if (!supabase) {
				this.user = null;
				this.session = null;
				return { success: true };
			}

			const { error } = await supabase.auth.signOut();
			if (error) throw error;

			this._applySession(null);

			return { success: true };
		} catch (err) {
			console.error('Sign out error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		} finally {
			this.loading = false;
		}
	}

	async resetPassword(email) {
		try {
			this.error = null;
			this.loading = true;

			const redirectTo = getPasswordRecoveryRedirectUrl();
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				...(redirectTo ? { redirectTo } : {})
			});

			if (error) throw error;

			return { success: true, message: 'Password reset email sent. Please check your inbox.' };
		} catch (err) {
			console.error('Password reset error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		} finally {
			this.loading = false;
		}
	}

	async updatePassword(newPassword) {
		try {
			this.error = null;
			this.loading = true;

			const { error } = await supabase.auth.updateUser({ password: newPassword });
			if (error) throw error;

			return { success: true, message: 'Password updated successfully' };
		} catch (err) {
			console.error('Password update error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		} finally {
			this.loading = false;
		}
	}

	async updateProfile({ fullName }) {
		try {
			this.error = null;
			this.loading = true;

			if (!supabase) {
				throw new Error('Supabase is not configured. Please set up your .env file.');
			}

			const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';

			const { data, error } = await supabase.auth.updateUser({
				data: { full_name: trimmedName }
			});

			if (error) throw error;

			if (data?.user) {
				this.user = { ...data.user };
				this._persistLastKnownUser(data.user);
			}

			return { success: true, message: 'Profile updated successfully' };
		} catch (err) {
			console.error('Profile update error:', err);
			this.error = err.message;
			return { success: false, error: err.message };
		} finally {
			this.loading = false;
		}
	}
}

export const authStore = new AuthStore();
