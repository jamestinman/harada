# Supabase Setup Guide

This guide will help you set up Supabase authentication and database for the Harada Chart app.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Click "New Project"
3. Fill in:
   - **Project name**: `harada-chart` (or your preferred name)
   - **Database password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
   - **Pricing plan**: Free tier is fine to start
4. Wait for project to be created (~2 minutes)

## 2. Get Your API Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys")

## 3. Configure Your App

1. In the root of your project, create a `.env` file (copy from `.env.example`)
2. Add your credentials:

```bash
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important**: Add `.env` to your `.gitignore` to keep your credentials secret!

## 4. Set Up the Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the entire contents of `docs/database-schema.sql`
4. Paste into the SQL Editor
5. Click "Run" to execute the SQL

This will create:
- `harada_charts` table to store your chart data
- Row Level Security (RLS) policies so users can only access their own data
- Real-time subscriptions for live updates
- Automatic `updated_at` timestamp trigger
- `chart_events` table: append-only log of structural operations (goal moves,
  merges, clears) that devices replay in order, so a stale device cannot
  resurrect a goal that was reorganized elsewhere

**Existing projects**: run `docs/patches/add-chart-events.sql` in the SQL
Editor to add the events table to an already-set-up database. Until it is
applied, the app logs one console warning and falls back to state-only sync.

## 5. Enable Email Authentication

1. Go to **Authentication** → **Providers**
2. Make sure **Email** is enabled (it should be by default)
3. Optional: Configure email templates under **Authentication** → **Email Templates**

### Optional: Enable OAuth Providers

To enable Google, GitHub, or other OAuth providers:

1. Go to **Authentication** → **Providers**
2. Enable the provider you want (e.g., Google)
3. Follow the instructions to create OAuth credentials
4. Paste your Client ID and Client Secret

## 6. Enable Realtime (Optional but Recommended)

1. Go to **Database** → **Replication**
2. Find the `harada_charts` table
3. Toggle "Realtime" to ON

This enables live updates across devices when you make changes to your chart.

## 7. Test Your Setup

1. Start your development server: `npm run dev`
2. Open the app in your browser
3. Click "Sign In" in the top right
4. Create a new account with your email
5. Check your email for a confirmation link (if email confirmation is enabled)
6. Once signed in, your data will automatically sync to Supabase!

## How It Works

### Local-First Architecture

The app uses a **local-first** approach:

1. **Offline**: All changes save to localStorage immediately
2. **Online + Logged In**: Changes sync to Supabase (debounced every 1 second)
3. **Multiple Devices**: Real-time subscriptions keep all devices in sync

### Data Migration

When you first sign in:
- The app checks if you have data in Supabase
- If not, it automatically migrates your localStorage data to the cloud
- You won't lose any data!

### Sync Status

When logged in, you'll see sync status in the user menu:
- **Syncing...**: Currently uploading changes
- **Last synced**: Timestamp of last successful sync
- **Sync error**: If something went wrong

## Troubleshooting

### "Invalid API key" error

- Double-check your `.env` file has the correct values
- Make sure you're using the **anon** key, not the service_role key
- Restart your dev server after changing `.env`

### Email not being sent

- Check **Authentication** → **Email Templates** → **Confirm signup** is enabled
- For development, you can disable email confirmation:
  - Go to **Authentication** → **Settings**
  - Toggle off "Enable email confirmations"

### RLS (Row Level Security) errors

- Make sure you ran the entire `database-schema.sql` script
- Check **Authentication** → **Policies** shows policies for `harada_charts`
- The policies ensure users can only access their own data

### Real-time not working

- Make sure you enabled Realtime for the `harada_charts` table
- Check browser console for connection errors
- Try refreshing the page

## Security Notes

- **Never commit your `.env` file** to version control
- The `anon` key is safe to use in the browser (it's public)
- Row Level Security ensures users can't access each other's data
- For production, consider adding rate limiting via Supabase Edge Functions

## Next Steps

- **Deploy**: Deploy to Vercel, Netlify, or your preferred host
- **Custom Domain**: Add a custom domain in your hosting provider
- **Email**: Set up a custom SMTP server for branded emails
- **Analytics**: Add Supabase Analytics to track usage
- **Backups**: Enable automated backups in Supabase dashboard

## Support

If you run into issues:
1. Check the browser console for errors
2. Check the Supabase logs in your dashboard
3. Review the SQL policies in your database
4. Open an issue on GitHub
