# Setting up Google Drive sync

This is a **one-time setup for whoever deploys/maintains this app** (you) — not something each person using the app has to do. Once you've done this once, anyone who opens the page and clicks **Connect Google Drive** just signs into their *own* Google account; nothing here is per-user.

It exists because the **Connect Google Drive** feature needs a registered Google Cloud OAuth client to identify *this app* to Google — the same way any third-party app that offers "Sign in with Google" has to register itself first.

If you don't plan to use Google Drive sync (e.g. you're happy with Local Folder, or manual Export/Import), you can skip this entirely — every other feature works with zero setup.

## What you're setting up, in one sentence

A Google Cloud **OAuth Client ID** (a public identifier, not a secret) that this app presents to Google when someone clicks "Connect Google Drive," scoped to the narrow [`drive.file`](https://developers.google.com/drive/api/guides/api-specific-auth) permission — access only to files *this app itself* creates, never your whole Drive.

## Steps

### 1. Create or pick a Google Cloud project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Top-left project dropdown → **New Project** (or reuse an existing personal project).
3. Any project name is fine — it's never shown to end users of the app.

### 2. Enable the Google Drive API

1. In the left sidebar: **APIs & Services → Library**.
2. Search for **Google Drive API** → open it → **Enable**.

### 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (this is the only option unless you have a Google Workspace organization).
3. Fill in the required fields — app name (e.g. "Monday"), your email as support contact and developer contact. Nothing else here is user-facing beyond the consent screen itself.
4. **Scopes**: add `.../auth/drive.file`. This is a *sensitive* scope, which matters for the next point.
5. **Publishing status**: leave this app in **Testing**, not **Production**.
   - `drive.file` requires Google's formal app verification (a multi-week review process, privacy policy, demo video, etc.) once an app is in Production and open to the public.
   - In **Testing** status, none of that is required — but only accounts you explicitly add as **test users** can sign in.
6. Under **Test users**, add every Google account that should be able to use Connect Google Drive (your own, family members', etc.) — up to 100.

This means: anyone *not* added as a test user will be blocked at Google's sign-in screen, and everyone who *is* added will see an "unverified app" warning the first time — click **Advanced → Go to (app name) (unsafe)** to continue. This is expected for a small personal project and is not a sign anything is misconfigured.

### 4. Create the OAuth Client ID

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name it anything (e.g. "Monday web").
4. **Authorized JavaScript origins** — add every origin you'll actually load the app from, exactly as it appears in the browser address bar (scheme + host + port, no path):
   - Your GitHub Pages URL, e.g. `https://<your-github-username>.github.io` (check the exact value under the repo's **Settings → Pages** — origins don't include a path, so `https://<username>.github.io` covers `https://<username>.github.io/Monday/` too).
   - `http://localhost:8000` (or whatever port) if you ever test by running a local static server.
5. Click **Create**. Copy the generated **Client ID** (looks like `1234567890-abc...apps.googleusercontent.com`).

**`file://` does not work for Drive sign-in.** Opening `index.html` by double-clicking it gives the page an opaque/`null` origin that can't be registered with Google, so Connect Google Drive will fail under `file://` no matter what you configure. Serve the page over `http(s)://` (GitHub Pages, or a local static server for testing) to use this feature. Everything else in the app — including Local Folder and plain Export/Import — still works fine under `file://`.

### 5. Put the Client ID into the app

Open `app.js` and find the `GOOGLE_CLIENT_ID` constant in the Google Drive section:

```js
var GOOGLE_CLIENT_ID = "your-client-id-here.apps.googleusercontent.com";
```

Replace it with the Client ID you copied, save, and deploy (commit + push if you're hosting on GitHub Pages).

### 6. Test it

1. Open the deployed page (must be `http(s)://`, per above).
2. Click **Connect Google Drive**.
3. Sign in with a Google account you added as a test user in step 3.
4. Click through the "unverified app" warning (**Advanced → Go to (app name) (unsafe)**) — expected, see step 3.
5. Grant access. The status line should show something like *"Connected to Google Drive (in "Monday" folder, autosaving)"*.
6. Check your Drive: a **Monday** folder should now exist, containing `mandarin-word-list.json`.

## Troubleshooting

- **"Error 400: redirect_uri_mismatch" or "origin_mismatch"** — the page's exact origin (scheme + host + port) isn't in Authorized JavaScript origins. Double-check for `http` vs `https`, trailing slashes (don't include one), or a wrong port.
- **"Access blocked: this app's request is invalid" / can't get past sign-in** — the signed-in account isn't in the Testing user list (step 3.6), or the Drive API isn't enabled (step 2).
- **Nothing happens when clicking Connect Google Drive, no error** — you're probably on `file://`; see the callout in step 4.
- **Token expires and prompts to reconnect after ~1 hour** — expected behavior, not an error. This app has no backend server to silently refresh tokens, so periodic re-connect is the accepted trade-off (see the main [README](README.md#google-drive-sync-works-on-any-browser-including-iphonesafari)).

## What this does *not* expose

The `drive.file` scope Google grants is per-file, not account-wide: this app can only see/edit the specific file(s) *it* creates (`mandarin-word-list.json` inside the `Monday` folder). It cannot browse, read, or modify anything else in anyone's Drive — including files that predate the app or live outside that one folder.
