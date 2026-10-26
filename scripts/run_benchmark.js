const fs = require('fs');
const path = require('path');
const { MPEGDecoder } = require('mpg123-decoder');
const { EssentiaWASM, Essentia } = require('essentia.js');

const essentia = new Essentia(EssentiaWASM);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORD_TEMPLATES = {
  '':      [1.0, 0, 0, -0.35, 0.75, 0, 0, 0.85, 0, 0, 0, 0],      // Major triad
  'm':     [1.0, 0, 0, 0.75, -0.35, 0, 0, 0.85, 0, 0, 0, 0],      // Minor triad
  '7':     [1.0, 0, 0, -0.35, 0.7, 0, 0, 0.8, 0, 0, 0.55, 0],      // Dominant 7th
  'm7':    [1.0, 0, 0, 0.7, -0.35, 0, 0, 0.8, 0, 0, 0.55, 0],      // Minor 7th
  'maj7':  [1.0, 0, 0, -0.35, 0.7, 0, 0, 0.8, 0, 0, 0, 0.55],      // Major 7th
  'sus4':  [1.0, 0, 0, 0, 0, 0.65, 0, 0.85, 0, 0, 0, 0],           // Suspended 4th
  'sus2':  [1.0, 0, 0.65, 0, 0, 0, 0, 0.85, 0, 0, 0, 0],           // Suspended 2nd
  'dim':   [1.0, 0, 0, 0.7, -0.35, 0, 0, 0.7, 0, 0, 0, 0, 0],      // Diminished
};

const CHORD_TYPES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', 'dim'];

const TYPE_BIAS = {
  '': 0.04,
  'm': 0.04,
  '7': 0.01,
  'm7': 0.01,
  'maj7': 0.0,
  'sus4': -0.01,
  'sus2': -0.01,
  'dim': -0.02,
};

