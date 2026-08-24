# Supabase Integration Testing Checklist

Use this checklist to verify the Supabase integration is working correctly.

## Prerequisites

- [ ] Supabase project created
- [ ] Database schema executed (`database-schema.sql`)
- [ ] `.env` file created with correct credentials
- [ ] Dependencies installed (`npm install`)
- [ ] Dev server running (`npm run dev`)

## 1. Authentication Tests

### Sign Up
- [ ] Click "Sign In" button in header
- [ ] Switch to "Sign Up" mode
- [ ] Enter email and password
- [ ] Password confirmation works
- [ ] Password validation works (min 6 characters)
- [ ] Sign up succeeds
- [ ] Check email for confirmation (if enabled)
- [ ] User menu appears after sign up

### Sign In
- [ ] Open app in new browser/incognito
- [ ] Click "Sign In"
- [ ] Enter existing credentials
- [ ] Sign in succeeds
- [ ] User menu appears with correct email
- [ ] User menu shows avatar with first letter of email

### Sign Out
- [ ] Click user menu
- [ ] Click "Sign out"
- [ ] User menu disappears
- [ ] "Sign In" button reappears
- [ ] Data still in localStorage (local-first)

### Password Reset (Optional)
- [ ] Click "Sign In"
- [ ] Click "Forgot password?"
- [ ] Enter email
- [ ] Check email for reset link
- [ ] Follow link and reset password
- [ ] Sign in with new password

## 2. Data Sync Tests

### Initial Sync (New User)
- [ ] Sign up as new user
- [ ] User menu shows "Syncing..." briefly
- [ ] Sync completes (check user menu)
- [ ] No errors in console
- [ ] Check Supabase dashboard → Table Editor → `harada_charts`
- [ ] Your user_id appears with empty grid/todos

### Data Migration (Existing Local Data)
- [ ] Sign out
- [ ] Add some data to chart (text in cells)
- [ ] Add some todos
- [ ] Data saves to localStorage
- [ ] Sign in
- [ ] Data automatically uploads to Supabase
- [ ] Check Supabase dashboard → data appears
- [ ] User menu shows "Last synced: [time]"

### Sync on Edit
- [ ] While signed in, edit a cell
- [ ] User menu shows "Syncing..."
- [ ] Syncing completes within 1-2 seconds
- [ ] "Last synced" timestamp updates
- [ ] Check Supabase dashboard → changes appear
- [ ] No errors in console

### Offline Mode
- [ ] While signed in, disconnect internet (browser dev tools → Network → Offline)
- [ ] Edit some cells
- [ ] Changes save to localStorage
- [ ] User menu might show sync error (expected)
- [ ] Reconnect internet
- [ ] Make another edit
- [ ] Sync succeeds
- [ ] All changes appear in Supabase

## 3. Real-Time Sync Tests

### Same User, Two Devices
- [ ] Sign in on Device A (e.g., Chrome)
- [ ] Sign in on Device B (e.g., Firefox/Safari)
- [ ] Edit a cell on Device A
- [ ] Cell updates on Device B automatically (within 1-2 seconds)
- [ ] Edit a cell on Device B
- [ ] Cell updates on Device A automatically
- [ ] No infinite loops or flickering

### Structural Ops Across Devices (chart_events)
Requires docs/patches/add-chart-events.sql applied to the Supabase project.
- [ ] Device A and B signed in, both showing the same chart
- [ ] Move a goal (drag to empty cell) on A → B shows the move, todos/notes follow
- [ ] Merge two goals on A → B shows the merged goal; source stays gone on both
- [ ] Clear a goal on A → B clears it; its tasks land in Z2 on both
- [ ] Stale device: put B offline BEFORE a merge on A, edit a todo under the
      source goal on B, bring B online → todo ends up under the merged target
      goal, the old goal does NOT resurrect
- [ ] chart_events rows appear in Supabase (one per op, batch/device ids set)
- [ ] With the patch NOT applied, ops still work locally and a single console
      warning appears (no errors, no broken sync)

### Undo (structural ops)
- [ ] Move/merge/clear a goal → toast appears ("Goal moved" / "Goals merged" /
      "Goal cleared") with an Undo button, auto-hides after ~8s
- [ ] Undo a merge → titles, readmes, todos and links return to their goals;
      anything added to the target AFTER the merge stays where it is
- [ ] Undo a clear → goal title/description and its task/note links return
- [ ] Cmd/Ctrl+Z triggers undo while the toast is visible; does nothing after
      it hides; never fires while typing in an input, note, or editor
- [ ] Undo works signed OUT (anonymous local mode)
- [ ] Two devices: undo on Device A → Device B reverts too (restore_snapshot
      event); an old app version on B still converges via normal sync
