import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { MPEGDecoder } from 'mpg123-decoder';

const require = createRequire(import.meta.url);
const { EssentiaWASM, Essentia } = require('essentia.js');
const essentia = new Essentia(EssentiaWASM);

// Production DSP algorithms directly from workerDSP.js
import {
  ALL_CHORD_LABELS,
  NOTE_NAMES,
  normalizeHPCP,
  computeChordConfidence,
  computeEmissionScores,
  buildTransitionMatrix,
  viterbiDecode,
  smoothExcursions,
  consolidateChords
} from '../src/lib/workerDSP.js';

import { BENCHMARK_SONGS } from '../src/lib/benchmarkSongs.js';

const FLAT_TO_SHARP = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
function normalizeChord(chord) {
  if (!chord) return '';
  for (const [flat, sharp] of Object.entries(FLAT_TO_SHARP)) {
    if (chord.startsWith(flat)) return sharp + chord.slice(flat.length);
  }
  return chord;
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
        true,
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
    }

    const numBeats = rawBeats.length;
    const beatHPCPs = [];
    const beatBassHPCPs = [];

    let frameIdx = 0;
    const numFrames = hpcpFrames.length;

    for (let b = 0; b < numBeats; b++) {
      const beatStart = rawBeats[b];
      const beatEnd = b < numBeats - 1 ? rawBeats[b + 1] : totalDuration;

      const sumHPCP = new Array(12).fill(0);
      const sumBass = new Array(12).fill(0);
      let count = 0;

      while (frameIdx < numFrames && frameTimestamps[frameIdx] < beatStart) {
        frameIdx++;
      }

      let scanIdx = frameIdx;
      while (scanIdx < numFrames && frameTimestamps[scanIdx] < beatEnd) {
        for (let i = 0; i < 12; i++) {
          sumHPCP[i] += hpcpFrames[scanIdx][i];
          sumBass[i] += bassFrames[scanIdx][i];
        }
        count++;
        scanIdx++;
      }

      if (count > 0) {
        beatHPCPs.push(sumHPCP.map(v => v / count));
        beatBassHPCPs.push(sumBass.map(v => v / count));
      } else if (frameIdx < numFrames) {
        beatHPCPs.push([...hpcpFrames[frameIdx]]);
        beatBassHPCPs.push([...bassFrames[frameIdx]]);
      } else {
        beatHPCPs.push(new Array(12).fill(0));
        beatBassHPCPs.push(new Array(12).fill(0));
      }
    }

    let keyRoot = FLAT_TO_SHARP[key] || key;
    const { matrix: transMatrix, diatonicChords } = buildTransitionMatrix(keyRoot, scale);
    const emissions = beatHPCPs.map((hpcp, i) => computeEmissionScores(hpcp, beatBassHPCPs[i], diatonicChords));
    const path = viterbiDecode(emissions, transMatrix);

    // Production excursion smoothing
    const smoothedPath = smoothExcursions(path, emissions, rawBeats, totalDuration);

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

    // Production chord consolidation
    const chords = consolidateChords(rawChords, totalDuration, 0.8);

    return { keyRoot: key, scale, key: `${key} ${scale}`, bpm, totalDuration, chords, totalBeats: rawBeats.length };

  } finally {
    audioVector.delete();
  }
}

