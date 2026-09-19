import React from 'react';

const CHORD_LIBRARY = {
  // ─── Major Triads ───
  'C':    { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  'D':    { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  'E':    { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  'F':    { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1 },
  'G':    { frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] },
  'A':    { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  'B':    { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barre: 2 },
  'C#':   { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: 4 },
  'D#':   { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], barre: 6 },
  'F#':   { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: 2 },
  'G#':   { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: 4 },
  'A#':   { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: 1 },

  // ─── Minor Triads ───
  'Cm':   { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], barre: 3 },
  'Dm':   { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  'Em':   { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  'Fm':   { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barre: 1 },
  'Gm':   { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barre: 3 },
  'Am':   { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  'Bm':   { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: 2 },
  'C#m':  { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barre: 4 },
  'D#m':  { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], barre: 6 },
  'F#m':  { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: 2 },
  'G#m':  { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: 4 },
  'A#m':  { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: 1 },

  // ─── Dominant 7th ───
  'C7':   { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  'D7':   { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  'E7':   { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  'F7':   { frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], barre: 1 },
  'G7':   { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  'A7':   { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  'B7':   { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  'C#7':  { frets: [-1, 4, 3, 4, 2, -1], fingers: [0, 3, 2, 4, 1, 0] },
  'D#7':  { frets: [-1, 6, 5, 6, 4, -1], fingers: [0, 3, 2, 4, 1, 0] },
  'F#7':  { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], barre: 2 },
  'G#7':  { frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], barre: 4 },
  'A#7':  { frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], barre: 1 },

  // ─── Minor 7th ───
  'Cm7':  { frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1], barre: 3 },
  'Dm7':  { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  'Em7':  { frets: [0, 2, 2, 0, 3, 0], fingers: [0, 2, 3, 0, 4, 0] },
  'Fm7':  { frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1], barre: 1 },
  'Gm7':  { frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], barre: 3 },
  'Am7':  { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  'Bm7':  { frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 1, 0, 2, 0, 3] },
  'C#m7': { frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1], barre: 4 },
  'D#m7': { frets: [-1, 6, 8, 6, 7, 6], fingers: [0, 1, 3, 1, 2, 1], barre: 6 },
  'F#m7': { frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barre: 2 },
  'G#m7': { frets: [4, 6, 4, 4, 4, 4], fingers: [1, 3, 1, 1, 1, 1], barre: 4 },
  'A#m7': { frets: [-1, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1], barre: 1 },

  // ─── Major 7th ───
  'Cmaj7': { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  'Dmaj7': { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3] },
  'Emaj7': { frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] },
  'Fmaj7': { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  'Gmaj7': { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  'Amaj7': { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
  'Bmaj7': { frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1], barre: 2 },
  'C#maj7': { frets: [-1, 4, 6, 5, 6, 4], fingers: [0, 1, 3, 2, 4, 1], barre: 4 },
  'D#maj7': { frets: [-1, 6, 8, 7, 8, 6], fingers: [0, 1, 3, 2, 4, 1], barre: 6 },
  'F#maj7': { frets: [2, 4, 3, 3, 2, 2], fingers: [1, 4, 2, 3, 1, 1], barre: 2 },
  'G#maj7': { frets: [4, 6, 5, 5, 4, 4], fingers: [1, 4, 2, 3, 1, 1], barre: 4 },
  'A#maj7': { frets: [-1, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1], barre: 1 },

  // ─── Diminished ───
  'Cdim':  { frets: [-1, 3, 4, 2, 4, 2], fingers: [0, 2, 3, 1, 4, 1] },
  'Ddim':  { frets: [-1, -1, 0, 1, 3, 1], fingers: [0, 0, 0, 1, 3, 2] },
  'Edim':  { frets: [0, 1, 2, 0, -1, -1], fingers: [0, 1, 2, 0, 0, 0] },
  'Fdim':  { frets: [-1, -1, 3, 1, 0, 1], fingers: [0, 0, 3, 1, 0, 2] },
  'Gdim':  { frets: [3, 4, 5, 3, -1, -1], fingers: [1, 2, 3, 1, 0, 0], barre: 3 },
  'Adim':  { frets: [-1, 0, 1, 2, 1, -1], fingers: [0, 0, 1, 3, 2, 0] },
  'Bdim':  { frets: [-1, 2, 3, 4, 3, -1], fingers: [0, 1, 2, 4, 3, 0] },
  'C#dim': { frets: [-1, 4, 5, 3, 5, 3], fingers: [0, 2, 3, 1, 4, 1] },
  'D#dim': { frets: [-1, 6, 7, 5, 7, 5], fingers: [0, 2, 3, 1, 4, 1] },
  'F#dim': { frets: [-1, -1, 4, 2, 1, 2], fingers: [0, 0, 4, 2, 1, 3] },
  'G#dim': { frets: [-1, -1, 6, 4, 3, 4], fingers: [0, 0, 4, 2, 1, 3] },
  'A#dim': { frets: [-1, 1, 2, 3, 2, -1], fingers: [0, 1, 2, 4, 3, 0] },

  // ─── Augmented ───
  'Caug':  { frets: [-1, 3, 2, 1, 1, 0], fingers: [0, 4, 3, 1, 2, 0] },
  'Daug':  { frets: [-1, -1, 0, 3, 3, 2], fingers: [0, 0, 0, 2, 3, 1] },
  'Eaug':  { frets: [0, 3, 2, 1, 1, 0], fingers: [0, 4, 3, 1, 2, 0] },
  'Faug':  { frets: [-1, -1, 3, 2, 2, 1], fingers: [0, 0, 4, 2, 3, 1] },
  'Gaug':  { frets: [3, 2, 1, 0, 0, 3], fingers: [3, 2, 1, 0, 0, 4] },
  'Aaug':  { frets: [-1, 0, 3, 2, 2, 1], fingers: [0, 0, 4, 2, 3, 1] },
  'Baug':  { frets: [-1, 2, 1, 0, 0, 3], fingers: [0, 2, 1, 0, 0, 4] },

  // ─── Suspended 2nd ───
  'Csus2': { frets: [-1, 3, 0, 0, 1, 3], fingers: [0, 2, 0, 0, 1, 3] },
  'Dsus2': { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] },
  'Esus2': { frets: [0, 2, 4, 4, 0, 0], fingers: [0, 1, 3, 4, 0, 0] },
  'Fsus2': { frets: [-1, -1, 3, 0, 1, 1], fingers: [0, 0, 3, 0, 1, 1] },
  'Gsus2': { frets: [3, 0, 0, 0, 3, 3], fingers: [1, 0, 0, 0, 3, 4] },
  'Asus2': { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] },
  'Bsus2': { frets: [-1, 2, 4, 4, 2, 2], fingers: [0, 1, 3, 4, 1, 1], barre: 2 },

  // ─── Suspended 4th ───
  'Csus4': { frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1] },
  'Dsus4': { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
  'Esus4': { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0] },
  'Fsus4': { frets: [1, 1, 3, 3, 1, 1], fingers: [1, 1, 3, 4, 1, 1], barre: 1 },
  'Gsus4': { frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4] },
  'Asus4': { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
  'Bsus4': { frets: [-1, 2, 4, 4, 5, 2], fingers: [0, 1, 2, 3, 4, 1], barre: 2 },

  // ─── Power Chords ───
  'C5':   { frets: [-1, 3, 5, 5, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
  'D5':   { frets: [-1, 5, 7, 7, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
  'E5':   { frets: [0, 2, 2, -1, -1, -1], fingers: [0, 1, 2, 0, 0, 0] },
  'F5':   { frets: [1, 3, 3, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
  'G5':   { frets: [3, 5, 5, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
  'A5':   { frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 0, 1, 2, 0, 0] },
  'B5':   { frets: [-1, 2, 4, 4, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },

  // ─── Diminished 7th ───
  'Cdim7': { frets: [-1, 3, 4, 2, 4, 2], fingers: [0, 2, 3, 1, 4, 1] },
  'Ddim7': { frets: [-1, -1, 0, 1, 0, 1], fingers: [0, 0, 0, 1, 0, 2] },
  'Edim7': { frets: [0, 1, 2, 0, 2, 0], fingers: [0, 1, 2, 0, 3, 0] },
  'Fdim7': { frets: [1, 2, 3, 1, 3, 1], fingers: [1, 2, 3, 1, 4, 1], barre: 1 },
  'Gdim7': { frets: [3, 4, 5, 3, 5, 3], fingers: [1, 2, 3, 1, 4, 1], barre: 3 },
  'Adim7': { frets: [-1, 0, 1, 2, 1, 2], fingers: [0, 0, 1, 3, 2, 4] },
  'Bdim7': { frets: [-1, 2, 3, 1, 3, 1], fingers: [0, 2, 3, 1, 4, 1] },

  // ─── Half-diminished (m7b5) ───
  'Cm7b5': { frets: [-1, 3, 4, 3, 4, -1], fingers: [0, 1, 2, 1, 3, 0], barre: 3 },
  'Dm7b5': { frets: [-1, -1, 0, 1, 1, 1], fingers: [0, 0, 0, 1, 2, 3] },
  'Em7b5': { frets: [0, 1, 2, 0, 3, 0], fingers: [0, 1, 2, 0, 3, 0] },
  'Fm7b5': { frets: [1, 2, 3, 1, 4, 1], fingers: [1, 2, 3, 1, 4, 1], barre: 1 },
  'Gm7b5': { frets: [3, 4, 5, 3, 6, 3], fingers: [1, 2, 3, 1, 4, 1], barre: 3 },
  'Am7b5': { frets: [-1, 0, 1, 0, 1, 3], fingers: [0, 0, 1, 0, 2, 4] },
  'Bm7b5': { frets: [-1, 2, 3, 2, 3, -1], fingers: [0, 1, 3, 2, 4, 0] },

  // ─── Major 6th ───
  'C6':   { frets: [-1, 3, 2, 2, 1, 0], fingers: [0, 4, 2, 3, 1, 0] },
  'D6':   { frets: [-1, -1, 0, 2, 0, 2], fingers: [0, 0, 0, 1, 0, 2] },
  'E6':   { frets: [0, 2, 2, 1, 2, 0], fingers: [0, 2, 3, 1, 4, 0] },
  'F6':   { frets: [1, 3, 3, 2, 3, 1], fingers: [1, 3, 3, 2, 4, 1], barre: 1 },
  'G6':   { frets: [3, 2, 0, 0, 0, 0], fingers: [3, 2, 0, 0, 0, 0] },
  'A6':   { frets: [-1, 0, 2, 2, 2, 2], fingers: [0, 0, 1, 1, 1, 1] },
  'B6':   { frets: [-1, 2, 4, 4, 4, 4], fingers: [0, 1, 2, 3, 3, 3], barre: 4 },

  // ─── Minor 6th ───
  'Cm6':  { frets: [-1, 3, 1, 2, 1, 3], fingers: [0, 3, 1, 2, 1, 4], barre: 1 },
  'Dm6':  { frets: [-1, -1, 0, 2, 0, 1], fingers: [0, 0, 0, 2, 0, 1] },
  'Em6':  { frets: [0, 2, 2, 0, 2, 0], fingers: [0, 1, 2, 0, 3, 0] },
  'Am6':  { frets: [-1, 0, 2, 2, 1, 2], fingers: [0, 0, 2, 3, 1, 4] },

  // ─── Add 9 ───
  'Cadd9': { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 3, 2, 0, 4, 0] },
  'Dadd9': { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0] },
  'Eadd9': { frets: [0, 2, 2, 1, 0, 2], fingers: [0, 2, 3, 1, 0, 4] },
  'Fadd9': { frets: [-1, -1, 3, 2, 1, 3], fingers: [0, 0, 3, 2, 1, 4] },
  'Gadd9': { frets: [3, 0, 0, 2, 0, 3], fingers: [2, 0, 0, 1, 0, 3] },
  'Aadd9': { frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 2, 0] },

  // ─── 9th Chords ───
  'C9':   { frets: [-1, 3, 2, 3, 3, 3], fingers: [0, 2, 1, 3, 3, 3], barre: 3 },
  'D9':   { frets: [-1, -1, 0, 2, 1, 0], fingers: [0, 0, 0, 2, 1, 0] },
  'E9':   { frets: [0, 2, 0, 1, 0, 2], fingers: [0, 2, 0, 1, 0, 3] },
  'G9':   { frets: [3, 2, 0, 2, 0, 1], fingers: [4, 2, 0, 3, 0, 1] },
  'A9':   { frets: [-1, 0, 2, 4, 2, 3], fingers: [0, 0, 1, 3, 1, 2] },

  // ─── Minor 9th ───
  'Cm9':  { frets: [-1, 3, 1, 3, 3, 3], fingers: [0, 2, 1, 3, 3, 3], barre: 3 },
  'Dm9':  { frets: [-1, -1, 0, 2, 1, 0], fingers: [0, 0, 0, 2, 1, 0] },
  'Em9':  { frets: [0, 2, 0, 0, 0, 2], fingers: [0, 1, 0, 0, 0, 2] },
  'Am9':  { frets: [-1, 0, 2, 4, 1, 3], fingers: [0, 0, 1, 4, 2, 3] },

  // ─── 7sus4 ───
  'C7sus4': { frets: [-1, 3, 3, 3, 1, 1], fingers: [0, 2, 3, 4, 1, 1], barre: 1 },
  'D7sus4': { frets: [-1, -1, 0, 2, 1, 3], fingers: [0, 0, 0, 2, 1, 3] },
  'E7sus4': { frets: [0, 2, 0, 2, 0, 0], fingers: [0, 1, 0, 2, 0, 0] },
  'G7sus4': { frets: [3, 3, 0, 0, 1, 1], fingers: [3, 4, 0, 0, 1, 1] },
  'A7sus4': { frets: [-1, 0, 2, 0, 3, 0], fingers: [0, 0, 1, 0, 3, 0] },
};

// Enharmonic mapping for flat->sharp lookup
const ENHARMONIC = (() => {
  const flatSharp = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  const suffixes = ['', 'm', '7', 'm7', 'maj7', 'dim', 'aug', 'sus2', 'sus4', '5',
    'dim7', 'm7b5', 'add9', '6', 'm6', '9', 'm9', '7sus4'];
  const map = {};
  for (const [flat, sharp] of Object.entries(flatSharp)) {
    for (const suf of suffixes) {
      map[flat + suf] = sharp + suf;
    }
  }
  return map;
})();

export default React.memo(function ChordChart({ chordName, width = 130, height = 160 }) {
  // Try enharmonic mapping if not found
  let lookupName = chordName;
  if (!CHORD_LIBRARY[lookupName] && ENHARMONIC[lookupName]) {
    lookupName = ENHARMONIC[lookupName];
  }

  const data = CHORD_LIBRARY[lookupName];

  if (!data) {
    // Fallback: styled badge for unknown chords
    return (
      <div style={{
        width, height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-elevated, #f4f4f5)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid var(--border, #e4e4e7)',
      }}>
        <span style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--foreground, #09090b)',
          letterSpacing: '-0.02em',
          fontFamily: 'var(--font-sans)',
        }}>
          {chordName}
        </span>
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--foreground-dim, #71717a)',
          marginTop: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          No diagram
        </span>
      </div>
    );
  }

  const { frets, fingers, barre } = data;

  const stringCount = 6;
  const fretCount = 4;
  const paddingX = 22;
  const paddingY = 38;
  const bottomPad = 12;

  const stringSpacing = (width - paddingX * 2) / (stringCount - 1);
  const fretSpacing = (height - paddingY - bottomPad) / fretCount;

  // Find starting fret position
  const activeFrets = frets.filter(f => f > 0);
  let startFret = 1;
  if (activeFrets.length > 0) {
    const maxFret = Math.max(...activeFrets);
    if (maxFret > 4) {
      startFret = Math.min(...activeFrets);
    }
  }

  // String thickness (bass strings thicker)
  const getStringWidth = (i) => {
    const widths = [1.6, 1.4, 1.2, 1, 0.8, 0.7];
    return widths[i] || 1;
  };

  return (
    <div className="chord-chart-container" style={{ textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
      <h4 style={{
        margin: '0 0 2px 0',
        fontSize: '1.15rem',
        fontWeight: 700,
        color: 'var(--foreground, #09090b)',
        letterSpacing: '-0.02em'
      }}>
        {chordName}
      </h4>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>

        {/* Nut / Top bar */}
        <line
          x1={paddingX} y1={paddingY}
          x2={width - paddingX} y2={paddingY}
          stroke="var(--foreground, #09090b)"
          strokeWidth={startFret === 1 ? 3.5 : 1.5}
          strokeLinecap="round"
        />

        {/* Fret position indicator */}
        {startFret > 1 && (
          <text
            x={paddingX - 12}
            y={paddingY + fretSpacing / 2 + 4}
            fontSize="10"
            fontWeight="600"
            fill="var(--foreground-dim, #71717a)"
            textAnchor="end"
            fontFamily="var(--font-mono, monospace)"
          >
            {startFret}fr
          </text>
        )}

        {/* Fret lines */}
        {Array.from({ length: fretCount + 1 }).map((_, i) =>
          i > 0 && (
            <line
              key={`fret-${i}`}
              x1={paddingX} y1={paddingY + i * fretSpacing}
              x2={width - paddingX} y2={paddingY + i * fretSpacing}
              stroke="var(--border, #e4e4e7)"
              strokeWidth={1}
            />
          )
        )}

        {/* Strings (variable thickness) */}
        {Array.from({ length: stringCount }).map((_, i) => (
          <line
            key={`string-${i}`}
            x1={paddingX + i * stringSpacing} y1={paddingY}
            x2={paddingX + i * stringSpacing} y2={height - bottomPad}
            stroke="var(--foreground-muted, #71717a)"
            strokeWidth={getStringWidth(i)}
            opacity={0.7}
          />
        ))}

        {/* Barre */}
        {barre && (
          <rect
            x={paddingX - 4}
            y={paddingY + (barre - startFret) * fretSpacing + fretSpacing / 4}
            width={(stringCount - 1) * stringSpacing + 8}
            height={fretSpacing / 2}
            rx={fretSpacing / 4}
            fill="var(--foreground, #09090b)"
          />
        )}

        {/* Finger dots, mutes, and opens */}
        {frets.map((fret, i) => {
          const x = paddingX + i * stringSpacing;

          if (fret === -1) {
            // Muted (X)
            return (
              <text
                key={`mute-${i}`}
                x={x}
                y={paddingY - 10}
                fontSize="11"
                fontWeight="600"
                fill="var(--foreground-dim, #71717a)"
                textAnchor="middle"
                fontFamily="var(--font-mono, monospace)"
              >
                ×
              </text>
            );
          } else if (fret === 0) {
            // Open (O)
            return (
              <circle
                key={`open-${i}`}
                cx={x}
                cy={paddingY - 14}
                r="4.5"
                fill="none"
                stroke="var(--foreground, #09090b)"
                strokeWidth="1.5"
              />
            );
          } else if (fret > 0) {
            // Fret dot with finger number
            const visualFret = fret - startFret + 1;
            const cy = paddingY + (visualFret - 1) * fretSpacing + fretSpacing / 2;
            const fingerNum = fingers ? fingers[i] : 0;

            return (
              <g key={`dot-${i}`}>
                <circle
                  cx={x}
                  cy={cy}
                  r="6.5"
                  fill="var(--foreground, #09090b)"
                />
                {fingerNum > 0 && (
                  <text
                    x={x}
                    y={cy + 3.5}
                    fontSize="8.5"
                    fontWeight="700"
                    fill="white"
                    textAnchor="middle"
                    fontFamily="var(--font-mono, monospace)"
                  >
                    {fingerNum}
                  </text>
                )}
              </g>
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
});