const ALL_CHORD_LABELS = [];
for (let root = 0; root < 12; root++) {
  for (const type of CHORD_TYPES) {
    ALL_CHORD_LABELS.push(NOTE_NAMES[root] + type);
  }
}
const NUM_STATES = ALL_CHORD_LABELS.length;

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
    const bassBonus = (bassVector && bassVector[root] > 0.35) ? bassVector[root] * 0.18 : 0;
    
    for (const type of CHORD_TYPES) {
      const chordLabel = NOTE_NAMES[root] + type;
      const template = CHORD_TEMPLATES[type];
      let score = scoreChordMatch(rotated, template);
      score += (TYPE_BIAS[type] || 0);
      score += rotated[0] * 0.15; // Root note salience
      if (template[7] > 0) score += rotated[7] * 0.06; // Fifth note salience
      score += bassBonus;
      
      if (diatonicChords && diatonicChords.has(chordLabel)) {
        score += 0.08;
      }
      
      scores[idx] = Math.max(0.001, score);
      idx++;
    }
  }
  
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
  const coreDegrees = [
    { semitones: 0, types: ['', 'm', '7', 'sus4', 'sus2'] },      // I / i (Tonic)
    { semitones: 5, types: ['', 'm', '7', 'sus4'] },               // IV / iv (Subdominant)
    { semitones: 7, types: ['', 'm', '7', 'sus4'] },               // V / v (Dominant)
    { semitones: 10, types: ['', 'm', '7'] },                      // bVII (Modal / Mixolydian / Rock)
    { semitones: 8, types: ['', 'm'] },                            // bVI (Aeolian / Folk / Rock)
    { semitones: 3, types: ['', 'm'] },                            // bIII (Pentatonic / Blues / Folk)
    { semitones: 2, types: ['m', ''] },                            // ii / II
    { semitones: 9, types: ['m', ''] },                            // vi / VI
    { semitones: 4, types: ['m'] },                                // iii
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

  const SELF_PROB = 0.38;
  const familyCount = Math.max(1, diatonicChords.size);
  const DIATONIC_PROB = 0.58 / familyCount;
  const chromaticCount = Math.max(1, NUM_STATES - familyCount);
  const CHROMATIC_PROB = 0.04 / chromaticCount;

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
  const EMISSION_WEIGHT = 2.0;
  
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

async function analyzeAudio(audioData, sampleRate = 44100) {
  const totalDuration = audioData.length / sampleRate;
  const audioVector = essentia.arrayToVector(audioData);

  try {
    const rhythm = essentia.RhythmExtractor2013(audioVector, 220, 'multifeature', 45);
    const ticks = rhythm.ticks;
    let bpm = Math.round(rhythm.bpm);

    let rawBeats = [];
    for (let i = 0; i < ticks.size(); i++) rawBeats.push(ticks.get(i));
    if (ticks) ticks.delete();
    rawBeats.sort((a, b) => a - b);

    const minGap = 0.15;
    const deduplicatedBeats = [];
    for (let i = 0; i < rawBeats.length; i++) {
      if (deduplicatedBeats.length === 0 || (rawBeats[i] - deduplicatedBeats[deduplicatedBeats.length - 1]) >= minGap) {
        deduplicatedBeats.push(rawBeats[i]);
      }
    }
    rawBeats = deduplicatedBeats;

    if (rawBeats.length < 4) {
      const fallbackBpm = (bpm >= 45 && bpm <= 220) ? bpm : 120;
      bpm = fallbackBpm;
      const interval = 60 / fallbackBpm;
      rawBeats = [];
      for (let t = 0; t < totalDuration; t += interval) rawBeats.push(t);
    }

    const keyResult = essentia.KeyExtractor(audioVector, true, 4096, 2048, 12, 5000, 100, 25, 0.2, 'bgate', sampleRate);
    const key = keyResult.key;
    const scale = keyResult.scale;

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
      const peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.0001, 5000, 100, 40, 'frequency', sampleRate);

      const whitened = essentia.SpectralWhitening(
        spectrum.spectrum,
        peaks.frequencies,
        peaks.magnitudes,
        Math.min(5000, sampleRate / 2),
        sampleRate
      );

      const hpcpResult = essentia.HPCP(
        peaks.frequencies,
        whitened.magnitudes,
        true,   // bandPreset: true
        500,
        4,
        3500,
        false,
        40,
        false,
        'unitMax',
        440,
        sampleRate,
        12
      );

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
      for (let h = 0; h < hpcpSize; h++) folded[h % 12] += hpcpResult.hpcp.get(h);
      const rotated = [...folded.slice(3), ...folded.slice(0, 3)];
      hpcpFrames.push(rotated);

      const bassFolded = new Array(12).fill(0);
      const bassSize = bassHPCP.hpcp.size();
      for (let h = 0; h < bassSize; h++) bassFolded[h % 12] += bassHPCP.hpcp.get(h);
      const bassRotated = [...bassFolded.slice(3), ...bassFolded.slice(0, 3)];
      bassFrames.push(normalizeHPCP(bassRotated));

      frameTimestamps.push((start + frameSize * 0.5) / sampleRate);

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
    }

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
        beatHPCPs.push([...beatHPCPs[beatHPCPs.length - 1]]);
        beatBassHPCPs.push([...beatBassHPCPs[beatBassHPCPs.length - 1]]);
      } else {
        beatHPCPs.push(normH);
        beatBassHPCPs.push(normalizeHPCP(medianBass));
      }
    }

    let keyRoot = key;
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    keyRoot = flatToSharp[keyRoot] || keyRoot;

    const { matrix: transMatrix, diatonicChords } = buildTransitionMatrix(keyRoot, scale);
    const emissions = beatHPCPs.map((hpcp, i) => computeEmissionScores(hpcp, beatBassHPCPs[i], diatonicChords));
    const path = viterbiDecode(emissions, transMatrix);

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

    const chords = [];
    let currentChord = null;
    for (let b = 0; b < smoothedPath.length; b++) {
      const label = ALL_CHORD_LABELS[smoothedPath[b]];
      const beatTime = rawBeats[b];
      if (!currentChord || currentChord.chord !== label) {
        if (currentChord) {
          currentChord.duration = Math.max(0.1, beatTime - currentChord.time);
          chords.push(currentChord);
        }
        currentChord = { chord: label, time: beatTime, beatCount: 1 };
      } else {
        currentChord.beatCount++;
      }
    }
    if (currentChord) {
      currentChord.duration = Math.max(0.1, totalDuration - currentChord.time);
      chords.push(currentChord);
    }
    if (chords.length > 0) chords[0].time = 0;

    return { key: `${key} ${scale}`, bpm, totalDuration, chords, totalBeats: rawBeats.length };

  } finally {
    audioVector.delete();
  }
}