async function runBenchmark() {
  console.log('='.repeat(80));
  console.log('CADENCE PRODUCTION DSP BENCHMARK & ACCURACY EVALUATOR');
  console.log('Testing directly against src/lib/workerDSP.js & src/lib/benchmarkSongs.js');
  console.log('='.repeat(80));

  const decoder = new MPEGDecoder();
  await decoder.ready;

  let totalSongsEvaluated = 0;
  let correctKeyCount = 0;
  let sumPrecision = 0;
  let sumRecall = 0;
  let sumF1 = 0;
  let sumConcordance = 0;

  for (const song of BENCHMARK_SONGS) {
    // Resolve audio path in public/songs or test_songs
    const relativeFile = song.file.replace(/^\//, '');
    let fullPath = path.join(process.cwd(), 'public', relativeFile);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(process.cwd(), 'test_songs', path.basename(song.file));
    }
    if (!fs.existsSync(fullPath)) {
      console.error(`\n[MISSING] ${song.title}: Could not find audio at ${fullPath}`);
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

    // Evaluate up to first 180 seconds for calibrated multi-genre evaluation
    const testSamples = Math.min(len, Math.floor(sampleRate * 180));
    const testMono = mono.subarray(0, testSamples);

    const result = await analyzeAudio(testMono, sampleRate);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // Key evaluation
    const detectedKeyRootNorm = normalizeChord(result.keyRoot);
    const expectedKeyRootNorm = normalizeChord(song.key);
    const keyMatched = (detectedKeyRootNorm === expectedKeyRootNorm) &&
      (result.scale.toLowerCase() === song.scale.toLowerCase());
    if (keyMatched) correctKeyCount++;

    // Vocabulary & Chord accuracy
    const expectedVocab = [...new Set(song.groundTruthChords.map(normalizeChord))];
    const detectedVocab = [...new Set(result.chords.map(c => normalizeChord(c.chord)))];

    const truePositives = detectedVocab.filter(c => expectedVocab.includes(c)).length;
    const precision = detectedVocab.length > 0 ? (truePositives / detectedVocab.length) : 0;
    const recall = expectedVocab.length > 0 ? (truePositives / expectedVocab.length) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    // Progression sequence concordance (% of detected chord events that match expected vocabulary)
    const validEvents = result.chords.filter(c => expectedVocab.includes(normalizeChord(c.chord))).length;
    const concordance = result.chords.length > 0 ? (validEvents / result.chords.length) : 0;

    totalSongsEvaluated++;
    sumPrecision += precision;
    sumRecall += recall;
    sumF1 += f1;
    sumConcordance += concordance;

    console.log(`\n▶ [${path.basename(song.file)}] ${song.title} (${song.artist})`);
    console.log(`  Key: Detected ${result.key} | Expected ${song.key} ${song.scale} -> ${keyMatched ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Tempo: ${result.bpm} BPM | Duration: ${result.totalDuration.toFixed(1)}s (${result.totalBeats} beats) [${elapsed}s]`);
    console.log(`  Detected Vocabulary (${detectedVocab.length}): ${detectedVocab.join(', ')}`);
    console.log(`  Expected Vocabulary (${expectedVocab.length}): ${expectedVocab.join(', ')}`);
    console.log(`  Metrics: Precision: ${(precision * 100).toFixed(1)}% | Recall: ${(recall * 100).toFixed(1)}% | F1: ${(f1 * 100).toFixed(1)}% | Concordance: ${(concordance * 100).toFixed(1)}%`);
    console.log(`  Progression Sample: ${result.chords.slice(0, 8).map(c => c.chord).join(' -> ')}`);
  }

  decoder.free();

  if (totalSongsEvaluated === 0) {
    console.error('\n[FATAL] No benchmark tracks were evaluated. Ensure public/songs/ contains audio files.');
    process.exit(1);
  }

  const avgKeyAccuracy = ((correctKeyCount / totalSongsEvaluated) * 100).toFixed(1);
  const avgPrecision = ((sumPrecision / totalSongsEvaluated) * 100).toFixed(1);
  const avgRecall = ((sumRecall / totalSongsEvaluated) * 100).toFixed(1);
  const avgF1 = ((sumF1 / totalSongsEvaluated) * 100).toFixed(1);
  const avgConcordance = ((sumConcordance / totalSongsEvaluated) * 100).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log(`BENCHMARK SUMMARY (${totalSongsEvaluated} Songs Evaluated directly against workerDSP.js)`);
  console.log('='.repeat(80));
  console.log(`  Key Detection Accuracy:      ${avgKeyAccuracy}% (${correctKeyCount}/${totalSongsEvaluated} correct)`);
  console.log(`  Chord Vocabulary Precision:  ${avgPrecision}%`);
  console.log(`  Chord Vocabulary Recall:     ${avgRecall}%`);
  console.log(`  Chord Vocabulary F1-Score:   ${avgF1}%`);
  console.log(`  Timeline Progression Concordance: ${avgConcordance}%`);
  console.log('='.repeat(80));
}

runBenchmark().catch(err => {
  console.error('[Benchmark Error]:', err);
  process.exit(1);
});
