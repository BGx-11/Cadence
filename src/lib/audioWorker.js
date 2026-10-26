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
import {
  ALL_CHORD_LABELS,
  normalizeHPCP,
  computeChordConfidence,
  computeEmissionScores,
  buildTransitionMatrix,
  viterbiDecode,
  smoothExcursions,
  consolidateChords,
  detectTimeSignature,
  detectSections,
  computeWaveformData
} from './workerDSP';

let essentia = null;

async function initEssentia() {
  if (essentia) return essentia;

  if (EssentiaWASM.EssentiaJS || EssentiaWASM.calledRun) {
    essentia = new Essentia(EssentiaWASM);
    return essentia;
  }

  await new Promise((resolve) => {
    if (EssentiaWASM.EssentiaJS || EssentiaWASM.calledRun) {
      resolve();
      return;
    }
    const prevInit = EssentiaWASM.onRuntimeInitialized;
    EssentiaWASM.onRuntimeInitialized = () => {
      if (prevInit) prevInit();
      resolve();
    };
  });
  essentia = new Essentia(EssentiaWASM);
  return essentia;
}

// ─── Main Worker Handler ────────────────────────────────────────────────

self.onmessage = async (e) => {
  if (e.data.type === 'ANALYZE_AUDIO') {
    const analysisId = e.data.analysisId;
    const sendProgress = (stage, progress) => {
      self.postMessage({ type: 'PROGRESS', analysisId, stage, progress });
    };

    try {
      const audioData = e.data.audioData; // Float32Array
      const sampleRate = e.data.sampleRate || 44100;
      const totalDuration = audioData.length / sampleRate;

      await initEssentia();

      sendProgress('Detecting beats & tempo...', 0.1);

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
        if (rhythm.estimates) rhythm.estimates.delete();
        if (rhythm.bpmIntervals) rhythm.bpmIntervals.delete();

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

        sendProgress('Analyzing musical key...', 0.2);

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

        sendProgress('Extracting harmonic profiles...', 0.3);

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

          // Frame RMS energy to distinguish real audio from ambient background (DSP-13)
          let frameEnergySq = 0;
          for (let s = 0; s < segmentData.length; s++) {
            frameEnergySq += segmentData[s] * segmentData[s];
          }
          const frameRms = Math.sqrt(frameEnergySq / segmentData.length);
          const energyScale = frameRms < 0.005 ? 0 : Math.min(1.0, frameRms / 0.02);
          const scaledRotated = energyScale === 1.0 ? rotated : rotated.map(v => v * energyScale);
          hpcpFrames.push(scaledRotated);

          const bassFolded = new Array(12).fill(0);
          const bassSize = bassHPCP.hpcp.size();
          for (let h = 0; h < bassSize; h++) {
            bassFolded[h % 12] += bassHPCP.hpcp.get(h);
          }
          const bassRotated = [...bassFolded.slice(3), ...bassFolded.slice(0, 3)];
          const scaledBass = energyScale === 1.0 ? bassRotated : bassRotated.map(v => v * energyScale);
          bassFrames.push(normalizeHPCP(scaledBass));

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
            sendProgress('Computing harmonic profile...', hpcpProgress);
          }
        }

        sendProgress('Decoding chord sequence...', 0.8);

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

            // Pre-normalization energy check (DSP-13):
            // Measure raw unnormalized chroma magnitude to catch quiet audio before normalizeHPCP
            const rawMax = Math.max(...medianHPCP);
            const rawEnergy = medianHPCP.reduce((a, b) => a + b, 0);

            if (rawMax < 0.015 || rawEnergy < 0.04) {
              // Genuinely quiet beat: feed zero vector so 'N.C.' state detects silence
              beatHPCPs.push(new Array(12).fill(0));
              beatBassHPCPs.push(new Array(12).fill(0));
            } else {
              beatHPCPs.push(normalizeHPCP(medianHPCP));
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

          // Post-processing: Consolidate transient 1-beat chord flickers (A -> X -> A)
          // Confidence & score aware: only smooth excursions if evidence for X is weak/contested
          const smoothedPath = smoothExcursions(path, emissions, rawBeats, totalDuration);

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

        sendProgress('Structuring song sections...', 0.92);

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

        sendProgress('Complete!', 1.0);

        // ── Return Results ──
        self.postMessage({
          type: 'ANALYSIS_COMPLETE',
          analysisId,
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
      self.postMessage({ type: 'ERROR', analysisId, error: String(error.message || error) });
    }
  }
};