- [ ] Undo survives an app restart (journal persists; toast does not)
- [ ] Console shows "Realtime update received"

### Todos Sync
- [ ] Add a todo on Device A
- [ ] Todo appears on Device B
- [ ] Complete todo on Device B
- [ ] Todo status updates on Device A
- [ ] Delete todo on Device A
- [ ] Todo disappears on Device B

### Multiple Rapid Changes
- [ ] Make multiple rapid edits on one device
- [ ] All changes appear on other device
- [ ] No lost updates
- [ ] No sync errors

## 4. UI/UX Tests

### User Menu
- [ ] User menu shows correct email
- [ ] Avatar shows first letter of email
- [ ] Dropdown opens/closes correctly
- [ ] Click outside closes dropdown
- [ ] "Last synced" shows reasonable time
- [ ] Sync status updates in real-time

### Auth Modal
- [ ] Modal opens on "Sign In" click
- [ ] Modal closes on X button
- [ ] Modal closes on backdrop click
- [ ] ESC key closes modal
- [ ] Mode switching works (Sign In ↔ Sign Up ↔ Reset)
- [ ] Form validation shows errors
- [ ] Success messages appear
- [ ] Loading state shows during submission
- [ ] Modal closes after successful sign in

### Error Handling
- [ ] Invalid email shows error
- [ ] Wrong password shows error
- [ ] Weak password shows error
- [ ] Mismatched passwords show error
- [ ] Network errors show in user menu
- [ ] Errors don't crash the app

## 5. Data Integrity Tests

### Grid Data
- [ ] All 81 cells sync correctly
- [ ] Cell text preserved exactly
- [ ] Cell status (todo/underway/done) preserved
- [ ] Cell readme preserved
- [ ] Linked cells sync correctly
- [ ] Block colors correct after sync

### Todo Data
- [ ] Todo text preserved
- [ ] Todo completion status preserved
- [ ] Todo goal associations preserved
- [ ] Todo order preserved
- [ ] Empty todos don't cause errors

### Markdown Export/Import (Existing Feature)
- [ ] Export markdown while signed in
- [ ] Exported data matches Supabase data
- [ ] Import markdown while signed in
- [ ] Imported data syncs to Supabase
- [ ] Supabase data updated correctly

## 6. Security Tests

### Row Level Security
- [ ] User A cannot see User B's data
- [ ] Create two accounts
- [ ] Add data to both
- [ ] Check Supabase dashboard with RLS enabled
- [ ] Each user only sees their own row
- [ ] SQL Editor queries respect RLS

### API Key Security
- [ ] `.env` file not in git (`git status`)
- [ ] `.env` in `.gitignore`
- [ ] Console doesn't show service_role key
- [ ] Only anon key in browser network tab

## 7. Performance Tests

### Load Time
- [ ] App loads quickly when signed out
- [ ] First sign in loads within 2-3 seconds
- [ ] Subsequent sign ins load instantly
- [ ] No unnecessary API calls

### Sync Performance
- [ ] Small changes sync within 1 second
- [ ] Large changes (many cells) sync within 2-3 seconds
- [ ] No UI lag during sync
- [ ] Real-time updates don't cause jank

### Debouncing
- [ ] Rapid edits don't cause excessive API calls
- [ ] Check Network tab → only 1 request per 1-second window
- [ ] No rate limiting errors

## 8. Mobile Tests (Optional, if using Capacitor)

### iOS
- [ ] Build and deploy to iOS
- [ ] Sign in works
- [ ] Data syncs
- [ ] Offline mode works
- [ ] Real-time updates work

### Android
- [ ] Build and deploy to Android
- [ ] Sign in works
- [ ] Data syncs
- [ ] Offline mode works
- [ ] Real-time updates work

## Common Issues

| Issue | Check | Solution |
|-------|-------|----------|
| "Invalid API key" | `.env` file | Verify URL and anon key |
| "Policy violation" | Supabase RLS | Run `database-schema.sql` |
| Real-time not working | Realtime enabled | Enable in Supabase dashboard |
| Email not sent | Email config | Check Supabase email settings |
| Infinite sync loop | `isLoadingFromSupabase` | Check flag in code |
| Changes not syncing | User logged in | Verify auth state |
| Sync very slow | Debouncing | Check 1-second delay is working |

## Success Criteria

✅ All authentication flows work  
✅ Data syncs reliably  
✅ Real-time updates work across devices  
✅ Offline mode doesn't break the app  
✅ No errors in console  
✅ UI shows correct sync status  
✅ Data integrity maintained  
✅ Security working (RLS)  

## Next Steps After Testing

1. **Deploy** - Deploy to production (Vercel, Netlify, etc.)
2. **Monitor** - Check Supabase dashboard for usage
3. **Iterate** - Add features from roadmap
4. **Optimize** - Add caching, compression if needed
