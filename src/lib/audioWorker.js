/**
 * Audio Analysis Web Worker
 * 
 * Musical Audio Analysis:
 * 1. Beat & Tempo Tracking via calibrated Essentia RhythmExtractor2013 (multi-feature onset tracking)
 * 2. Key Signature Detection via Essentia KeyExtractor (detuning-corrected profile correlation)
 * 3. Harmonic Profile & Bass-Assisted HPCP Computation at 44.1 kHz
 * 4. Perceptually-weighted chord estimation with Viterbi HMM and temporal smoothing
 * 5. Structural Section & Waveform Extraction
 */

import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';

let essentia = null;

async function initEssentia() {
  if (!essentia) {
    if (EssentiaWASM.EssentiaJS) {
      essentia = new Essentia(EssentiaWASM);
    } else {
      await new Promise((resolve) => {
        EssentiaWASM.onRuntimeInitialized = () => {
          resolve();
        };
      });
      essentia = new Essentia(EssentiaWASM);
    }
  }
}

// ─── Inline Chord Detection Engine ──────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Perceptually weighted chord templates (exact 12 pitch classes: C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
// Incorporates inhibitory 3rd weights (-0.35) to sharply disambiguate Major vs Minor triads
const CHORD_TEMPLATES = {
  '':      [1.0, 0, 0, -0.35, 0.75, 0, 0, 0.85, 0, 0, 0, 0],      // Major triad: 1, (no b3), 3, 5
  'm':     [1.0, 0, 0, 0.75, -0.35, 0, 0, 0.85, 0, 0, 0, 0],      // Minor triad: 1, b3, (no 3), 5
  '7':     [1.0, 0, 0, -0.35, 0.7, 0, 0, 0.8, 0, 0, 0.55, 0],      // Dominant 7th: 1, 3, 5, b7
  'm7':    [1.0, 0, 0, 0.7, -0.35, 0, 0, 0.8, 0, 0, 0.55, 0],      // Minor 7th: 1, b3, 5, b7
  'maj7':  [1.0, 0, 0, -0.35, 0.7, 0, 0, 0.8, 0, 0, 0, 0.55],      // Major 7th: 1, 3, 5, 7
  'sus4':  [1.0, 0, 0, -0.25, -0.25, 0.65, 0, 0.85, 0, 0, 0, 0],   // Suspended 4th (inhibits major/minor 3rd)
  'sus2':  [1.0, 0, 0.65, -0.25, -0.25, 0, 0, 0.85, 0, 0, 0, 0],   // Suspended 2nd (inhibits major/minor 3rd)
  'dim':   [1.0, 0, 0, 0.7, -0.35, 0, 0, 0.7, 0, 0, 0, 0, 0],      // Diminished triad: 1, b3, b5
};

const CHORD_TYPES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', 'dim'];

const TYPE_BIAS = {
  '': 0.06,      // Natural musical prior for major triads
  'm': 0.06,     // Natural musical prior for minor triads
  '7': -0.01,
  'm7': -0.01,
  'maj7': -0.02,
  'sus4': -0.08,  // Requires distinct sustained 4th evidence, avoids 1-beat flickers
  'sus2': -0.08,  // Requires distinct sustained 2nd evidence, avoids 1-beat flickers
  'dim': -0.04,
};

const ALL_CHORD_LABELS = [];
for (let root = 0; root < 12; root++) {
  for (const type of CHORD_TYPES) {
    ALL_CHORD_LABELS.push(NOTE_NAMES[root] + type);
  }
}
const NUM_STATES = ALL_CHORD_LABELS.length; // 96 states

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
  for (let i = 0; i < 12; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum);
}

function cosineSimilarity(hpcp, template) {
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += hpcp[i] * template[i];
  const normA = l2Norm(hpcp);
  const normB = l2Norm(template);
  if (normA < 1e-8 || normB < 1e-8) return 0;
  return dot / (normA * normB);
}

