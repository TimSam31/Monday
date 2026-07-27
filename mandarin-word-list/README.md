# Mandarin Word List

A small, dependency-free web tool for building a personal Mandarin vocabulary list: pinyin (with tone marks), hanzi, and meaning, one entry at a time.

## Use it

Open `index.html` in a browser (double-click it, or serve the folder with any static file server). No build step, no install.

## Adding entries

- **Pinyin**: type tone numbers instead of hunting for accent characters — `ni3 hao3` becomes `nǐ hǎo` live as you type. Use `5` (or no number) for the neutral tone, and `v` for `ü` (e.g. `lv4` → `lǜ`).
- **Hanzi**: type or paste the characters directly.
- **Meaning**: the English (or your own language) gloss.

All three fields are required per entry. Entries are saved to the browser's `localStorage`, so they persist across reloads on the same device/browser.

## Export / Import

- **Export JSON** / **Export CSV** download the full list for backup or sharing.
- **Import** accepts a `.json` file (array of `{hanzi, pinyin, meaning}` objects) or a `.csv` file with a header row containing `hanzi`, `pinyin`, `meaning` columns. Imported entries are merged into the existing list; exact duplicates (same hanzi + pinyin + meaning) are skipped.

This makes it easy to pass a list between devices or people: export on one, import on the other.

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
