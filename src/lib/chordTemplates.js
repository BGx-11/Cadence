/**
 * Advanced Chord Template Matching Engine
 * 
 * Uses perceptually-weighted chord templates with cosine similarity scoring
 * and a Hidden Markov Model (Viterbi decoding) for temporally coherent
 * chord sequence estimation.
 * 
 * This replaces the basic binary template matching and the `chord-recognition`
 * npm package with a significantly more accurate system.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Perceptually Weighted Chord Templates ──────────────────────────────
// Values represent the expected relative energy of each pitch class in the chord.
// Root = 1.0, Fifth = 0.8, Third = 0.6, Seventh = 0.4, Extensions = 0.3
// This is much more accurate than binary [0,1] masks.

const CHORD_TEMPLATES = {
  // Major triad: root, major 3rd, perfect 5th
  '':       [1.0, 0, 0, 0, 0.6, 0, 0, 0.8, 0, 0, 0, 0],
  // Minor triad: root, minor 3rd, perfect 5th
  'm':      [1.0, 0, 0, 0.6, 0, 0, 0, 0.8, 0, 0, 0, 0],
  // Dominant 7th: root, major 3rd, perfect 5th, minor 7th
  '7':      [1.0, 0, 0, 0, 0.6, 0, 0, 0.8, 0, 0, 0.4, 0],
  // Minor 7th: root, minor 3rd, perfect 5th, minor 7th
  'm7':     [1.0, 0, 0, 0.6, 0, 0, 0, 0.8, 0, 0, 0.4, 0],
  // Major 7th: root, major 3rd, perfect 5th, major 7th
  'maj7':   [1.0, 0, 0, 0, 0.6, 0, 0, 0.8, 0, 0, 0, 0.4],
  // Diminished triad: root, minor 3rd, diminished 5th
  'dim':    [1.0, 0, 0, 0.6, 0, 0, 0.7, 0, 0, 0, 0, 0],
  // Augmented triad: root, major 3rd, augmented 5th
  'aug':    [1.0, 0, 0, 0, 0.6, 0, 0, 0, 0.7, 0, 0, 0],
  // Suspended 2nd: root, major 2nd, perfect 5th
  'sus2':   [1.0, 0, 0.5, 0, 0, 0, 0, 0.8, 0, 0, 0, 0],
  // Suspended 4th: root, perfect 4th, perfect 5th
  'sus4':   [1.0, 0, 0, 0, 0, 0.5, 0, 0.8, 0, 0, 0, 0],
  // Power chord: root, perfect 5th
  '5':      [1.0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0],
  // Diminished 7th: root, minor 3rd, diminished 5th, diminished 7th
  'dim7':   [1.0, 0, 0, 0.5, 0, 0, 0.6, 0, 0, 0.4, 0, 0],
  // Half-diminished (m7b5): root, minor 3rd, diminished 5th, minor 7th
  'm7b5':   [1.0, 0, 0, 0.5, 0, 0, 0.6, 0, 0, 0, 0.4, 0],
  // Add 9: root, major 2nd, major 3rd, perfect 5th
  'add9':   [1.0, 0, 0.3, 0, 0.6, 0, 0, 0.8, 0, 0, 0, 0],
  // Major 6th: root, major 3rd, perfect 5th, major 6th
  '6':      [1.0, 0, 0, 0, 0.6, 0, 0, 0.8, 0, 0.4, 0, 0],
  // Minor 6th: root, minor 3rd, perfect 5th, major 6th
  'm6':     [1.0, 0, 0, 0.6, 0, 0, 0, 0.8, 0, 0.4, 0, 0],
  // 9th chord: root, major 3rd, perfect 5th, minor 7th, major 9th
  '9':      [1.0, 0, 0.3, 0, 0.6, 0, 0, 0.7, 0, 0, 0.4, 0],
  // Minor 9th: root, minor 3rd, perfect 5th, minor 7th, major 9th
  'm9':     [1.0, 0, 0.3, 0.6, 0, 0, 0, 0.7, 0, 0, 0.4, 0],
  // 7sus4: root, perfect 4th, perfect 5th, minor 7th
  '7sus4':  [1.0, 0, 0, 0, 0, 0.5, 0, 0.8, 0, 0, 0.4, 0],
};

// Chord type bias: slightly prefer simpler chords when scores are close
// Negative values penalize, positive values boost
const TYPE_BIAS = {
  '': 0.02,      // Slight boost for major
  'm': 0.02,     // Slight boost for minor
  '5': -0.03,    // Slight penalty for power chord (often misdetected)
  '7': 0.0,
  'm7': 0.0,
  'maj7': -0.01,
  'dim': -0.02,
  'aug': -0.03,
  'sus2': -0.01,
  'sus4': -0.01,
  'dim7': -0.02,
  'm7b5': -0.02,
  'add9': -0.02,
  '6': -0.01,
  'm6': -0.02,
  '9': -0.03,
  'm9': -0.03,
  '7sus4': -0.02,
};

// ─── Chord Labels for HMM ─────────────────────────────────────────────
// Pre-build all possible chord labels (12 roots × N types + "N" for no chord)

const CHORD_TYPES = Object.keys(CHORD_TEMPLATES);
const ALL_CHORD_LABELS = ['N']; // Index 0 = no chord
for (let root = 0; root < 12; root++) {
  for (const type of CHORD_TYPES) {
    ALL_CHORD_LABELS.push(NOTE_NAMES[root] + type);
  }
}
const NUM_STATES = ALL_CHORD_LABELS.length;

// ─── Utility Functions ─────────────────────────────────────────────────

function rotateArray(arr, n) {
  const len = arr.length;
  const shift = ((n % len) + len) % len;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

function normalizeHPCP(hpcp) {
  const max = Math.max(...hpcp);
  if (max < 1e-8) return hpcp.map(() => 0);
  return hpcp.map(v => v / max);
}

function l2Norm(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum);
}

// ─── Cosine Similarity Scoring ──────────────────────────────────────────

/**
 * Compute cosine similarity between HPCP vector and a chord template.
 * Returns value between -1 and 1 (higher = better match).
 */