function scoreChordMatch(hpcp, template) {
  const similarity = Math.max(0, cosineSimilarity(hpcp, template));
  let nonChordEnergy = 0, chordEnergy = 0;
  for (let i = 0; i < 12; i++) {
    if (template[i] > 0) chordEnergy += hpcp[i];
    else nonChordEnergy += hpcp[i];
  }
  const totalEnergy = chordEnergy + nonChordEnergy;
  const chordRatio = totalEnergy > 1e-8 ? chordEnergy / totalEnergy : 0;
  return similarity * 0.65 + chordRatio * 0.35;
}

function computeChordConfidence(hpcpVector, stateIdx, bassVector = null) {
  if (stateIdx < 0 || stateIdx >= NUM_STATES) return 0.5;
  const hpcp = normalizeHPCP(hpcpVector);
  const totalEnergy = hpcp.reduce((a, b) => a + b, 0);
  if (totalEnergy < 0.02) return 0.5;

  const root = Math.floor(stateIdx / CHORD_TYPES.length);
  const typeIdx = stateIdx % CHORD_TYPES.length;
  const template = CHORD_TEMPLATES[CHORD_TYPES[typeIdx]];
  const rotated = rotateArray(hpcp, root);

  const similarity = Math.max(0, cosineSimilarity(rotated, template));
  let chordEnergy = 0;
  let nonChordEnergy = 0;
  for (let i = 0; i < 12; i++) {
    if (template[i] > 0) chordEnergy += rotated[i];
    else nonChordEnergy += rotated[i];
  }
  const chordRatio = (chordEnergy + nonChordEnergy > 1e-8) ? chordEnergy / (chordEnergy + nonChordEnergy) : 0;

  // Harmonic template match calibrated for real-world instrument harmonics
  let match = similarity * 0.65 + chordRatio * 0.35;
  if (rotated[0] > 0.5) match += 0.04;
  if (bassVector && bassVector[root] > 0.4) match += 0.04;

  return Math.max(0.1, Math.min(0.98, match));
}

function computeEmissionScores(hpcpVector, bassVector = null, diatonicChords = null) {
  const hpcp = normalizeHPCP(hpcpVector);
  const scores = new Float64Array(NUM_STATES);
  
  const totalEnergy = hpcp.reduce((a, b) => a + b, 0);
  if (totalEnergy < 0.02) { 
    scores.fill(1.0 / NUM_STATES);
    return scores;
  }
  
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
      if (template[7] > 0) score += rotated[7] * 0.06; // Fifth note salience
      score += bassBonus;
      
      // Harmonic family bonus: if chord belongs to the song's key family, boost it
      if (diatonicChords && diatonicChords.has(chordLabel)) {
        score += 0.10;
      }
      
      scores[idx] = Math.max(0.001, score);
      idx++;
    }
  }
  
  // Softmax with calibrated temperature for stable probability distribution
  const TEMPERATURE = 0.12;
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

