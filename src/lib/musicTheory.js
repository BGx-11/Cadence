/**
 * Cadence Music Theory Engine
 * 
 * Provides unified, deterministic music theory calculations:
 * - Enharmonic note transposition
 * - Chord simplification (preserving maj7 vs minor distinction)
 * - Roman numeral analysis (harmonic function relative to detected key)
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const FLAT_TO_SHARP = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

/**
 * Transpose a chord symbol by a given number of semitones (-11 to +11).
 */
export function transposeChordName(chord, steps) {
  if (!chord || chord === 'N' || chord === 'N.C.') return chord || 'N.C.';

  const rootMatch = chord.match(/^[A-G][#b]?/);
  if (!rootMatch) return chord;

  let root = rootMatch[0];
  root = FLAT_TO_SHARP[root] || root;

  const rootIndex = NOTE_NAMES.indexOf(root);
  if (rootIndex === -1) return chord;

  let newIndex = (rootIndex + steps) % 12;
  if (newIndex < 0) newIndex += 12;

  return NOTE_NAMES[newIndex] + chord.slice(rootMatch[0].length);
}

/**
 * Simplify extended or altered chords into basic playable triads.
 * BUG-01 Fix: Distinguishes 'maj' (major 7th) from 'm' (minor) reliably.
 */
export function simplifyChord(chord) {
  if (!chord) return '';
  if (chord === 'N' || chord === 'N.C.') return 'N.C.';

  const rootMatch = chord.match(/^[A-G][#b]?/);
  if (!rootMatch) return chord;

  const root = rootMatch[0];
  const rest = chord.slice(root.length);

  // Major 7th / Major extensions -> Major triad (prevents Cmaj7 -> Cm)
  if (rest.startsWith('maj')) return root;
  // Minor chords (m, m7, min, m9) -> Minor triad
  if (rest.startsWith('m') || rest.startsWith('min')) return root + 'm';
  // Diminished chords
  if (rest.startsWith('dim')) return root + 'dim';
  // Other extensions (7, 9, sus4, sus2, 6, add9) -> Major triad
  return root;
}

/**
 * Transpose a musical key signature (e.g. 'C major' -> 'D major' with steps = 2).
 */
export function transposeKey(keyString, steps) {
  if (!keyString) return '';
  const parts = keyString.trim().split(/\s+/);
  if (parts.length === 0) return keyString;
  const transposedRoot = transposeChordName(parts[0], steps);
  if (parts.length > 1) {
    return `${transposedRoot} ${parts.slice(1).join(' ')}`;
  }
  return transposedRoot;
}

/**
 * Derive Roman Numeral harmonic degree (FEAT-34) from a chord and detected key.
 * e.g. In C Major: C -> I, Dm -> ii, G7 -> V7, Am -> vi, F -> IV, Bb -> bVII
 * e.g. In A Minor: Am -> i, C -> III, Dm -> iv, E -> V, F -> VI, G -> VII
 */
export function getRomanNumeral(chord, keyString) {
  if (!chord || chord === 'N' || chord === 'N.C.') return 'N.C.';
  if (!keyString) return '';

  const [keyRootRaw, keyScale = 'major'] = keyString.split(' ');
  const keyRoot = FLAT_TO_SHARP[keyRootRaw] || keyRootRaw;
  const tonicIdx = NOTE_NAMES.indexOf(keyRoot);
  if (tonicIdx === -1) return '';

  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return '';

  const chordRoot = FLAT_TO_SHARP[match[1]] || match[1];
  const chordExt = match[2] || '';
  const rootIdx = NOTE_NAMES.indexOf(chordRoot);
  if (rootIdx === -1) return '';

  const semitones = (rootIdx - tonicIdx + 12) % 12;
  const isMinorKey = keyScale.toLowerCase().includes('minor');
  const isMinorChord = chordExt.startsWith('m') && !chordExt.startsWith('maj');
  const isDimChord = chordExt.startsWith('dim');

  const majorDegrees = {
    0: 'I', 1: 'bII', 2: 'ii', 3: 'bIII', 4: 'iii', 5: 'IV',
    6: 'bV', 7: 'V', 8: 'bVI', 9: 'vi', 10: 'bVII', 11: 'vii'
  };

  // BUG-31 Fix: Correct chromatic minor key degree mappings (distinguish 4=#III from 5=iv)
  const minorDegrees = {
    0: 'i', 1: 'bII', 2: 'ii', 3: 'III', 4: '#III', 5: 'iv',
    6: 'bV', 7: 'v', 8: 'VI', 9: '#vi', 10: 'VII', 11: 'vii'
  };

  let numeral = (isMinorKey ? minorDegrees[semitones] : majorDegrees[semitones]) || 'I';

  if (isDimChord) {
    numeral = numeral.toLowerCase() + '°';
  } else if (isMinorChord) {
    numeral = numeral.toLowerCase();
  } else if (!chordExt || chordExt === '7' || chordExt.startsWith('maj')) {
    numeral = numeral.toUpperCase();
  }

  // Preserve functional extension
  if (chordExt === '7') numeral += '7';
  else if (chordExt === 'maj7') numeral += 'maj7';
  else if (chordExt === 'm7') numeral += '7';
  else if (chordExt.startsWith('sus')) numeral += chordExt;

  return numeral;
}

/**
 * Format a time signature value (object, string, or number) into standard string notation (e.g. "4/4", "6/8").
 */
export function formatTimeSignature(ts) {
  if (typeof ts === 'object' && ts !== null) {
    return `${ts.numerator || 4}/${ts.denominator || 4}`;
  }
  if (typeof ts === 'string' && ts.includes('/')) return ts;
  return `${ts || 4}/4`;
}

/**
 * Determine if a beat index represents a measure downbeat.
 */
export function isDownbeat(beatIndex, timeSignature) {
  const tsNumerator = typeof timeSignature === 'object' && timeSignature !== null
    ? timeSignature.numerator || 4
    : typeof timeSignature === 'number'
    ? timeSignature
    : parseInt(String(timeSignature).split('/')[0], 10) || 4;
  return beatIndex % tsNumerator === 0;
}

/**
 * Normalize an edited chord shape (e.g. guitar capo shape in Easy mode or transposed chord)
 * back to the underlying base detected chord.
 */
export function normalizeUserEditedChord(displayedChord, { difficulty = 'intermediate', capo = 0, transpose = 0 } = {}) {
  if (!displayedChord || typeof displayedChord !== 'string') return '';
  const trimmed = displayedChord.trim();
  const capoOffset = (difficulty === 'easy' ? capo : 0) - transpose;
  return capoOffset !== 0 ? transposeChordName(trimmed, capoOffset) : trimmed;
}

