"""One-off: build elevenses-src/lexicon/lexicon.tsv from SCOWL (npm wordlist-english)
and wordfreq zipf frequencies.  Columns: word, scowl_level, zipf.
Usage: python3 make-lexicon.py <path-to-node_modules/wordlist-english> <out.tsv>
"""
import json, sys, os
from wordfreq import zipf_frequency
base, out = sys.argv[1], sys.argv[2]
LEVELS = [10, 20, 35, 40, 50, 55, 60]
def load(v, n):
    p = os.path.join(base, f'{v}-words-{n}.json')
    return json.load(open(p)) if os.path.exists(p) else []
level = {}
for n in LEVELS:
    for v in ('english', 'british'):
        for w in load(v, n):
            if w.isascii() and w.isalpha() and w.islower() and 3 <= len(w) <= 12:
                level.setdefault(w, n)
with open(out, 'w') as f:
    for w in sorted(level):
        f.write(f'{w}\t{level[w]}\t{zipf_frequency(w, "en"):.2f}\n')
print(len(level), 'words')
