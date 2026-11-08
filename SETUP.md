# Walk & Talk — setting up Supabase (≈10 minutes)

Supabase is the free online database that stores your dates and photos, and sends the sign-in codes.
You only do this once.

## 1. Create the account and project
1. Go to **https://supabase.com** → **Start your project** → sign up (signing in with GitHub is easiest).
2. Click **New project**.
   - **Name:** `walk-and-talk`
   - **Database password:** click *Generate*, then save it in your password manager (you’ll rarely need it).
   - **Region:** pick one in the US (e.g. *East US* or *Central US*).
   - Plan: **Free**.
3. Wait a minute or two while it sets up.

## 2. Create the tables
1. In the left sidebar open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this folder, copy **everything**, paste it in, and click **Run**.
   You should see “Success. No rows returned.”
3. New query again → paste everything from `supabase/allowlist.sql` → **Run**.
   (That file holds your two email addresses — it’s what keeps everyone else out.)

## 3. Check two sign-in settings
You’ll each sign in with your email and a password. No email templates need changing.
1. Left sidebar → **Authentication** → **Sign In / Providers** → **Email**:
   - **Enable Email provider**: on
   - **Confirm email**: **on** (important: this proves each account really belongs to that email address)
   - Click **Save** if you changed anything.
2. **Authentication** → **URL Configuration**:
   - **Site URL:** `http://localhost:5173`
   - **Redirect URLs** → **Add URL** → `http://localhost:5173/**` → Save.

   (This makes the “confirm your email” link open the app. I’ll add the GitHub Pages address here later.)

## 4. Send me the two connection values
Left sidebar → **Project Settings** (gear) → **API** (or **Data API** / **API Keys**). Copy:
- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public key** — a long string starting with `eyJ…` (if you only see a *publishable* key starting with `sb_publishable_…`, that works too)

Paste both into the chat. These two are **safe to share and publish** — they only let someone *ask* to sign in;
the database rules decide who sees anything. **Never** share the `service_role` / *secret* key or the database password.

## Later (I’ll remind you)
- Once you both have signed in once: **Authentication → Sign In / Providers → turn off “Allow new users to sign up.”**
- After the app is on GitHub Pages, add its web address under **Authentication → URL Configuration → Site URL**.

---

### Good to know
- Supabase’s built-in email sender is limited to a few emails per hour (confirmation and password-reset emails). That’s plenty for two people, but if one doesn’t arrive, wait a few minutes and check spam.
- Free projects pause after **7 days with no activity**. Opening the app counts as activity; if it ever pauses, log into supabase.com and click **Restore**.
- Free storage is 1 GB; photos are shrunk before upload (~300–500 KB each), so that’s a couple thousand photos.
