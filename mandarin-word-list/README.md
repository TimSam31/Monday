# Mandarin Word List

A small, dependency-free web tool for building a personal Mandarin vocabulary list: pinyin (with tone marks), hanzi, and meaning, one entry at a time.

## Use it

Open `index.html` in a browser (double-click it, or serve the folder with any static file server). No build step, no install.

## Adding entries

- **Pinyin**: type tone numbers instead of hunting for accent characters — `ni3 hao3` becomes `nǐ hǎo` live as you type. Use `5` (or no number) for the neutral tone, and `v` for `ü` (e.g. `lv4` → `lǜ`).
- **Hanzi**: as soon as a syllable's tone number is typed (e.g. `ni3`), a row of candidate characters for that reading appears below the pinyin field, most common first. Click one to append it to the Hanzi field and move on to the next syllable — or just type/paste hanzi directly if you already know them.
- **Meaning**: the English (or your own language) gloss.

All three fields are required per entry. Entries are saved to the browser's `localStorage`, so they persist across reloads on the same device/browser.

## Export / Import

- **Export JSON** / **Export CSV** download the full list for backup or sharing.
- **Import** accepts a `.json` file (array of `{hanzi, pinyin, meaning}` objects) or a `.csv` file with a header row containing `hanzi`, `pinyin`, `meaning` columns. Imported entries are merged into the existing list; exact duplicates (same hanzi + pinyin + meaning) are skipped.

This makes it easy to pass a list between devices or people: export on one, import on the other.

## Local folder autosave

`localStorage` alone only lives in one browser profile. **Connect Local Folder** goes further: pick any folder on disk and the app keeps a `mandarin-word-list.json` file in it updated automatically on every add, delete, or import — no manual export step.

- **Connect Local Folder**: choose a folder. If it already has a `mandarin-word-list.json` (e.g. synced via Dropbox/a USB drive/a shared drive from another device), its entries are merged into your current list and the merged result is written back.
- Once connected, every change autosaves to that file in the background. The status line next to the button shows the connected folder name.
- **On reopening the app**, it remembers the last folder and offers a one-click **Reconnect** — browsers require a click (not a fully silent auto-load) to re-grant file access after a restart, for security, but you don't need to re-browse for the folder.
- **Disconnect** stops autosaving to the folder; your entries remain in `localStorage`.

This uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which **only Chrome and Edge support** (not Firefox or Safari, as of this writing). In unsupported browsers the button is disabled with an explanatory note, and the app falls back to `localStorage` + manual Export/Import — nothing else is affected.

## Data format

```json
[
  {
    "hanzi": "你好",
    "pinyin": "nǐ hǎo",
    "meaning": "hello",
    "createdAt": "2026-07-27T12:00:00.000Z"
  }
]
```

`createdAt` is optional on import; if omitted, the import time is used.

## Hanzi candidate data

`data/pinyin-hanzi.js` is a lookup table (pinyin syllable &rarr; candidate characters, ranked by frequency) derived from [hanziDB.csv](https://github.com/ruddfawcett/hanziDB.csv) (MIT License, Copyright (c) 2017 Rudd Fawcett), which is itself based on Jun Da's Modern Chinese Character Frequency List. It's loaded as a plain script so the tool keeps working when opened directly from disk (no server, no fetch/CORS issues).

Suggestions are per-syllable (single character), not per multi-character word — for a syllable like `shi4` you'll see all the common characters read that way (是, 事, 市, 式, 士, &hellip;) and pick the one that fits your word.
