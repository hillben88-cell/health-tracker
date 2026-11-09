import { createCrossword } from './crossword.js';

export default createCrossword({
  id: 'midi',
  name: 'Midi Crossword',
  size: 9,
  style: 'british',
  blurb: 'A meatier, British-style quick crossword.',
  tagline: 'A nine-by-nine quick crossword in the classic British style. Pencils at the ready.',
  color: 'var(--midi)',
  tint: 'var(--midi-tint)',
});
