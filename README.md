# Walk & Talk 🚶‍♀️💬🚶‍♂️

A private, installable web app for keeping track of our date ideas, plans and memories.

- **Ideas** with tags, 😍 for the ones we *really* want to do, and a Not yet → Planned → Done status
- **Date log** with photos, a recap, comments and emoji reactions; the total counts every date
- **🎲 Pick for us** with tag / 😍 filters
- Light & dark mode, works on iPhone and Android (Add to Home Screen)

## Running it on this PC
```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```
Then open http://localhost:5173. While `js/config.js` is empty the app runs in **demo mode** (data stays in that browser).

## Folders
| Path | What |
|---|---|
| `index.html`, `css/`, `js/` | the app (plain HTML/CSS/JS, no build step) |
| `supabase/schema.sql` | database tables + security rules |
| `supabase/allowlist.sql` | the two allowed emails — **git-ignored** |
| `seed/` | data + photos converted from the spreadsheet — **git-ignored** |
| `tools/build-seed.ps1` | re-creates `seed/` from the spreadsheet |
| `tools/make-icons.ps1` | redraws the app icons |

Setup steps for the online database are in [SETUP.md](SETUP.md).
