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

function mergeConsecutiveIdentical(items) {
  const merged = [];
  for (const c of items) {
    if (merged.length === 0) {
      merged.push({ ...c });
    } else {
      const last = merged[merged.length - 1];
      if (last.chord === c.chord) {
        last.duration = (c.time + (c.duration || 0)) - last.time;
        last.beatCount = (last.beatCount || 1) + (c.beatCount || 1);
        last.confidence = Math.max(last.confidence || 0.5, c.confidence || 0.5);
        last.isUserEdited = last.isUserEdited || c.isUserEdited;
      } else {
        merged.push({ ...c });
      }
    }
  }
  return merged;
}

/**
 * Smart Chord Pacing & Harmonic Smoothing Engine
 * 
 * Eliminates frantic, transient chord switches that are confusing for players.
 * Resolves harmonic excursions (A -> X -> A) where passing notes/melodic embellishments
 * trigger momentary false chord switches ("even when it's not there in the chord").
 * 
 * Supports three pacing levels:
 * - 'smart': Filters excursions and transient flickers (< 1.2s or ~2 beats)
 * - 'relaxed': Consolidates chords to measure-level rhythm changes (~1.8s - 2.5s)
 * - 'detailed': Retains raw chord transitions down to 0.4s
 * 
 * Respects user-edited chords (isUserEdited) so manual adjustments are never deleted.
 */
export function smartSmoothChords(chordsList, totalDuration = 0, options = {}) {
  const { pacing = 'smart', bpm = 120 } = options;
  if (!chordsList || chordsList.length === 0) return [];

  const beatSec = bpm > 0 ? 60 / bpm : 0.5;

  if (pacing === 'detailed') {
    let merged = mergeConsecutiveIdentical(chordsList);
    if (merged.length > 1) {
      let clean = [];
      for (let i = 0; i < merged.length; i++) {
        const cur = merged[i];
        if (cur.duration < 0.4 && !cur.isUserEdited && clean.length > 0) {
          const prev = clean[clean.length - 1];
          prev.duration += cur.duration;
          prev.beatCount = (prev.beatCount || 1) + (cur.beatCount || 1);
        } else {
          clean.push({ ...cur });
        }
      }
      merged = mergeConsecutiveIdentical(clean);
    }
    for (let i = 0; i < merged.length; i++) {
      const nextTime = i < merged.length - 1 ? merged[i + 1].time : (totalDuration || merged[i].time + merged[i].duration);
      merged[i].duration = Math.max(0.01, nextTime - merged[i].time);
      merged[i].id = merged[i].id || `chord-${Number(merged[i].time).toFixed(2)}`;
    }
    return merged;
  }

  // Adaptive threshold based on tempo
  // At 120 BPM: 2 beats = 1.0s. At 80 BPM: 2 beats = 1.5s. At 160 BPM: 2 beats = 0.75s.
  const minDuration = pacing === 'relaxed'
    ? Math.max(1.8, Math.min(2.8, beatSec * 3.5))
    : Math.max(0.85, Math.min(1.4, beatSec * 1.8));

  // 1. Merge consecutive identical chords
  let list = mergeConsecutiveIdentical(chordsList);

  // 2. Remove harmonic excursions (A -> X -> A) where X is a transient excursion
  let passChanged = true;
  let iterations = 0;
  while (passChanged && iterations < 5) {
    passChanged = false;
    iterations++;
    const nextList = [];
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const prev = i > 0 ? list[i - 1] : null;
      const next = i < list.length - 1 ? list[i + 1] : null;

      if (prev && next && prev.chord === next.chord && cur.chord !== prev.chord && !cur.isUserEdited) {
        const excursionLimit = pacing === 'relaxed' ? 2.5 : 1.6;
        if (cur.duration <= excursionLimit) {
          prev.duration += cur.duration;
          prev.beatCount = (prev.beatCount || 1) + (cur.beatCount || 1);
          passChanged = true;
          continue;
        }
      }
      nextList.push({ ...cur });
    }
    list = mergeConsecutiveIdentical(nextList);
  }

  // 3. Absorb any remaining micro-durations (< minDuration) into neighbor
  if (list.length > 1) {
    let clean = [];
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur.duration < minDuration && !cur.isUserEdited && clean.length > 0) {
        const prev = clean[clean.length - 1];
        prev.duration += cur.duration;
        prev.beatCount = (prev.beatCount || 1) + (cur.beatCount || 1);
      } else {
        clean.push({ ...cur });
      }
    }
    list = mergeConsecutiveIdentical(clean);
  }

  // 4. Seamless duration tiling
  for (let i = 0; i < list.length; i++) {
    const nextTime = i < list.length - 1 ? list[i + 1].time : (totalDuration || list[i].time + list[i].duration);
    list[i].duration = Math.max(0.01, nextTime - list[i].time);
    list[i].id = list[i].id || `chord-${Number(list[i].time).toFixed(2)}`;
  }

  return list;
}

/**
 * Formats a clean, readable ASCII practice chord chart (inspired by Orbiter's Render & Export).
 * Groups chords by song section if available, in rows of 4 measures/bars.
 */
export function formatPracticeChartText({
  title = 'Untitled Song',
  key = 'C Major',
  bpm = 120,
  timeSignature = 4,
  capoFret = 0,
  sections = [],
  chords = []
}) {
  const tsStr = formatTimeSignature(timeSignature);
  const lines = [];
  lines.push('====================================================');
  lines.push('CADENCE PRACTICE CHORD CHART');
  lines.push(`Track: ${title}`);
  lines.push(`Key: ${key} | BPM: ${bpm || '—'} | Meter: ${tsStr}`);
  if (capoFret > 0) {
    lines.push(`Recommended Capo: Fret ${capoFret}`);
  }
  lines.push('====================================================\n');

  if (!chords || chords.length === 0) {
    lines.push('No chords detected.\n');
    return lines.join('\n');
  }

  const formatSec = (sec) => {
    if (sec == null || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (sections && sections.length > 0) {
    for (const sec of sections) {
      lines.push(`[${sec.label}] (${formatSec(sec.startTime)} - ${formatSec(sec.endTime)})`);
      const secChords = chords.filter(c => c.time >= sec.startTime - 0.05 && c.time < sec.endTime - 0.05);
      if (secChords.length > 0) {
        let row = [];
        for (let i = 0; i < secChords.length; i++) {
          row.push(secChords[i].chord.padEnd(6, ' '));
          if (row.length === 4 || i === secChords.length - 1) {
            lines.push(`| ${row.join('| ')}|`);
            row = [];
          }
        }
      } else {
        lines.push('| (Instrumental / Silence) |');
      }
      lines.push('');
    }
  } else {
    let row = [];
    for (let i = 0; i < chords.length; i++) {
      row.push(chords[i].chord.padEnd(6, ' '));
      if (row.length === 4 || i === chords.length - 1) {
        lines.push(`| ${row.join('| ')}|`);
        row = [];
      }
    }
    lines.push('');
  }

  lines.push('====================================================');
  lines.push('Exported from Cadence');
  return lines.join('\n');
}


