import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Create Supabase client only if credentials are available
// This allows the app to work offline/local-first even without Supabase setup
let supabase = null;

try {
	if (PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY) {
		supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true
			}
		});
	} else {
		console.warn('Supabase credentials not configured. App will work in local-only mode.');
	}
} catch (error) {
	console.error('Failed to initialize Supabase client:', error);
	console.warn('App will work in local-only mode.');
}

export { supabase };
