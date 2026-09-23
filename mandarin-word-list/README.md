# Mandarin Word List

A small, dependency-free web tool for building a personal Mandarin dictionary: single words with tagged meanings, and example phrases that automatically cross-reference your word list.

## Use it

Open `index.html` in a browser (double-click it, or serve the folder with any static file server). No build step, no install.

Two modes, switched with the **Vocabulary** / **Quiz** tabs at the top of the page:

**Vocabulary mode** has three parts, top to bottom:

1. **Add an entry** — tabbed between **Words** and **Phrases**.
2. **Search** — finds matches across both your words and phrases.
3. **Your vocabulary** — tabbed, paginated browsing of everything you've saved.

**Quiz mode** is a flashcard-style self-test over what you've saved — see [Quiz mode](#quiz-mode) below.

## Adding words

- **Pinyin**: type tone numbers instead of hunting for accent characters — `ni3 hao3` becomes `nǐ hǎo` live as you type. Use `5` (or no number) for the neutral tone, and `v` for `ü` (e.g. `lv4` → `lǜ`).
- **Hanzi**: as soon as a syllable's tone number is typed (e.g. `ni3`), a row of candidate characters for that reading appears below the pinyin field, most common first. Click one to append it to the Hanzi field and move on to the next syllable — or just type/paste hanzi directly if you already know them.
- **Meaning**: a tag field — type a gloss and press <kbd>Enter</kbd> or <kbd>,</kbd> to add it as a tag, then add more (e.g. `good`, `well`, `fine` as three separate tags on one word). These tags are what phrases and search match against.

Hanzi, pinyin, and at least one meaning tag are all required to save a word.

### Reverse lookup: meaning → hanzi/pinyin

