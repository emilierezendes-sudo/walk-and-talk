# Makes the keys notifications need, and writes them to git-ignored files:
#   supabase/notify-secrets.txt  → three values to paste into Supabase → Edge Functions → Secrets
#   supabase/notify-setup.sql    → run once in the SQL Editor (tells the database where to send changes)
# Prints only the PUBLIC key (that one goes in js/config.js). Run once; running again makes new keys.
param([Parameter(Mandatory = $true)][string]$ProjectRef)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

$ec = [System.Security.Cryptography.ECDsa]::Create([System.Security.Cryptography.ECCurve+NamedCurves]::nistP256)
$p = $ec.ExportParameters($true)
$public = B64Url ([byte[]](@(4) + $p.Q.X + $p.Q.Y))
$private = B64Url $p.D
$secretBytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
$webhook = B64Url $secretBytes

$secrets = @"
Paste these into Supabase → Edge Functions → Secrets (Add new secret), one at a time.
Keep this file private — it is not published to GitHub.

Name:  VAPID_PUBLIC_KEY
Value: $public

Name:  VAPID_PRIVATE_KEY
Value: $private

Name:  WEBHOOK_SECRET
Value: $webhook
"@
[IO.File]::WriteAllText((Join-Path $root 'supabase\notify-secrets.txt'), $secrets, (New-Object Text.UTF8Encoding $false))

$sql = @"
-- Walk & Talk — notification setup (private: contains your webhook secret, never published)
-- Run AFTER notifications.sql, in Supabase → SQL Editor.
insert into public.notify_config (id, function_url, secret)
values (1, 'https://$ProjectRef.supabase.co/functions/v1/notify', '$webhook')
on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
"@
[IO.File]::WriteAllText((Join-Path $root 'supabase\notify-setup.sql'), $sql, (New-Object Text.UTF8Encoding $false))
"PUBLIC key (safe to publish): $public"