async function runBenchmark() {
  const songs = [
    { file: '01_Sammi_Meri_Waar.mp3', title: 'Sammi Meri Waar', expectedKey: 'C#', expectedChords: ['C#', 'F#', 'B', 'A', 'E', 'G#'] },
    { file: '02_Ed_Sheeran_Perfect.mp3', title: 'Ed Sheeran - Perfect', expectedKey: 'Ab', expectedChords: ['G#', 'Fm', 'C#', 'D#'] },
    { file: '03_House_Of_The_Rising_Sun.mp3', title: 'House of the Rising Sun', expectedKey: 'A', expectedChords: ['Am', 'C', 'D', 'F', 'E'] },
    { file: '04_Sweet_Child_O_Mine.mp3', title: "Sweet Child O Mine", expectedKey: 'C#', expectedChords: ['C#', 'B', 'F#', 'G#'] },
    { file: '05_Take_Me_Home_Country_Roads.mp3', title: 'Take Me Home Country Roads', expectedKey: 'A', expectedChords: ['A', 'F#m', 'E', 'D'] },
    { file: '06_Pumped_Up_Kicks.mp3', title: 'Pumped Up Kicks', expectedKey: 'F', expectedChords: ['Fm', 'G#', 'D#', 'A#'] },
    { file: '07_Careless_Whisper.mp3', title: 'Careless Whisper', expectedKey: 'D', expectedChords: ['Dm', 'Gm', 'A#', 'A'] },
    { file: '08_Believer.mp3', title: 'Believer', expectedKey: 'A#', expectedChords: ['A#m', 'F#', 'F'] },
    { file: '09_Somebody_That_I_Used_To_Know.mp3', title: 'Somebody That I Used To Know', expectedKey: 'D', expectedChords: ['Dm', 'C', 'A#'] },
    { file: '10_Stressed_Out.mp3', title: 'Stressed Out', expectedKey: 'A', expectedChords: ['F', 'Dm', 'Am', 'C', 'G'] }
  ];

  console.log('='.repeat(80));
  console.log('CHORDAI 10-SONG BACKEND BENCHMARK & CALIBRATION RUNNER');
  console.log('='.repeat(80));

  const decoder = new MPEGDecoder();
  await decoder.ready;

  let totalSongsEvaluated = 0;
  let totalChordAccuracyScore = 0;

  for (const song of songs) {
    const fullPath = path.join(process.cwd(), 'test_songs', song.file);
    if (!fs.existsSync(fullPath)) {
      console.log(`[SKIP] ${song.file} not found`);
      continue;
    }

    const t0 = Date.now();
    const fileBuf = fs.readFileSync(fullPath);
    const { channelData, sampleRate } = decoder.decode(fileBuf);

    // Downmix to mono float32
    const len = channelData[0].length;
    const mono = new Float32Array(len);
    if (channelData.length > 1) {
      for (let i = 0; i < len; i++) mono[i] = (channelData[0][i] + channelData[1][i]) * 0.5;
    } else {
      mono.set(channelData[0]);
    }

    // Limit to first 120 seconds for fast comprehensive test if song is long
    const testSamples = Math.min(len, Math.floor(sampleRate * 180));
    const testMono = mono.subarray(0, testSamples);

    const result = await analyzeAudio(testMono, sampleRate);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const detectedChordNames = result.chords.map(c => c.chord);
    const uniqueChords = [...new Set(detectedChordNames)];

    // Evaluate match against expected song vocabulary
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    const normalizedExpected = song.expectedChords.map(c => {
      for (const [flat, sharp] of Object.entries(flatToSharp)) {
        if (c.startsWith(flat)) return sharp + c.slice(flat.length);
      }
      return c;
    });

    const matchingChords = uniqueChords.filter(c => normalizedExpected.includes(c));
    const vocabularyCoverage = ((matchingChords.length / Math.min(uniqueChords.length, normalizedExpected.length)) * 100).toFixed(1);

    totalSongsEvaluated++;
    totalChordAccuracyScore += parseFloat(vocabularyCoverage);

    console.log(`\n▶ [${song.file}] ${song.title}`);
    console.log(`  Duration: ${result.totalDuration.toFixed(1)}s (${result.totalBeats} beats) | Tempo: ${result.bpm} BPM | Detected Key: ${result.key}`);
    console.log(`  Top Chords Detected: ${uniqueChords.slice(0, 8).join(', ')}`);
    console.log(`  Expected Chords:     ${normalizedExpected.join(', ')}`);
    console.log(`  Chord Concordance:   ${vocabularyCoverage}% (${matchingChords.length}/${normalizedExpected.length} matched) [Processed in ${elapsed}s]`);
    console.log(`  Progression Sample:  ${detectedChordNames.slice(0, 10).join(' -> ')}`);
  }

  decoder.free();

  const avgAccuracy = (totalChordAccuracyScore / Math.max(1, totalSongsEvaluated)).toFixed(1);
  console.log('\n' + '='.repeat(80));
  console.log(`BENCHMARK COMPLETE: ${totalSongsEvaluated}/10 Songs Tested | Overall Accuracy: ${avgAccuracy}%`);
  console.log('='.repeat(80));
}

runBenchmark().catch(console.error);
