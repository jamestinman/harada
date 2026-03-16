import { supabase } from '$lib/supabaseClient.js';
import { browser } from '$app/environment';

class AuthStore {
	user = $state(null);
	session = $state(null);
	loading = $state(true);
	error = $state(null);

	constructor() {
		if (browser) {
			this.initialize();
		}
	}

	async initialize() {
		try {
			// If Supabase is not configured, skip auth initialization
			if (!supabase) {
				this.loading = false;
				return;
			}

			// Get initial session
			const {
				data: { session }
			} = await supabase.auth.getSession();
			this._applySession(session);

			// Listen for auth changes
			supabase.auth.onAuthStateChange((_event, session) => {
				this._applySession(session);
			});
		} catch (err) {
			console.error('Auth initialization error:', err);
			this.error = err.message;
		} finally {
			this.loading = false;
		}
	}

	_applySession(session) {
		this.session = session;
		const user = session?.user ?? null;
		if (user) {
			this.user = { ...user };
		} else {
			this.user = null;
		}
	}

	async signUp(email, password) {
		try {
			this.error = null;
			this.loading = true;

			if (!supabase) {
				throw new Error('Supabase is not configured. Please set up your .env file.');
			}

			const { data, error } = await supabase.auth.signUp({
				email,
				password
			});

			if (error) throw error;

			// Check if email confirmation is required
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

			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			if (error) throw error;

			if (data?.session) {
				this._applySession(data.session);
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

			const { data, error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: browser ? window.location.origin : undefined
				}
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

			if (!supabase) {
				// If Supabase not configured, just clear local state
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

			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: browser ? `${window.location.origin}/reset-password` : undefined
			});

			if (error) throw error;

			return {
				success: true,
				message: 'Password reset email sent. Please check your inbox.'
			};
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

			const { error } = await supabase.auth.updateUser({
				password: newPassword
			});

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
				data: {
					full_name: trimmedName
				}
			});

			if (error) throw error;

			if (data?.user) {
				this.user = { ...data.user };
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
