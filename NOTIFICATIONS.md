# Turning on notifications (about 10 minutes, once)

You'll paste two SQL files, create one small function, and add three secrets. Everything you need is in this folder.
Two of the files are **private** (they're never published to GitHub): `supabase/notify-setup.sql` and `supabase/notify-secrets.txt`.

---

## 1. Run the database part
In Supabase → **SQL Editor** → **+ New query**:
1. Paste everything from `supabase/notifications.sql` → **Run**. You should see "Success."
2. **+ New query** again → paste everything from `supabase/notify-setup.sql` (the private one) → **Run**.

## 2. Create the `notify` function
1. Left sidebar → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Delete the sample code in the editor, and paste everything from `supabase/functions/notify/index.ts`.
3. At the bottom, set the **function name** to `notify` (exactly, lowercase).
4. Click **Deploy function** and wait for it to finish.

## 3. Let the database call it
On the `notify` function's page → **Details** (or the settings gear):
- Turn **off** "Verify JWT" / "Enforce JWT verification" → **Save**.

(That's safe: the function checks its own secret instead, and ignores anything without it.)

## 4. Add the three secrets
Left sidebar → **Edge Functions** → **Secrets** (sometimes under *Manage secrets*).
Open `supabase/notify-secrets.txt` and add each one with **Add new secret**:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | from the file |
| `VAPID_PRIVATE_KEY` | from the file |
| `WEBHOOK_SECRET` | from the file |

Copy the values exactly — no spaces before or after. Click **Save**.

## 5. Turn it on, on each phone
Open Walk & Talk **from the home-screen icon** → **Settings** → **Notifications** → **Turn on notifications** → **Allow**.
- iPhone: this only works from the home-screen app (iOS 16.4 or newer), not from Safari.
- Each of you does this on your own phone.

## 6. Test it
Have your boyfriend add a comment on any date. Your phone should get "<his name> commented" within a few seconds.
If nothing arrives, open Supabase → **Edge Functions** → `notify` → **Logs** and send me a screenshot.

---

**What sends a notification:** a comment, a new idea, a new surprise ("is planning a surprise for you" — never the details), a newly logged date, or a friend's suggestion.
You never get notified about your own actions.
