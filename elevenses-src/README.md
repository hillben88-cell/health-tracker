# Elevenses — daily British puzzles

Elevenses is a small daily-puzzle web app built for iPhone (it installs to the Home
Screen and runs full-screen and offline). It has six games:

| Game | What it is |
| --- | --- |
| **Mini Crossword** | 5×5 quick crossword, fully checked, with a timer. |
| **Midi Crossword** | 9×9 British-style quick crossword (unchecked squares, answer lengths in brackets). |
| **Inkling** | Guess the five-letter word in six goes (British word list, optional hard mode). |
| **Spokes** | A nine-letter word wheel: make words that use the hub letter, using each tile once. Ranks run from *Stabilisers* to *Yellow Jersey* and *Hors Catégorie*. Find the Nine for 10 points. |
| **Quartets** | Sixteen words, four hidden groups of four, four lives. Categories are British-flavoured. |
| **Ramble** | A themed word trail: every letter of the 6×7 grid belongs to one theme word. Find bonus words to earn hints. |

Every game has a new puzzle each day at local midnight. Puzzle No. 1 was on
1 September 2026, and puzzles are pre-generated to 31 December 2030. The
**Archive** tab has a calendar for each game, so you can play any past day. Stats and
streaks are tracked per game. A streak only counts puzzles finished on their own day;
for crosswords, the solve must also be without reveals.

The app itself lives in [`public/elevenses/`](../public/elevenses). This folder
(`elevenses-src/`) holds the puzzle content and the scripts that turn it into daily
puzzle data.

## Putting it on your iPhone

The app is plain static files, so any static host works. It sits in Vite's `public/`
folder, so the existing Vercel deployment of this repo serves it at:

```
https://<your-vercel-domain>/elevenses/
```

On the iPhone:

1. Open that address in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch Elevenses from the new icon.

It caches itself for offline play (iOS 15.4 or later; iOS 16.2+ recommended). Progress is stored on the device; use
**Settings → Back up your progress → Export** now and then.

> Local preview: `cd public/elevenses && python3 -m http.server 8000`, then open
> <http://localhost:8000>. (With `npm run dev`, use `/elevenses/index.html`
> explicitly, because Vite's dev server hands bare folders to the main app.)

## How the puzzles are made

All puzzle data is generated ahead of time by `scripts/build.mjs` into
`public/elevenses/data/<game>/<year>.json`. Each daily puzzle is deterministic.

| Source file (`content/`) | Used for |
| --- | --- |
| `clues-*.txt` | ~3,400 original clues, British spelling and references. `answer = clue \| alternative clue` |
| `quartets.txt` | ~340 categories with difficulty levels and tags. `level \| tags \| Title \| MEMBERS, …` |
| `ramble.txt` | ~150 themes. `Theme \| Hint \| WORDS, …` |
| `inkling-answers.txt` | ~1,740 answer words (one per line) |
| `blocklist.txt` | Words never used as generated answers |

The generators:

- **Crosswords** — a constraint-solving grid filler (bitset word index plus
  most-constrained-slot backtracking). It only places words that have a clue, and it
  avoids words used in recent days. The Midi uses random 180°-symmetric British
  lattice grids with these checks: no 2-letter entries, at most two unchecked letters
  in a row, a connected grid, and at most four 9-letter entries.
- **Spokes** — picks a common nine-letter word and a hub letter that gives 18–70
  valid words. Plurals in -S and blocked words are excluded.
- **Quartets** — picks one category per difficulty band. Categories sharing a tag never
  appear together, and any word that belongs to two chosen categories is kept off the
  board, so each puzzle has one solution. Recently used categories are rested.
- **Ramble** — chooses theme words totalling 42 letters, then tiles the grid with
  non-crossing paths. A partition check keeps the remaining space fillable.
- **Inkling** — a seeded shuffle of the answer list.

### Rebuilding or adding puzzles

```bash
pip install wordfreq            # only needed to regenerate the lexicon
node elevenses-src/scripts/build.mjs            # everything (~10 minutes, crosswords are the slow bit)
node elevenses-src/scripts/build.mjs quartets   # just one game: inkling|spokes|quartets|ramble|crossword|dict
node elevenses-src/scripts/build.mjs clues      # re-export edited clue text without changing any grids
```

To extend past 2030, change `END` in `scripts/lib/util.mjs` and `LAST` in
`public/elevenses/js/core.js`, then rebuild. Adding categories, themes or clues and
rebuilding gives more variety. After changing app code, bump `VERSION` in
`public/elevenses/sw.js` so installed copies update.

Note: rebuilding regenerates *every* day, including past ones. Do it before you've
played much, or accept that archive puzzles will change.

## Credits

Word lists derive from [SCOWL](http://wordlist.aspell.net/) (© Kevin Atkinson,
permissive licence; see `lexicon/SCOWL-COPYRIGHT.txt`), with word frequencies from
[wordfreq](https://github.com/rspeer/wordfreq). All clues, categories and themes are
original to this project.
