# Store-build update test (spec 5.9)

An app update — store build or OTA — never ends a session. This test proves it on a real
update before a store build ships. Run it **before every store release**, on each sign-in path,
on Android with the store signing key.

Spec: [`docs/superpowers/specs/2026-11-17-sovereign-signup-design.md`](superpowers/specs/2026-11-17-sovereign-signup-design.md) §5.9.

## Standing rule

This project does not go to production before the cause of today's logouts (users logged out
after a store update on the first start) is fixed and confirmed on a real update with this test.

## Procedure

1. **Install the previous store version** on a test phone.
   - Android: from the Play internal track, so the signing key is the store's.
   - iOS: the previous TestFlight build.
2. **Create or log in to one account per path**: Google/Apple/email, passkey, 12 words. Use each
   once (one sponsored action or one signed request).
3. **Install the new build over it** (never uninstall). Open the app online: still logged in on
   all three, without a prompt.
4. **Repeat step 3 from a cold start in airplane mode**: still logged in, cached profile shown;
   back online the session works.
5. **Open Settings → Anmelde-Protokoll** (the last row at the bottom of Settings): no
   `fehlgeschlagen` entry. Any entry is copied into the release notes with its reason.
6. **Passkey and 12 words**: one action after the update (the fingerprint or device unlock
   appears once and the action succeeds).
7. **Record** date, versions (from → to), devices and result in the table below.

**A build that fails any step does not ship.**

### Reading the Anmelde-Protokoll

The app keeps the last 10 sign-in restore outcomes on the device
(`wallet.restore.reports.v1` in AsyncStorage, written by `apps/expo/lib/wallet-restore.ts`).
Each entry reads `Datum · Anmeldeweg · Ergebnis`:

| Anmeldeweg | Meaning |
|---|---|
| `Google, Apple oder E-Mail` | the in-app wallet login (also older entries without an owner) |
| `Passkey` | passkey account |
| `12 Wörter` | account signed in with the 12 words |

| Ergebnis | Meaning |
|---|---|
| `wiederhergestellt` | restored on start |
| `später wiederhergestellt` | restored by the background retry after a failed start |
| `fehlgeschlagen` | every attempt failed — **the update test fails** |
| `keine Anmeldung gespeichert` | no session on the device (a genuine logout) |
| `abgebrochen` | the restore was cancelled (e.g. a new sign-in started) |

Below the title: app version, `Store-Version` (embedded bundle) or `Update` (OTA bundle), the
number of attempts, and each error message (cut to 120 characters; addresses, keys and URL
query strings removed). The screen makes no network call and has no share button.

## Results

| Date | From → to | Device(s) | Google/Apple/E-Mail | Passkey | 12 Wörter | Airplane mode | Result |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