function cosineSimilarity(hpcp, template) {
  let dot = 0;
  for (let i = 0; i < 12; i++) {
    dot += hpcp[i] * template[i];
  }
  const normA = l2Norm(hpcp);
  const normB = l2Norm(template);
  if (normA < 1e-8 || normB < 1e-8) return 0;
  return dot / (normA * normB);
}

/**
 * Score with non-chord-tone penalty.
 * Penalizes energy in pitch classes where the template has zero weight.
 * This is critical for avoiding false matches where e.g. a C major template
 * scores well simply because C, E, G have energy — even if D and F# also have
 * strong energy (which would suggest a different chord).
 */
function scoreChordMatch(hpcp, template) {
  const similarity = cosineSimilarity(hpcp, template);
  
  // Calculate non-chord-tone penalty
  let nonChordEnergy = 0;
  let chordEnergy = 0;
  for (let i = 0; i < 12; i++) {
    if (template[i] > 0) {
      chordEnergy += hpcp[i];
    } else {
      nonChordEnergy += hpcp[i];
    }
  }
  
  const totalEnergy = chordEnergy + nonChordEnergy;
  const chordRatio = totalEnergy > 1e-8 ? chordEnergy / totalEnergy : 0;
  
  // Final score combines cosine similarity with chord-tone concentration
  return similarity * 0.6 + chordRatio * 0.4;
}

// ─── Main Chord Matching Function ───────────────────────────────────────

/**
 * Match an HPCP vector against all chord templates.
 * Returns scores for ALL possible chords (used by Viterbi).
 * 
 * @param {number[]} hpcpVector - 12-bin HPCP vector (C=index 0)
 * @returns {number[]} scores array indexed by ALL_CHORD_LABELS
 */