function getHarmonicFamily(keyRoot, keyScale) {
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

function buildTransitionMatrix(keyRoot, keyScale) {
  let root = keyRoot;
  const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  root = flatToSharp[root] || root;

  const diatonicChords = getHarmonicFamily(root, keyScale);
  const matrix = new Float64Array(NUM_STATES * NUM_STATES);

  // Musical self-transition prior (0.85 = stay on current chord with realistic temporal inertia)
  const SELF_PROB = 0.85;
  const familyCount = Math.max(1, diatonicChords.size);
  const DIATONIC_PROB = 0.13 / familyCount;
  const chromaticCount = Math.max(1, NUM_STATES - familyCount);
  const CHROMATIC_PROB = 0.02 / chromaticCount;

  for (let from = 0; from < NUM_STATES; from++) {
    let rowSum = 0;
    for (let to = 0; to < NUM_STATES; to++) {
      let prob;
      if (from === to) prob = SELF_PROB;
      else if (diatonicChords.has(ALL_CHORD_LABELS[to])) prob = DIATONIC_PROB;
      else prob = CHROMATIC_PROB;
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

function viterbiDecode(emissionScores, transMatrix) {
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

// ─── Musical Chord Consolidation & Flicker Absorption ──────────────────

function consolidateChords(rawChordsList, totalDuration, minDurationSec = 0.8) {
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

  // 2. Absorb micro-flickers < minDurationSec into adjacent neighbor
  if (merged.length > 1) {
    let clean = [];
    for (let i = 0; i < merged.length; i++) {
      const cur = merged[i];
      if (cur.duration < minDurationSec && clean.length > 0) {
        const prev = clean[clean.length - 1];
        prev.duration += cur.duration;
        prev.beatCount = (prev.beatCount || 1) + (cur.beatCount || 1);
      } else if (cur.duration < minDurationSec && i < merged.length - 1) {
        const next = merged[i + 1];
        next.time = cur.time;
        next.duration += cur.duration;
        next.beatCount = (next.beatCount || 1) + (cur.beatCount || 1);
      } else {
        clean.push(cur);
      }
    }
    merged = clean;
  }

  // 3. Re-merge any newly adjacent identical chords
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

  // 4. Ensure seamless duration tiling and start at 0.0s
  for (let i = 0; i < finalChords.length; i++) {
    const nextTime = i < finalChords.length - 1 ? finalChords[i + 1].time : totalDuration;
    finalChords[i].duration = Math.max(minDurationSec, nextTime - finalChords[i].time);
  }
  if (finalChords.length > 0) {
    finalChords[0].time = 0;
    if (finalChords.length > 1) {
      finalChords[0].duration = finalChords[1].time;
    } else {
      finalChords[0].duration = totalDuration;
    }
  }

  return finalChords;
}

// ─── Time Signature Detection ──────────────────────────────────────────

function detectTimeSignature(beats, audioData, sampleRate) {
  if (!beats || beats.length < 8) return 4;
  
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
  if (maxStrength < 1e-8) return 4;
  const normalized = strengths.map(s => s / maxStrength);
  
  let score4 = 0, score3 = 0;
  for (let i = 0; i < normalized.length; i++) {
    const pos3 = i % 3;
    const pos4 = i % 4;
    
    if (pos3 === 0) score3 += normalized[i];
    else score3 -= normalized[i] * 0.3;
    
    if (pos4 === 0) score4 += normalized[i];
    else if (pos4 === 2) score4 += normalized[i] * 0.4;
    else score4 -= normalized[i] * 0.2;
  }
  
  score3 /= normalized.length;
  score4 /= normalized.length;
  
  return score3 > score4 * 1.35 ? 3 : 4;
}

// ─── Section Detection ─────────────────────────────────────────────────

function detectSections(chords, beats, totalDuration) {
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
  const labelNames = ['A', 'B', 'C', 'D', 'E', 'F'];
  let labelIdx = 0;
  
  const sections = [];
  let currentSection = null;
  
  for (const phrase of phrases) {
    if (!patternLabels[phrase.pattern]) {
      patternLabels[phrase.pattern] = labelNames[Math.min(labelIdx, labelNames.length - 1)];
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

// ─── Waveform Data ─────────────────────────────────────────────────────

function computeWaveformData(audioData, numBins) {
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

// ─── Main Worker Handler ────────────────────────────────────────────────

self.onmessage = async (e) => {
  if (e.data.type === 'ANALYZE_AUDIO') {
    try {
      const audioData = e.data.audioData; // Float32Array
      const sampleRate = e.data.sampleRate || 44100;
      const totalDuration = audioData.length / sampleRate;

      await initEssentia();

      self.postMessage({ type: 'PROGRESS', stage: 'Detecting beats & tempo...', progress: 0.1 });

      let audioVector = null;
      try {
        audioVector = essentia.arrayToVector(audioData);

        // ── 1. Beat & Tempo Tracking (Calibrated Essentia RhythmExtractor2013) ──
        // Support up to 220 BPM for fast-beat / high-tempo genres
        const rhythm = essentia.RhythmExtractor2013(audioVector, 220, 'multifeature', 45);
        const ticks = rhythm.ticks;
        let bpm = Math.round(rhythm.bpm);

        let rawBeats = [];
        for (let i = 0; i < ticks.size(); i++) {
          rawBeats.push(ticks.get(i));
        }
        if (ticks) ticks.delete();

        // Sanitize beats without truncation:
        rawBeats.sort((a, b) => a - b);
        
        // Remove duplicate / impossibly tight false-triggers (< 0.25s gap, max 240 BPM)
        const minGap = 0.25;
        const deduplicatedBeats = [];
        for (let i = 0; i < rawBeats.length; i++) {
          if (deduplicatedBeats.length === 0 || (rawBeats[i] - deduplicatedBeats[deduplicatedBeats.length - 1]) >= minGap) {
            deduplicatedBeats.push(rawBeats[i]);
          }
        }
        rawBeats = deduplicatedBeats;

        // Compute median interval for robust BPM validation
        if (rawBeats.length > 3) {
          const intervals = [];
          for (let i = 1; i < rawBeats.length; i++) {
            const diff = rawBeats[i] - rawBeats[i - 1];
            if (diff >= 0.2 && diff <= 1.8) intervals.push(diff);
          }
          if (intervals.length > 0) {
            intervals.sort((a, b) => a - b);
            const medianInterval = intervals[Math.floor(intervals.length / 2)];
            const calculatedBpm = Math.round(60 / medianInterval);
            if (bpm <= 0 || Math.abs(bpm - calculatedBpm) > 25) {
              bpm = calculatedBpm;
            }
          }
        }

        // Fallback grid if audio has sparse beats (e.g. ambient/classical intro)
        if (rawBeats.length < 4) {
          const fallbackBpm = (bpm >= 45 && bpm <= 220) ? bpm : 120;
          bpm = fallbackBpm;
          const interval = 60 / fallbackBpm;
          rawBeats = [];
          for (let t = 0; t < totalDuration; t += interval) {
            rawBeats.push(t);
          }
        }

        self.postMessage({ type: 'PROGRESS', stage: 'Analyzing musical key...', progress: 0.2 });

        // ── 2. Key Detection (with sampleRate) ──
        const keyResult = essentia.KeyExtractor(
          audioVector,
          true,   // averageDetuningCorrection
          4096,   // frameSize
          2048,   // hopSize
          12,     // hpcpSize
          5000,   // maxFrequency
          100,    // maximumSpectralPeaks
          25,     // minFrequency
          0.2,    // pcpThreshold
          'bgate',// profileType
          sampleRate // 44100
        );
        const key = keyResult.key;
        const scale = keyResult.scale;
        const keyStrength = keyResult.strength;
        const detectedKey = `${key} ${scale}`;

        // ── 3. Time Signature Detection ──
        const timeSignature = detectTimeSignature(rawBeats, audioData, sampleRate);

        self.postMessage({ type: 'PROGRESS', stage: 'Extracting harmonic profiles...', progress: 0.3 });

        // ── 4. HPCP Frames & Bass Profiles ──
        const frameSize = 4096;
        const hopSize = 2048;
        const audioLen = audioData.length;

        const hpcpFrames = [];
        const bassFrames = [];
        const frameTimestamps = [];

        for (let start = 0; start + frameSize <= audioLen; start += hopSize) {
          const segmentData = audioData.subarray(start, start + frameSize);
          const frame = essentia.arrayToVector(segmentData);

          const windowed = essentia.Windowing(frame, false, frameSize);
          const spectrum = essentia.Spectrum(windowed.frame, frameSize);
          
          // Full-spectrum peaks (40 Hz - 5000 Hz)
          const peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.0001, 5000, 100, 40, 'frequency', sampleRate);

          const whitened = essentia.SpectralWhitening(
            spectrum.spectrum,
            peaks.frequencies,
            peaks.magnitudes,
            Math.min(5000, sampleRate / 2),
            sampleRate
          );

          // Standard HPCP with 4-octave band preset (40 Hz - 3500 Hz)
          // Focuses on musical fundamentals and first 4 harmonics, rejecting high-frequency cymbal sibilance
          const hpcpResult = essentia.HPCP(
            peaks.frequencies,
            whitened.magnitudes,
            true,   // bandPreset: true
            500,    // bandSplitFrequency
            4,      // harmonics: 4
            3500,   // maxFrequency: 3500 Hz
            false,  // maxShifted
            40,     // minFrequency
            false,  // nonLinear
            'unitMax', // normalized
            440,    // referenceFrequency
            sampleRate, // sampleRate
            12      // size = 12 bins
          );

          // Bass-band HPCP (30 Hz - 280 Hz) for robust root pitch-class identification
          const bassPeaks = essentia.SpectralPeaks(spectrum.spectrum, 0.0001, 280, 40, 30, 'frequency', sampleRate);
          const bassHPCP = essentia.HPCP(
            bassPeaks.frequencies,
            bassPeaks.magnitudes,
            false,
            280,
            4,
            280,
            false,
            30,
            false,
            'unitMax',
            440,
            sampleRate,
            12
          );

          const hpcpSize = hpcpResult.hpcp.size();
          const folded = new Array(12).fill(0);
          for (let h = 0; h < hpcpSize; h++) {
            folded[h % 12] += hpcpResult.hpcp.get(h);
          }
          // Essentia HPCP bin 0 is 'A'. Rotate left by 3 to make bin 0 = 'C'
          const rotated = [...folded.slice(3), ...folded.slice(0, 3)];
          hpcpFrames.push(rotated);

          const bassFolded = new Array(12).fill(0);
          const bassSize = bassHPCP.hpcp.size();
          for (let h = 0; h < bassSize; h++) {
            bassFolded[h % 12] += bassHPCP.hpcp.get(h);
          }
          const bassRotated = [...bassFolded.slice(3), ...bassFolded.slice(0, 3)];
          bassFrames.push(normalizeHPCP(bassRotated));

          frameTimestamps.push((start + frameSize * 0.5) / sampleRate);

          // Cleanup WASM objects
          frame.delete();
          windowed.frame.delete();
          spectrum.spectrum.delete();
          peaks.frequencies.delete();
          peaks.magnitudes.delete();
          whitened.magnitudes.delete();
          hpcpResult.hpcp.delete();
          bassPeaks.frequencies.delete();
          bassPeaks.magnitudes.delete();
          bassHPCP.hpcp.delete();

          if (start % (hopSize * 30) === 0) {
            const hpcpProgress = 0.3 + (start / audioLen) * 0.45;
            self.postMessage({ type: 'PROGRESS', stage: 'Computing harmonic profile...', progress: hpcpProgress });
          }
        }

        self.postMessage({ type: 'PROGRESS', stage: 'Decoding chord sequence...', progress: 0.8 });

        // ── 5. Beat-synchronous Chord Decoding with Viterbi & Smoothing ──
        let chords = [];
        if (rawBeats.length > 0 && hpcpFrames.length > 0) {
          const beatHPCPs = [];
          const beatBassHPCPs = [];

          for (let b = 0; b < rawBeats.length; b++) {
            const beatStart = rawBeats[b];
            const beatEnd = b < rawBeats.length - 1 ? rawBeats[b + 1] : totalDuration;
            
            const segFrames = [];
            const segBass = [];
            for (let f = 0; f < frameTimestamps.length; f++) {
              if (frameTimestamps[f] >= beatStart && frameTimestamps[f] < beatEnd) {
                segFrames.push(hpcpFrames[f]);
                segBass.push(bassFrames[f]);
              }
            }
            
            if (segFrames.length === 0) {
              if (beatHPCPs.length > 0) {
                beatHPCPs.push([...beatHPCPs[beatHPCPs.length - 1]]);
                beatBassHPCPs.push([...beatBassHPCPs[beatBassHPCPs.length - 1]]);
              } else {
                beatHPCPs.push(new Array(12).fill(0));
                beatBassHPCPs.push(new Array(12).fill(0));
              }
              continue;
            }
            
            // Interbeat median aggregation: filters out transient drum spikes and vocal vibrato
            const medianHPCP = new Array(12).fill(0);
            const medianBass = new Array(12).fill(0);
            for (let h = 0; h < 12; h++) {
              const vals = segFrames.map(f => f[h]).sort((a, b) => a - b);
              const bassVals = segBass.map(f => f[h]).sort((a, b) => a - b);
              const mid = Math.floor(vals.length / 2);
              medianHPCP[h] = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) * 0.5;
              medianBass[h] = bassVals.length % 2 !== 0 ? bassVals[mid] : (bassVals[mid - 1] + bassVals[mid]) * 0.5;
            }

            const normH = normalizeHPCP(medianHPCP);
            const energy = normH.reduce((a, b) => a + b, 0);
            if (energy < 0.03 && beatHPCPs.length > 0) {
              // Musical chords sustain across quiet vocal pauses or quiet beats
              beatHPCPs.push([...beatHPCPs[beatHPCPs.length - 1]]);
              beatBassHPCPs.push([...beatBassHPCPs[beatBassHPCPs.length - 1]]);
            } else {
              beatHPCPs.push(normH);
              beatBassHPCPs.push(normalizeHPCP(medianBass));
            }
          }

          // Key-aware transition matrix & diatonic harmonic set
          let keyRoot = key;
          const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
          keyRoot = flatToSharp[keyRoot] || keyRoot;

          const { matrix: transMatrix, diatonicChords } = buildTransitionMatrix(keyRoot, scale);

          // Compute emission probabilities per beat with diatonic key guidance
          const emissions = beatHPCPs.map((hpcp, i) => computeEmissionScores(hpcp, beatBassHPCPs[i], diatonicChords));
          const path = viterbiDecode(emissions, transMatrix);

          // Post-processing: Consolidate transient 1-beat chord flickers
          const smoothedPath = [...path];
          for (let b = 1; b < path.length - 1; b++) {
            if (smoothedPath[b - 1] === smoothedPath[b + 1] && smoothedPath[b] !== smoothedPath[b - 1]) {
              const neighborScore = emissions[b][smoothedPath[b - 1]];
              const currentScore = emissions[b][smoothedPath[b]];
              if (currentScore < neighborScore * 1.35) {
                smoothedPath[b] = smoothedPath[b - 1];
              }
            }
          }

          // Convert to chord events with true harmonic template match confidence
          const rawChords = [];
          for (let b = 0; b < smoothedPath.length; b++) {
            const stateIdx = smoothedPath[b];
            const chordLabel = ALL_CHORD_LABELS[stateIdx];
            const confidence = computeChordConfidence(beatHPCPs[b], stateIdx, beatBassHPCPs[b]);
            const nextBeatTime = b < smoothedPath.length - 1 ? rawBeats[b + 1] : totalDuration;
            rawChords.push({
              time: rawBeats[b],
              chord: chordLabel,
              confidence: confidence,
              duration: Math.max(0.1, nextBeatTime - rawBeats[b]),
              beatCount: 1
            });
          }

          // Consolidate chords: merge consecutive identical chords and absorb micro-flickers (< 0.8s)
          chords = consolidateChords(rawChords, totalDuration, 0.8);
        }

        self.postMessage({ type: 'PROGRESS', stage: 'Structuring song sections...', progress: 0.92 });

        // ── 6. Section Detection ──
        const sections = detectSections(chords, rawBeats, totalDuration);

        // ── 7. Waveform Data for Visualization ──
        const waveformBins = Math.min(2000, Math.ceil(totalDuration * 25));
        const waveform = computeWaveformData(audioData, waveformBins);

        // ── 8. Beat Strengths for Metronome Visualizer ──
        const beatStrengths = [];
        const windowSamples = Math.floor(sampleRate * 0.035);
        for (const beat of rawBeats) {
          const idx = Math.floor(beat * sampleRate);
          let energy = 0;
          const s = Math.max(0, idx - windowSamples);
          const en = Math.min(audioData.length, idx + windowSamples);
          for (let i = s; i < en; i++) energy += audioData[i] * audioData[i];
          beatStrengths.push(Math.sqrt(energy / Math.max(1, en - s)));
        }
        const maxBeatStrength = Math.max(...beatStrengths, 0.001);
        for (let i = 0; i < beatStrengths.length; i++) {
          beatStrengths[i] /= maxBeatStrength;
        }

        self.postMessage({ type: 'PROGRESS', stage: 'Complete!', progress: 1.0 });

        // ── Return Results ──
        self.postMessage({
          type: 'ANALYSIS_COMPLETE',
          key: detectedKey,
          keyStrength: keyStrength,
          chords: chords,
          beats: rawBeats,
          beatStrengths: beatStrengths,
          bpm: bpm,
          timeSignature: timeSignature,
          totalDuration: totalDuration,
          sections: sections,
          waveform: Array.from(waveform),
        });
      } finally {
        if (audioVector) audioVector.delete();
      }

    } catch (error) {
      self.postMessage({ type: 'ERROR', error: String(error.message || error) });
    }
  }
};
