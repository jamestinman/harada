# Quick Start - Supabase Setup

Get your Harada Chart app running with Supabase in 10 minutes.

## Step 1: Create Supabase Project (2 min)

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Enter:
   - **Name**: `harada-chart`
   - **Database Password**: (create and save it!)
   - **Region**: Choose closest to you
4. Click "Create new project"
5. Wait ~2 minutes for setup

## Step 2: Get API Credentials (30 sec)

1. In Supabase dashboard → **Settings** → **API**
2. Copy these two values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

## Step 3: Configure Your App (1 min)

1. In your project root, create `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and paste your values:
   ```
   PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=eyJhbG...your-anon-key-here
   ```

3. Save the file

## Step 4: Set Up Database (2 min)

1. In Supabase dashboard → **SQL Editor**
2. Click "New Query"
3. Open `docs/database-schema.sql` in your code editor
4. Copy ALL the SQL code
5. Paste into Supabase SQL Editor
6. Click "Run" (bottom right)
7. Wait for "Success" message

## Step 5: Enable Realtime (30 sec)

1. In Supabase dashboard → **Database** → **Replication**
2. Find `harada_charts` in the table list
3. Toggle "Realtime" to **ON**

## Step 6: Test It! (2 min)

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173

3. Click "Sign In" in top right

4. Click "Sign up" and create an account with:
   - Email: your email
   - Password: at least 6 characters

5. Check for confirmation email (if required)

6. Once signed in:
   - Add some text to a cell
   - Watch the user menu show "Syncing..."
   - See "Last synced" timestamp update

7. Verify sync worked:
   - Go to Supabase dashboard → **Table Editor** → `harada_charts`
   - You should see your data!

## Step 7: Test Real-Time (Optional, 1 min)

1. Open app in two different browsers (or incognito)
2. Sign in with same account in both
3. Edit a cell in one browser
4. Watch it update in the other browser automatically!

## That's It! 🎉

Your Harada Chart is now syncing to the cloud!

## Common Issues

**"Invalid API key"**
- Check `.env` has correct values
- Restart dev server after changing `.env`

**"Policy violation"**
- Run the full `database-schema.sql` in SQL Editor
- Make sure no errors in SQL execution

**Email not arriving**
- Check spam folder
- Or disable email confirmation:
  - Supabase → **Authentication** → **Providers** → **Email**
  - Toggle off "Confirm email"

## Next Steps

- Read [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md) for detailed info
- Read [`docs/TESTING_CHECKLIST.md`](./docs/TESTING_CHECKLIST.md) to test all features
- Read [`docs/MIGRATION_SUMMARY.md`](./docs/MIGRATION_SUMMARY.md) for architecture details

## Need Help?

- Check browser console for errors
- Check Supabase logs in dashboard
- Review the SQL policies in database
- Open an issue on GitHub
