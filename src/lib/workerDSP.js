/**
 * Cadence Worker DSP & Music Theory Primitives
 * 
 * Extracted pure algorithmic logic for:
 * - 12-bin pitch-class chord templates & scoring
 * - Silence (N.C.) pre-normalization emission calculation
 * - HMM transition matrix creation & Viterbi decoding
 * - Duration-tiled chord consolidation
 * - Phase-invariant meter evaluation (3/4, 4/4, 6/8)
 * - Structural section detection & waveform decimation
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Perceptually weighted chord templates (exact 12 pitch classes: C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
// The defining 3rd is weighted higher (0.85) than the common 5th (0.65) to eliminate 3rd-harmonic bleed
export const CHORD_TEMPLATES = {
  '':      [1.0, 0, 0, -0.35, 0.85, 0, 0, 0.65, 0, 0, 0, 0],      // Major triad: 1, (no b3), 3, 5
  'm':     [1.0, 0, 0, 0.85, -0.35, 0, 0, 0.65, 0, 0, 0, 0],      // Minor triad: 1, b3, (no 3), 5
  '7':     [1.0, 0, 0, -0.35, 0.80, 0, 0, 0.60, 0, 0, 0.65, 0],   // Dominant 7th: 1, 3, 5, b7
  'm7':    [1.0, 0, 0, 0.80, -0.35, 0, 0, 0.60, 0, 0, 0.65, 0],   // Minor 7th: 1, b3, 5, b7
  'maj7':  [1.0, 0, 0, -0.35, 0.80, 0, 0, 0.60, 0, 0, 0, 0.65],   // Major 7th: 1, 3, 5, 7
  'sus4':  [1.0, 0, 0, -0.25, -0.25, 0.75, 0, 0.65, 0, 0, 0, 0],  // Suspended 4th (inhibits major/minor 3rd)
  'sus2':  [1.0, 0, 0.75, -0.25, -0.25, 0, 0, 0.65, 0, 0, 0, 0],  // Suspended 2nd (inhibits major/minor 3rd)
  'dim':   [1.0, 0, 0, 0.80, -0.35, 0, 0.75, -0.35, 0, 0, 0, 0],  // Diminished triad: 1, b3, b5 (inhibits 3 and P5)
};

export const CHORD_TYPES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', 'dim'];

export const TYPE_BIAS = {
  '': 0.06,      // Natural musical prior for major triads
  'm': 0.06,     // Natural musical prior for minor triads
  '7': -0.01,
  'm7': -0.01,
  'maj7': -0.02,
  'sus4': -0.08,  // Requires distinct sustained 4th evidence, avoids 1-beat flickers
  'sus2': -0.08,  // Requires distinct sustained 2nd evidence, avoids 1-beat flickers
  'dim': -0.04,
};

export const ALL_CHORD_LABELS = [];
for (let root = 0; root < 12; root++) {
  for (const type of CHORD_TYPES) {
    ALL_CHORD_LABELS.push(NOTE_NAMES[root] + type);
  }
}
ALL_CHORD_LABELS.push('N.C.'); // State 96: Silence / No-Chord (N.C.)
export const NO_CHORD_STATE = 96;
export const NUM_STATES = ALL_CHORD_LABELS.length; // 97 states: 96 chords + N.C.

export function rotateArray(arr, n) {
  const len = arr.length;
  const shift = ((n % len) + len) % len;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

export function normalizeHPCP(hpcp) {
  const max = Math.max(...hpcp);
  if (max < 1e-8) return hpcp.map(() => 0);
  return hpcp.map(v => v / max);
}

export function l2Norm(arr) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum);
}

export function cosineSimilarity(hpcp, template) {
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += hpcp[i] * template[i];
  const normA = l2Norm(hpcp);
  const normB = l2Norm(template);
  if (normA < 1e-8 || normB < 1e-8) return 0;
  return dot / (normA * normB);
}

export function scoreChordMatch(hpcp, template) {
  const similarity = Math.max(0, cosineSimilarity(hpcp, template));
  let numChordBins = 0;
  let chordEnergy = 0;
  let nonChordEnergy = 0;

  for (let i = 0; i < 12; i++) {
    if (template[i] > 0) {
      chordEnergy += hpcp[i];
      numChordBins++;
    } else {
      nonChordEnergy += hpcp[i];
    }
  }

  const numNonChordBins = 12 - numChordBins;
  const avgChord = numChordBins > 0 ? chordEnergy / numChordBins : 0;
  const avgNonChord = numNonChordBins > 0 ? nonChordEnergy / numNonChordBins : 0;
  const contrast = (avgChord + avgNonChord > 1e-8) ? avgChord / (avgChord + avgNonChord) : 0;
  return similarity * 0.70 + contrast * 0.30;
}

export function computeChordConfidence(hpcpVector, stateIdx, bassVector = null) {
  if (stateIdx < 0 || stateIdx >= NUM_STATES) return 0.5;
  const rawMax = Math.max(...hpcpVector);
  const rawEnergy = hpcpVector.reduce((a, b) => a + b, 0);

  // Confidence for No-Chord state: high when frame is silent/ambient
  if (stateIdx === NO_CHORD_STATE) {
    return Math.max(0.60, Math.min(0.98, 1.0 - Math.min(1.0, rawEnergy * 8)));
  }
  if (rawMax < 0.015 || rawEnergy < 0.04) return 0.5;

  const hpcp = normalizeHPCP(hpcpVector);
  const root = Math.floor(stateIdx / CHORD_TYPES.length);
  const typeIdx = stateIdx % CHORD_TYPES.length;
  const template = CHORD_TEMPLATES[CHORD_TYPES[typeIdx]];
  const rotated = rotateArray(hpcp, root);

  const similarity = Math.max(0, cosineSimilarity(rotated, template));
  let numChordBins = 0;
  let chordEnergy = 0;
  let nonChordEnergy = 0;
  for (let i = 0; i < 12; i++) {
    if (template[i] > 0) {
      chordEnergy += rotated[i];
      numChordBins++;
    } else {
      nonChordEnergy += rotated[i];
    }
  }
  const numNonChordBins = 12 - numChordBins;
  const avgChord = numChordBins > 0 ? chordEnergy / numChordBins : 0;
  const avgNonChord = numNonChordBins > 0 ? nonChordEnergy / numNonChordBins : 0;
  const contrast = (avgChord + avgNonChord > 1e-8) ? avgChord / (avgChord + avgNonChord) : 0;

  let match = similarity * 0.70 + contrast * 0.30;
  if (rotated[0] > 0.5) match += 0.04;
  if (bassVector && bassVector[root] > 0.4) match += 0.04;

  return Math.max(0.1, Math.min(0.98, match));
}

export function computeEmissionScores(hpcpVector, bassVector = null, diatonicChords = null) {
  // Pre-normalization energy check (DSP-13 / Item 3):
  // normalizeHPCP() scales non-zero chroma so its largest bin is 1.0,
  // making post-normalization thresholds ineffective on low-volume/ambient audio.
  const rawMax = Math.max(...hpcpVector);
  const rawEnergy = hpcpVector.reduce((a, b) => a + b, 0);

  if (rawMax < 0.015 || rawEnergy < 0.04) {
    // Silence / ambient passage: No-Chord (N.C.) state dominates
    const scores = new Float64Array(NUM_STATES);
    scores.fill(0.001);
    scores[NO_CHORD_STATE] = 1.0;
    return scores;
  }

  const hpcp = normalizeHPCP(hpcpVector);
  const scores = new Float64Array(NUM_STATES);
  
  let idx = 0;
  for (let root = 0; root < 12; root++) {
    const rotated = rotateArray(hpcp, root);
    // Bass note bonus: if bass profile has distinct energy at this root note
    const bassBonus = (bassVector && bassVector[root] > 0.3) ? bassVector[root] * 0.25 : 0;
    
    for (const type of CHORD_TYPES) {
      const chordLabel = NOTE_NAMES[root] + type;
      const template = CHORD_TEMPLATES[type];
      let score = scoreChordMatch(rotated, template);
      score += (TYPE_BIAS[type] || 0);
      score += rotated[0] * 0.18; // Root note salience
      score += bassBonus;
      
      // Harmonic family bonus: if chord belongs to the song's key family, boost it
      if (diatonicChords && diatonicChords.has(chordLabel)) {
        score += 0.10;
      }
      
      scores[idx] = Math.max(0.001, score);
      idx++;
    }
  }

  // Emission for NO_CHORD_STATE: high when overall harmonic match across all chords is weak/noisy
  let maxChordScore = 0;
  for (let i = 0; i < 96; i++) {
    if (scores[i] > maxChordScore) maxChordScore = scores[i];
  }
  scores[NO_CHORD_STATE] = Math.max(0.001, 0.40 - maxChordScore * 0.45);

  // Softmax with calibrated temperature for stable probability distribution
  const TEMPERATURE = 0.18;
  let maxScore = -Infinity;
  for (let i = 0; i < NUM_STATES; i++) {
    if (scores[i] > maxScore) maxScore = scores[i];
  }
  
  let sumExp = 0;
  for (let i = 0; i < NUM_STATES; i++) {
    scores[i] = Math.exp((scores[i] - maxScore) / TEMPERATURE);
    sumExp += scores[i];
  }
  for (let i = 0; i < NUM_STATES; i++) {
    scores[i] /= sumExp;
  }
  
  return scores;
}

export function getHarmonicFamily(keyRoot, keyScale) {
  const rootIdx = NOTE_NAMES.indexOf(keyRoot);
  if (rootIdx === -1) return new Set();

  const family = new Set();
  const isMinor = (keyScale || '').toLowerCase().includes('minor');

  // Modal degrees calibrated distinctly for minor vs major keys:
  const coreDegrees = isMinor ? [
    { semitones: 0, types: ['m', 'm7', 'sus4', 'sus2', ''] },      // i (tonic minor)
    { semitones: 3, types: ['', 'maj7', 'sus2', 'sus4', 'm'] },     // bIII (relative major)
    { semitones: 5, types: ['m', 'm7', 'sus4', '', '7'] },          // iv / IV (subdominant)
    { semitones: 7, types: ['m', '7', '', 'm7', 'sus4'] },          // v / V (dominant minor & harmonic major V)
    { semitones: 8, types: ['', 'maj7', 'sus2', 'sus4', 'm'] },     // bVI (submediant)
    { semitones: 10, types: ['', '7', 'sus4', 'sus2', 'm'] },       // bVII (subtonic)
    { semitones: 2, types: ['m', 'dim', ''] },                     // ii / ii°
  ] : [
    { semitones: 0, types: ['', 'maj7', '7', 'sus4', 'sus2', 'm'] },// I (tonic major)
    { semitones: 5, types: ['', 'maj7', 'sus4', 'm', '7'] },         // IV (subdominant)
    { semitones: 7, types: ['', '7', 'sus4', 'm'] },                 // V (dominant)
    { semitones: 9, types: ['m', 'm7', ''] },                       // vi (relative minor)
    { semitones: 2, types: ['m', 'm7', '', '7'] },                  // ii (supertonic)
    { semitones: 4, types: ['m', 'm7'] },                           // iii (mediant)
    { semitones: 10, types: ['', '7'] },                            // bVII (Mixolydian modal rock)
    { semitones: 8, types: ['', 'm'] },                             // bVI (borrowed submediant)
    { semitones: 3, types: ['', 'm'] },                             // bIII (pentatonic rock)
  ];

  for (const deg of coreDegrees) {
    const pc = (rootIdx + deg.semitones) % 12;
    for (const t of deg.types) {
      family.add(NOTE_NAMES[pc] + t);
    }
  }

  return family;
}

export function buildTransitionMatrix(keyRoot, keyScale) {
  let root = keyRoot;
  const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  root = flatToSharp[root] || root;

  const diatonicChords = getHarmonicFamily(root, keyScale);
  const matrix = new Float64Array(NUM_STATES * NUM_STATES);

  // Calibrated self-transition prior (0.52 = temporal persistence without verse locking)
  const SELF_PROB = 0.52;
  const familyCount = Math.max(1, diatonicChords.size);
  const DIATONIC_PROB = 0.43 / familyCount;
  const chromaticCount = Math.max(1, NUM_STATES - familyCount);
  const CHROMATIC_PROB = 0.05 / chromaticCount;

  for (let from = 0; from < NUM_STATES; from++) {
    let rowSum = 0;
    for (let to = 0; to < NUM_STATES; to++) {
      let prob;
      if (from === to) {
        prob = SELF_PROB;
      } else if (to === NO_CHORD_STATE) {
        // Natural transition to silence at phrase endings / rests
        prob = 0.02;
      } else if (from === NO_CHORD_STATE) {
        // Exiting silence into a diatonic chord
        prob = diatonicChords.has(ALL_CHORD_LABELS[to]) ? DIATONIC_PROB * 1.5 : CHROMATIC_PROB;
      } else if (diatonicChords.has(ALL_CHORD_LABELS[to])) {
        prob = DIATONIC_PROB;
      } else {
        prob = CHROMATIC_PROB;
      }
      matrix[from * NUM_STATES + to] = prob;
      rowSum += prob;
    }
    if (rowSum > 0) {
      for (let to = 0; to < NUM_STATES; to++) {
        matrix[from * NUM_STATES + to] /= rowSum;
      }
    }
  }
  return { matrix, diatonicChords };
}

export function viterbiDecode(emissionScores, transMatrix) {
  const T = emissionScores.length;
  if (T === 0) return [];
  const N = NUM_STATES;
  
  const viterbi = new Float64Array(T * N);
  const backpointer = new Int32Array(T * N);
  
  const uniformPrior = Math.log(1 / N);
  const EMISSION_WEIGHT = 1.0;
  
  for (let s = 0; s < N; s++) {
    viterbi[s] = uniformPrior + EMISSION_WEIGHT * Math.log(Math.max(1e-10, emissionScores[0][s]));
    backpointer[s] = 0;
  }
  
  for (let t = 1; t < T; t++) {
    for (let s = 0; s < N; s++) {
      let bestPrev = -Infinity;
      let bestPrevState = 0;
      for (let ps = 0; ps < N; ps++) {
        const val = viterbi[(t - 1) * N + ps] + Math.log(Math.max(1e-10, transMatrix[ps * N + s]));
        if (val > bestPrev) { bestPrev = val; bestPrevState = ps; }
      }
      viterbi[t * N + s] = bestPrev + EMISSION_WEIGHT * Math.log(Math.max(1e-10, emissionScores[t][s]));
      backpointer[t * N + s] = bestPrevState;
    }
  }
  
  const path = new Array(T);
  let bestFinal = -Infinity, bestFinalState = 0;
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

export function consolidateChords(rawChordsList, totalDuration, minDurationSec = 0.8) {
  if (!rawChordsList || rawChordsList.length === 0) return [];

  // 1. Initial merge of consecutive identical chords
  let merged = [];
  for (const c of rawChordsList) {
    if (merged.length === 0) {
      merged.push({ ...c });
    } else {
      const last = merged[merged.length - 1];
      if (last.chord === c.chord) {
        last.duration = (c.time + (c.duration || 0)) - last.time;
        last.beatCount = (last.beatCount || 1) + (c.beatCount || 1);
        last.confidence = Math.max(last.confidence || 0.5, c.confidence || 0.5);
      } else {
        merged.push({ ...c });
      }
    }
  }

  // 2. Absorb micro-flickers (< 0.4s) into previous chord; preserve opening chord
  const flickerThreshold = Math.min(minDurationSec, 0.4);
  if (merged.length > 1) {
    let clean = [];
    for (let i = 0; i < merged.length; i++) {
      const cur = merged[i];
      if (cur.duration < flickerThreshold && clean.length > 0) {
        const prev = clean[clean.length - 1];
        prev.duration += cur.duration;
        prev.beatCount = (prev.beatCount || 1) + (cur.beatCount || 1);
      } else {
        clean.push(cur);
      }
    }
    merged = clean;
  }

  let finalChords = [];
  for (const c of merged) {
    if (finalChords.length === 0) {
      finalChords.push({ ...c });
    } else {
      const last = finalChords[finalChords.length - 1];
      if (last.chord === c.chord) {
        last.duration += c.duration;
        last.beatCount = (last.beatCount || 1) + (c.beatCount || 1);
      } else {
        finalChords.push({ ...c });
      }
    }
  }

  // 3. Ensure seamless duration tiling (clamp duration strictly to nextTime - time)
  for (let i = 0; i < finalChords.length; i++) {
    const nextTime = i < finalChords.length - 1 ? finalChords[i + 1].time : totalDuration;
    finalChords[i].duration = Math.max(0.01, nextTime - finalChords[i].time);
  }
  // Only snap to 0.0s if opening chord started within 0.5s of audio start, preserving leading silence
  if (finalChords.length > 0 && finalChords[0].time < 0.5) {
    finalChords[0].time = 0;
    if (finalChords.length > 1) {
      finalChords[0].duration = Math.max(0.01, finalChords[1].time);
    } else {
      finalChords[0].duration = Math.max(0.01, totalDuration);
    }
  }

  return finalChords;
}

export function detectTimeSignature(beats, audioData, sampleRate) {
  // Always return consistent { numerator, denominator } object shape
  if (!beats || beats.length < 8) return { numerator: 4, denominator: 4 };
  
  const strengths = [];
  const windowSize = Math.floor(sampleRate * 0.04);
  
  for (const beat of beats) {
    const sampleIdx = Math.floor(beat * sampleRate);
    let energy = 0;
    const start = Math.max(0, sampleIdx - windowSize);
    const end = Math.min(audioData.length, sampleIdx + windowSize);
    for (let i = start; i < end; i++) {
      energy += audioData[i] * audioData[i];
    }
    strengths.push(Math.sqrt(energy / Math.max(1, end - start)));
  }
  
  const maxStrength = Math.max(...strengths);
  if (maxStrength < 1e-8) return { numerator: 4, denominator: 4 };
  const normalized = strengths.map(s => s / maxStrength);
  
  // Phase-invariant meter evaluation across 3/4, 4/4, and 6/8
  const evalMeter = (meter) => {
    let maxScore = -Infinity;
    for (let phase = 0; phase < meter; phase++) {
      let score = 0;
      for (let i = 0; i < normalized.length; i++) {
        const beatInBar = (i + phase) % meter;
        if (beatInBar === 0) {
          score += normalized[i]; // Primary downbeat
        } else if (meter === 4 && beatInBar === 2) {
          score += normalized[i] * 0.35; // Secondary pulse
        } else if (meter === 6 && beatInBar === 3) {
          score += normalized[i] * 0.45; // Compound duple secondary pulse
        } else {
          score -= normalized[i] * 0.2;
        }
      }
      maxScore = Math.max(maxScore, score / normalized.length);
    }
    return maxScore;
  };

  const score3 = evalMeter(3);
  const score4 = evalMeter(4);
  const score6 = evalMeter(6);

  if (score6 > score4 * 1.05 && score6 > score3 * 1.05) return { numerator: 6, denominator: 8 };
  if (score3 > score4 * 1.05) return { numerator: 3, denominator: 4 };
  return { numerator: 4, denominator: 4 };
}

export function detectSections(chords, beats, totalDuration) {
  if (!chords || chords.length < 4) return [];
  
  const phraseLength = 4;
  const phrases = [];
  
  for (let i = 0; i < chords.length; i += phraseLength) {
    const phraseChords = chords.slice(i, i + phraseLength).map(c => c.chord);
    const key = phraseChords.join('-');
    phrases.push({
      startTime: chords[i].time,
      endTime: i + phraseLength < chords.length
        ? chords[i + phraseLength].time
        : totalDuration,
      pattern: key,
      chords: phraseChords
    });
  }
  
  const patternLabels = {};
  let labelIdx = 0;
  
  const sections = [];
  let currentSection = null;
  
  for (const phrase of phrases) {
    if (!patternLabels[phrase.pattern]) {
      patternLabels[phrase.pattern] = labelIdx < 26
        ? String.fromCharCode(65 + labelIdx)
        : String.fromCharCode(65 + (labelIdx % 26)) + Math.floor(labelIdx / 26);
      labelIdx++;
    }
    
    const label = patternLabels[phrase.pattern];
    
    if (!currentSection || currentSection.label !== label) {
      if (currentSection) {
        currentSection.endTime = phrase.startTime;
        sections.push(currentSection);
      }
      currentSection = {
        label,
        startTime: phrase.startTime,
        endTime: phrase.endTime
      };
    } else {
      currentSection.endTime = phrase.endTime;
    }
  }
  
  if (currentSection) {
    currentSection.endTime = totalDuration;
    sections.push(currentSection);
  }
  
  return sections;
}

export function computeWaveformData(audioData, numBins) {
  const samplesPerBin = Math.floor(audioData.length / numBins);
  const waveform = new Float32Array(numBins);
  
  for (let i = 0; i < numBins; i++) {
    const start = i * samplesPerBin;
    const end = Math.min(start + samplesPerBin, audioData.length);
    let maxAmp = 0;
    for (let s = start; s < end; s++) {
      const abs = Math.abs(audioData[s]);
      if (abs > maxAmp) maxAmp = abs;
    }
    waveform[i] = maxAmp;
  }
  
  return waveform;
}