You can also go the other way: start typing an English meaning (2+ characters) and a row of matching hanzi candidates appears below the Meaning field, each showing its hanzi, pinyin, and definition. This checks two sources — the same single-character reference data used for the Pinyin candidates (available instantly), plus [CC-CEDICT](#dictionary-reference-cc-cedict) for multi-character words (lazy-loaded the first time you use either this or the Search dictionary panel). Click a suggestion to fill in Hanzi and Pinyin and add tags derived from its definition — you can still edit or remove any of them before saving, same as picking a pinyin candidate.

## Adding phrases

Phrases are example sentences. One input auto-detects what you're giving it:

- **Type pinyin** (tone numbers) and it behaves exactly like the word form: candidates appear per syllable, click one to build up the sentence's Hanzi character by character, and the Pinyin field fills in alongside it.
- **Paste Hanzi directly** and it's taken as-is — no candidate picking needed.

A phrase's **Meaning** is a single plain-text field (e.g. "how are you"), not tags — it's for display only and is never matched by search. **Tags aren't entered manually**: they're derived automatically from every saved word whose hanzi appears inside the phrase (plain substring match), recomputed live every time you view the phrase — so editing or deleting a word instantly updates every phrase's tags with nothing to re-save.

If you paste Hanzi with no pinyin of your own, the Pinyin field is best-effort auto-filled on save: it reuses the exact pinyin of any matched word first, and falls back to the most common reading (from the bundled reference data) for anything else. It's shown as regular editable text, so fix it if it guessed wrong.

Only Hanzi is required to save a phrase.

### Live reference while building a phrase

As soon as there's any hanzi in the phrase (typed via candidates or pasted), two read-only rows appear below the input, showing what's recognized *within* the phrase so far as substrings — richer than the Tags preview below, which only lists meaning tags:

- **From your vocabulary** — your own saved words found inside the phrase, each shown as a small hanzi/pinyin/meaning chip.
- **Dictionary reference (CC-CEDICT)** — the same, but against the bundled [CC-CEDICT](#dictionary-reference-cc-cedict) dictionary (lazy-loaded on first use, same as the Search panel), so you can spot valid dictionary words in the phrase even before you've saved them yourself.

Both rows are capped at 5 chips (longest match first), with a **Show N more** chip that expands the rest — a long sentence can easily contain more than 5 recognized chunks, so this can wrap into several rows.

**Clear** (next to **Add Phrase**) resets just the hanzi side of the form — the phrase input, the pinyin field, any in-progress candidates, and these two reference rows — without touching whatever you've already typed in Meaning.

## Search

One search box, matching only your own saved **Words** — by hanzi, pinyin, or any meaning tag (never the bundled candidate reference set used for the candidate picker). Phrases never appear as their own search result; they only ever show up nested under whichever word matched.

Each match renders as a word card: hanzi and pinyin large on the left, tags top-right (with an Edit link). Below that, its top 2 related example phrases — ranked by how much the rest of each phrase's vocabulary echoes the word's own tags, tie-broken by most recent — each shown as hanzi, then pinyin, then its meaning in italic. Word results are capped inline; a "Show N more results" button expands the full list with the same pagination controls used for browsing.

### Viewing all phrases for a word

If a word has more than 2 related phrases, a small **View all N phrases** button opens a detail list of every phrase containing that exact word (same hanzi *and* pinyin — a different word that happens to sound the same, like a homophone, is excluded), with its own pagination and the same inline Edit for each phrase's meaning. This is a different scope than the "Show N more results" button: that one broadens across *different* words your query happens to also match (e.g. several homophones with different hanzi); this one narrows to *only* the one word you asked about. A **← Back to search results** link returns to the normal results list.

## Dictionary reference (CC-CEDICT)

Below your own search results, a second panel looks up your query against the open [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) Chinese-English dictionary (~107,000 entries) &mdash; by hanzi (simplified or traditional) or by pinyin. It's a **read-only reference**, entirely separate from your saved Words/Phrases: results never get added to your list, aren't saved anywhere, and don't affect search, export, storage, or anything else in the app.

The dictionary data (~8.5MB) is **lazy-loaded**: it's only fetched the first time you actually type a search query, not on page load, so it costs nothing for anyone who never uses this panel. The first lookup shows a brief "Loading dictionary reference…" message; after that it's cached for the rest of the session. Results are capped inline with a "Show N more dictionary results" expansion, using the same pagination style as the rest of the app.

Data source: CC-CEDICT, Copyright (C) 2005-2026 [MDBG](https://www.mdbg.net/), licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), referencing CEDICT (Copyright 1997, 1998 Paul Andrew Denisowski). Bundled as `data/cedict.js`, mirrored from [regisb/CC-CEDICT](https://github.com/regisb/CC-CEDICT).

## Editing an entry

An **Edit** link sits next to a word's tags or a phrase's meaning, both in the vocabulary table and on search result cards — clicking it turns that spot into the same removable-tag-chip editor used when adding a word (for a word) or a plain text box (for a phrase's meaning), with **Save**/**Cancel**. A word needs at least one tag to save. Hanzi and pinyin aren't editable this way (re-typing those is closer to just adding a new entry and deleting the old one); a phrase's tags never are, since they're always derived from the current word list. Only one entry is ever mid-edit at a time — opening the editor for the same word from the table and from a search card shows the identical in-progress edit in both places, since it's the same state either way.

## Browsing your vocabulary

Words and Phrases each get their own tab, a quick text filter, and pagination (20/50/100/200 per page). The Phrases table's derived Tags column is hidden by default (it can get noisy on longer phrases) — a small **Show Tags** button above the table reveals it.

## Export / Import

- **Export JSON** / **Import JSON** (top toolbar) covers both words and phrases together, as `{"words": [...], "phrases": [...]}`. A plain array (the old format, words-only) still imports fine and is read as legacy words-only data.
- **Export CSV** / **Import CSV** are scoped to whichever browse tab is active — Words CSV has `hanzi, pinyin, meaning, createdAt` columns (meaning tags separated by `; `); Phrases CSV has `hanzi, pinyin, meaning, tags, createdAt` (the `tags` column is derived and exported for reference, but ignored on import since tags are never stored). Imported rows are merged into the existing list; duplicates are skipped.

This makes it easy to pass a list between devices or people: export on one, import on the other.

## Internal browser storage (automatic, no setup)

Beyond `localStorage`, the app also autosaves to a real file the browser manages for you — no folder to pick, no permission prompt. This is the [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API/Origin_private_file_system), sandboxed per-origin and not visible in a normal file browser (Finder/Explorer), which is exactly what lets it skip the picker/permission step. It's a second, independent copy of your data (words and phrases both) — if `localStorage` is ever cleared (private browsing cleanup, "clear site data", etc.), the app recovers your list from here automatically on next load.

It's supported in Chrome and Edge, but **only when the page is served over http/https** — not when opened directly as a `file://` URL (a browser security restriction on that API, unrelated to this app). When active, a small "+ browser-internal backup (automatic)" note appears next to the folder controls. When it's not available (including the common case of just double-clicking `index.html`), the app falls back silently to `localStorage` only — nothing breaks, there's no error, this note just doesn't appear.

## Local folder autosave (optional, user-visible folder)

`localStorage` alone only lives in one browser profile. **Connect Local Folder** goes further: pick any folder on disk and the app keeps a `mandarin-word-list.json` file in it (both words and phrases) updated automatically on every change — no manual export step.

- **Connect Local Folder**: choose a folder. If it already has a `mandarin-word-list.json`, its words and phrases are merged into your current list and the merged result is written back.
- Once connected, every change autosaves to that file in the background. The status line next to the button shows the connected folder name.
- **On reopening the app**, it remembers the last folder and offers a one-click **Reconnect** — browsers require a click (not a fully silent auto-load) to re-grant file access after a restart, for security, but you don't need to re-browse for the folder.
- **Disconnect** stops autosaving to the folder; your entries remain in `localStorage`.

This uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which **only Chrome and Edge support** (not Firefox or Safari, as of this writing). In unsupported browsers the button is disabled with an explanatory note, and the app falls back to `localStorage` + manual Export/Import — nothing else is affected.

## Google Drive sync (works on any browser, including iPhone/Safari)

**Connect Google Drive** is the option for cross-device sync when Local Folder isn't available to you — most notably on iPhone, since Safari doesn't support the File System Access API at all. It talks directly to Google's servers over plain HTTPS via the [Drive REST API](https://developers.google.com/drive/api/guides/about-sdk) using [Google Identity Services](https://developers.google.com/identity/gsi/web) for sign-in — no backend server of ours involved, so it works the same way in any browser.

- **Connect Google Drive**: signs you into your Google account and grants access to just the files/folders this app itself manages, via the narrow `drive.file` scope (not your whole Drive). It finds-or-creates a folder named **Monday** in your Drive, then finds-or-creates `mandarin-word-list.json` inside that folder; if the file already existed, its contents are merged into your current list.
- Because that folder-then-file lookup is scoped to your Google account and this app (not to any particular device), **a brand-new device can find and merge the same data the very first time it connects** — unlike Local Folder, there's no "first device has to already hold the file" requirement.
- Every change autosaves to that file in the background while connected.
- **The access token is short-lived (about an hour)** and there's no backend to silently refresh it, so it will periodically stop autosaving with a "session expired" message — click **Connect Google Drive** again (a quick Google consent screen) to resume. This is expected, not a bug: it's the trade-off for a pure client-side integration with no server holding a secret.
- **Disconnect** revokes the token and stops autosaving there; your entries remain in `localStorage`.

Setup note: this requires a one-time Google Cloud project/OAuth Client ID setup by whoever deploys this app — see **[GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)** for the full walkthrough. Loading `https://accounts.google.com/gsi/client` requires an internet connection; if it fails to load (offline, blocked, etc.) the button shows a message instead of erroring, and every other feature is unaffected.

## Quiz mode

A flashcard-style self-test over your own saved words and/or phrases — nothing here is stored, it just reads your existing list.

- **From**: quiz from **Words**, **Phrases**, or **Both**.
- **Show**: whether each card leads with **Hanzi** (guess the pinyin/meaning), **Meaning** (guess the hanzi), or **Randomize** (picks one or the other per card).
- The hidden side (pinyin is always part of it, plus whichever of hanzi/meaning isn't the prompt) stays hidden until you click **Show answer**.
- **Next word** draws another card. Switching *Show* alone re-quizzes the same card from the other angle instead of advancing.
- Draws never repeat until every card in the current pool (per the *From* setting) has been shown once — a shuffled "deck" that's dealt through before it reshuffles for the next round, so you won't see the same word twice in a row while others are left untouched.

## Data format

```json
{
  "words": [
    {
      "hanzi": "你",
      "pinyin": "nǐ",
      "meaning": ["you", "hi"],
      "createdAt": "2026-08-09T12:00:00.000Z"
    }
  ],
  "phrases": [
    {
      "hanzi": "你好",
      "pinyin": "nǐ hǎo",
      "meaning": "hello",
      "createdAt": "2026-08-09T12:05:00.000Z"
    }
  ]
}
```

`createdAt` is optional on import; if omitted, the import time is used. A phrase has no `tags` field in storage — tags are always computed from the current word list, never saved.

## Hanzi candidate data

`data/pinyin-hanzi.js` is a lookup table (pinyin syllable &rarr; candidate characters, ranked by frequency) derived from [hanziDB.csv](https://github.com/ruddfawcett/hanziDB.csv) (MIT License, Copyright (c) 2017 Rudd Fawcett), which is itself based on Jun Da's Modern Chinese Character Frequency List. It's loaded as a plain script so the tool keeps working when opened directly from disk (no server, no fetch/CORS issues), and also powers the best-effort pinyin auto-fill for pasted phrases.

Suggestions are per-syllable (single character), not per multi-character word — for a syllable like `shi4` you'll see all the common characters read that way (是, 事, 市, 式, 士, &hellip;) and pick the one that fits your word.
