import { createCrossword } from './crossword.js';

export default createCrossword({
  id: 'mini',
  name: 'Mini Crossword',
  size: 5,
  style: 'mini',
  blurb: 'A bite-size crossword for your tea break.',
  tagline: 'Five by five, a handful of clues, and a clock ticking. How quick can you be?',
  color: 'var(--mini)',
  tint: 'var(--mini-tint)',
});