function computeEmissionScores(hpcpVector) {
  const hpcp = normalizeHPCP(hpcpVector);
  const scores = new Float64Array(NUM_STATES);
  
  // Score for "N" (no chord) — low constant
  scores[0] = 0.1;
  
  // Check if there's any significant energy
  const totalEnergy = hpcp.reduce((a, b) => a + b, 0);
  if (totalEnergy < 0.01) {
    // Silence — boost "N"
    scores[0] = 0.9;
    return scores;
  }
  
  let idx = 1;
  for (let root = 0; root < 12; root++) {
    const rotated = rotateArray(hpcp, root);
    
    for (const type of CHORD_TYPES) {
      const template = CHORD_TEMPLATES[type];
      let score = scoreChordMatch(rotated, template);
      
      // Apply type bias
      score += (TYPE_BIAS[type] || 0);
      
      // Root energy bonus — the root note should be prominent
      score += rotated[0] * 0.1;
      
      // Fifth energy bonus — the fifth should also be present
      if (template[7] > 0) {
        score += rotated[7] * 0.05;
      }
      
      scores[idx] = Math.max(0, score);
      idx++;
    }
  }
  
  return scores;
}

/**
 * Quick single-frame chord match (for display/non-HMM use).
 */
function matchChordFromHPCP(hpcpVector) {
  const scores = computeEmissionScores(hpcpVector);
  
  let bestIdx = 0;
  let bestScore = scores[0];
  for (let i = 1; i < NUM_STATES; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIdx = i;
    }
  }
  
  return {
    chord: ALL_CHORD_LABELS[bestIdx],
    confidence: Math.max(0, Math.min(1, bestScore))
  };
}

// ─── Key-Aware Transition Probabilities ────────────────────────────────

/**
 * Build a chord transition probability matrix.
 * Diatonic transitions (within key) are much more likely than chromatic ones.
 * 
 * @param {string} keyRoot - e.g. 'C'
 * @param {string} keyScale - 'major' or 'minor'
 * @returns {Float64Array} NUM_STATES × NUM_STATES transition matrix (flat)
 */
function buildTransitionMatrix(keyRoot, keyScale) {
  const rootIdx = NOTE_NAMES.indexOf(keyRoot);
  
  // Diatonic scale degrees (semitones from root)
  const majorScale = [0, 2, 4, 5, 7, 9, 11];
  const minorScale = [0, 2, 3, 5, 7, 8, 10];
  const scale = keyScale === 'minor' ? minorScale : majorScale;
  
  // Diatonic pitch classes
  const diatonicPCs = new Set(scale.map(s => (rootIdx + s) % 12));
  
  // Expected chord qualities for each scale degree
  // Major: I(maj), ii(m), iii(m), IV(maj), V(maj), vi(m), vii(dim)
  // Minor: i(m), ii(dim), III(maj), iv(m), v(m), VI(maj), VII(maj)
  const majorQualities = ['', 'm', 'm', '', '', 'm', 'dim'];
  const minorQualities = ['m', 'dim', '', 'm', 'm', '', ''];
  const qualities = keyScale === 'minor' ? minorQualities : majorQualities;
  
  // Build set of diatonic chord labels
  const diatonicChords = new Set();
  for (let i = 0; i < scale.length; i++) {
    const pc = (rootIdx + scale[i]) % 12;
    const chordLabel = NOTE_NAMES[pc] + qualities[i];
    diatonicChords.add(chordLabel);
    // Also add 7th chords on diatonic roots
    const m7Label = NOTE_NAMES[pc] + 'm7';
    const dom7Label = NOTE_NAMES[pc] + '7';
    const maj7Label = NOTE_NAMES[pc] + 'maj7';
    diatonicChords.add(m7Label);
    diatonicChords.add(dom7Label);
    diatonicChords.add(maj7Label);
  }
  
  const SELF_TRANSITION = 0.6;      // Probability of staying on same chord
  const DIATONIC_TRANSITION = 0.25; // Distributed among diatonic chords
  const CHROMATIC_TRANSITION = 0.15; // Distributed among all other chords
  
  const numDiatonic = diatonicChords.size;
  const numChromatic = NUM_STATES - 1 - numDiatonic; // -1 for self
  
  const matrix = new Float64Array(NUM_STATES * NUM_STATES);
  
  for (let from = 0; from < NUM_STATES; from++) {
    let rowSum = 0;
    
    for (let to = 0; to < NUM_STATES; to++) {
      let prob;
      
      if (from === to) {
        prob = SELF_TRANSITION;
      } else if (to === 0) {
        // Transition to "N" (no chord) — rare
        prob = 0.01;
      } else if (diatonicChords.has(ALL_CHORD_LABELS[to])) {
        prob = DIATONIC_TRANSITION / Math.max(1, numDiatonic);
      } else {
        prob = CHROMATIC_TRANSITION / Math.max(1, numChromatic);
      }
      
      matrix[from * NUM_STATES + to] = prob;
      rowSum += prob;
    }
    
    // Normalize row
    if (rowSum > 0) {
      for (let to = 0; to < NUM_STATES; to++) {
        matrix[from * NUM_STATES + to] /= rowSum;
      }
    }
  }
  
  return matrix;
}

// ─── Viterbi Decoding ──────────────────────────────────────────────────

/**
 * Viterbi algorithm for finding the most likely chord sequence.
 * This is the key to temporally coherent chord detection.
 * 
 * @param {Float64Array[]} emissionScores - Array of score vectors per frame
 * @param {Float64Array} transMatrix - Flat transition probability matrix
 * @returns {number[]} Best state indices for each frame
 */
function viterbiDecode(emissionScores, transMatrix) {
  const T = emissionScores.length;
  if (T === 0) return [];
  
  const N = NUM_STATES;
  
  // Use log probabilities to avoid underflow
  const viterbi = new Float64Array(T * N);
  const backpointer = new Int32Array(T * N);
  
  // Initialize
  const uniformPrior = Math.log(1 / N);
  for (let s = 0; s < N; s++) {
    const emission = Math.log(Math.max(1e-10, emissionScores[0][s]));
    viterbi[s] = uniformPrior + emission;
    backpointer[s] = 0;
  }
  
  // Forward pass
  for (let t = 1; t < T; t++) {
    for (let s = 0; s < N; s++) {
      let bestPrev = -Infinity;
      let bestPrevState = 0;
      
      for (let ps = 0; ps < N; ps++) {
        const trans = Math.log(Math.max(1e-10, transMatrix[ps * N + s]));
        const val = viterbi[(t - 1) * N + ps] + trans;
        if (val > bestPrev) {
          bestPrev = val;
          bestPrevState = ps;
        }
      }
      
      const emission = Math.log(Math.max(1e-10, emissionScores[t][s]));
      viterbi[t * N + s] = bestPrev + emission;
      backpointer[t * N + s] = bestPrevState;
    }
  }
  
  // Backtrace
  const path = new Array(T);
  let bestFinal = -Infinity;
  let bestFinalState = 0;
  for (let s = 0; s < N; s++) {
    if (viterbi[(T - 1) * N + s] > bestFinal) {
      bestFinal = viterbi[(T - 1) * N + s];
      bestFinalState = s;
    }
  }
  
  path[T - 1] = bestFinalState;
  for (let t = T - 2; t >= 0; t--) {
    path[t] = backpointer[(t + 1) * N + path[t + 1]];
  }
  
  return path;
}

// ─── Beat-Synchronous Chord Detection with Viterbi ─────────────────────

/**
 * The main chord detection pipeline:
 * 1. Compute HPCP emission scores per beat
 * 2. Build key-aware transition matrix
 * 3. Run Viterbi decoding for optimal chord sequence
 * 4. Merge consecutive identical chords
 * 
 * @param {number[]} beats - Beat timestamps in seconds
 * @param {number[][]} hpcpFrames - HPCP vectors per analysis frame
 * @param {number[]} frameTimestamps - Timestamp per HPCP frame
 * @param {string} detectedKey - e.g. "C major"
 * @param {number} totalDuration - Total audio duration
 * @returns {Array<{time: number, chord: string, confidence: number}>}
 */
function detectChordsWithViterbi(beats, hpcpFrames, frameTimestamps, detectedKey, totalDuration) {
  if (beats.length === 0 || hpcpFrames.length === 0) return [];
  
  // Parse key
  const keyParts = detectedKey.split(' ');
  let keyRoot = keyParts[0] || 'C';
  let keyScale = keyParts[1] || 'major';
  
  // Handle flat key names
  const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  keyRoot = flatToSharp[keyRoot] || keyRoot;
  
  // Step 1: Compute average HPCP per beat segment
  const beatHPCPs = [];
  for (let b = 0; b < beats.length; b++) {
    const beatStart = beats[b];
    const beatEnd = b < beats.length - 1 ? beats[b + 1] : totalDuration;
    
    // Collect HPCP frames within this beat
    const segFrames = [];
    for (let f = 0; f < frameTimestamps.length; f++) {
      if (frameTimestamps[f] >= beatStart && frameTimestamps[f] < beatEnd) {
        segFrames.push(hpcpFrames[f]);
      }
    }
    
    if (segFrames.length === 0) {
      // No frames — use silence
      beatHPCPs.push(new Array(12).fill(0));
      continue;
    }
    
    // Average HPCP
    const avg = new Array(12).fill(0);
    for (const frame of segFrames) {
      for (let h = 0; h < 12; h++) {
        avg[h] += frame[h];
      }
    }
    for (let h = 0; h < 12; h++) {
      avg[h] /= segFrames.length;
    }
    beatHPCPs.push(avg);
  }
  
  // Step 2: Compute emission scores for each beat
  const emissions = beatHPCPs.map(hpcp => computeEmissionScores(hpcp));
  
  // Step 3: Build transition matrix
  const transMatrix = buildTransitionMatrix(keyRoot, keyScale);
  
  // Step 4: Viterbi decode
  const path = viterbiDecode(emissions, transMatrix);
  
  // Step 5: Convert path to chord events and merge consecutive identical chords
  const rawChords = [];
  for (let b = 0; b < path.length; b++) {
    const stateIdx = path[b];
    const chordLabel = ALL_CHORD_LABELS[stateIdx];
    const score = emissions[b][stateIdx];
    
    if (chordLabel === 'N') continue; // Skip no-chord
    
    rawChords.push({
      time: beats[b],
      chord: chordLabel,
      confidence: Math.max(0, Math.min(1, score))
    });
  }
  
  // Step 6: Merge consecutive identical chords
  if (rawChords.length === 0) return [];
  
  const merged = [rawChords[0]];
  for (let i = 1; i < rawChords.length; i++) {
    if (rawChords[i].chord !== merged[merged.length - 1].chord) {
      merged.push(rawChords[i]);
    } else {
      // Update confidence to max of merged segment
      merged[merged.length - 1].confidence = Math.max(
        merged[merged.length - 1].confidence,
        rawChords[i].confidence
      );
    }
  }
  
  // Step 7: Remove very short segments (< 0.5s) by absorbing into neighbors
  if (merged.length > 1) {
    const cleaned = [merged[0]];
    for (let i = 1; i < merged.length; i++) {
      const nextTime = i < merged.length - 1 ? merged[i + 1].time : totalDuration;
      const segDur = nextTime - merged[i].time;
      if (segDur >= 0.5) {
        cleaned.push(merged[i]);
      }
    }
    return cleaned.length > 0 ? cleaned : [merged[0]];
  }
  
  return merged;
}

export {
  NOTE_NAMES,
  CHORD_TEMPLATES,
  CHORD_TYPES,
  ALL_CHORD_LABELS,
  NUM_STATES,
  normalizeHPCP,
  cosineSimilarity,
  scoreChordMatch,
  computeEmissionScores,
  matchChordFromHPCP,
  buildTransitionMatrix,
  viterbiDecode,
  detectChordsWithViterbi,
};
