"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { Zap, Share2, Check } from 'lucide-react';

import Header from '@/components/Header';
import UploadZone from '@/components/UploadZone';
import PlayerControls from '@/components/PlayerControls';
import AnalysisBadges from '@/components/AnalysisBadges';
import Visualizer from '@/components/Visualizer';
import SettingsBar from '@/components/SettingsBar';
import SectionMarkers from '@/components/SectionMarkers';
import TimelineView from '@/components/TimelineView';
import ChordSheetView from '@/components/ChordSheetView';
import { getRomanNumeral, simplifyChord, transposeChordName, transposeKey, normalizeUserEditedChord, smartSmoothChords, formatPracticeChartText, isDownbeat } from '@/lib/musicTheory';
import { playMetronomeClick, disposeSynths } from '@/lib/audioSynth';

export default function Home() {
  const [audioFile, setAudioFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ stage: '', progress: 0 });

  const [analysisResult, setAnalysisResult] = useState(null);
  const [difficulty, setDifficulty] = useState('intermediate');
  const [chordPacing, setChordPacing] = useState('smart'); // 'smart' | 'relaxed' | 'detailed'
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Loop points
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);

  // View mode
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'sheet'

  // Preferences & Training Modes
  const [leftHanded, setLeftHanded] = useState(false);
  const [speedTrainer, setSpeedTrainer] = useState(false);
  const [audioFocus, setAudioFocus] = useState('full'); // 'full' | 'chords' | 'bass' | 'lead-cut'
  const [chartCopied, setChartCopied] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [userChordOverrides, setUserChordOverrides] = useState({});
  const speedTrainerRef = useRef(speedTrainer);
  useEffect(() => { speedTrainerRef.current = speedTrainer; }, [speedTrainer]);
  const playbackRateRef = useRef(playbackRate);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  useEffect(() => { metronomeEnabledRef.current = metronomeEnabled; }, [metronomeEnabled]);
  const lastBeatIndexRef = useRef(0);

  // Audio refs & playback
  const audioRef = useRef(null);
  const audioBlobUrlRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const pitchShiftRef = useRef(null);
  const masterLimiterRef = useRef(null);
  const eqFilterRef = useRef(null);
  const workerRef = useRef(null);
  const animationRef = useRef(null);
  const timelineTrackRef = useRef(null);
  const beatsTrackRef = useRef(null);

  // Pixels per second for timeline rendering
  const PX_PER_SEC = 80;

  const currentAnalysisIdRef = useRef(0);

  const initWorker = useCallback(() => {
    if (workerRef.current) {
      try { workerRef.current.terminate(); } catch (_) {}
    }
    const worker = new Worker(new URL('../lib/audioWorker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const { type, analysisId } = e.data;
      if (analysisId && analysisId !== currentAnalysisIdRef.current) {
        return; // Ignore stale results from cancelled or older analyses
      }

      if (type === 'ANALYSIS_COMPLETE') {
        const { key, keyStrength, chords, beats, beatStrengths, bpm, timeSignature, sections, waveform } = e.data;
        setAnalysisResult({ key, keyStrength, chords, beats, beatStrengths, bpm, timeSignature, sections, waveform });
        setIsAnalyzing(false);
        setAnalysisProgress({ stage: 'Complete!', progress: 1.0 });
      } else if (type === 'PROGRESS') {
        setAnalysisProgress({ stage: e.data.stage, progress: e.data.progress });
      } else if (type === 'ERROR') {
        console.error("Worker error:", e.data.error);
        setIsAnalyzing(false);
        alert("Error analyzing audio: " + e.data.error);
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    initWorker();

    return () => {
      workerRef.current?.terminate();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
      }
      if (mediaSourceRef.current) {
        try { mediaSourceRef.current.disconnect(); } catch (_) {}
      }
      if (pitchShiftRef.current) pitchShiftRef.current.dispose();
      if (masterLimiterRef.current) masterLimiterRef.current.dispose();
      if (eqFilterRef.current) eqFilterRef.current.dispose();
      disposeSynths();
      cancelAnimationFrame(animationRef.current);
    };
  }, [initWorker]);

  // Update EQ Focus filter (Orbiter-inspired frequency & stem isolation)
  useEffect(() => {
    if (!eqFilterRef.current) return;
    try {
      if (audioFocus === 'chords') {
        eqFilterRef.current.low.value = -6;
        eqFilterRef.current.mid.value = 4;
        eqFilterRef.current.high.value = -3;
      } else if (audioFocus === 'bass') {
        eqFilterRef.current.low.value = 6;
        eqFilterRef.current.mid.value = -4;
        eqFilterRef.current.high.value = -6;
      } else if (audioFocus === 'lead-cut') {
        eqFilterRef.current.low.value = 1;
        eqFilterRef.current.mid.value = -8;
        eqFilterRef.current.high.value = 0;
      } else {
        eqFilterRef.current.low.value = 0;
        eqFilterRef.current.mid.value = 0;
        eqFilterRef.current.high.value = 0;
      }
    } catch (e) {
      console.warn("EQ focus adjustment notice:", e);
    }
  }, [audioFocus]);

  // Dynamic audio routing: route native Audio element through optional pitch shift,
  // 3-band EQ tone focus filter, and studio master brickwall limiter (-1.0 dBFS target from Orbiter)
  const setupAudioRouting = useCallback((mediaSource, currentTranspose) => {
    if (!mediaSource) return;
    try {
      try { mediaSource.disconnect(); } catch (_) {}

      // Master Brickwall Limiter (-1.0 dBFS ceiling from Orbiter prevents digital clipping)
      if (!masterLimiterRef.current) {
        masterLimiterRef.current = new Tone.Limiter(-1.0).toDestination();
      }

      // Audio Focus EQ Filter (3-band tone shaping)
      if (!eqFilterRef.current) {
        eqFilterRef.current = new Tone.EQ3(0, 0, 0);
        eqFilterRef.current.connect(masterLimiterRef.current);
      }

      if (currentTranspose !== 0 && pitchShiftRef.current) {
        pitchShiftRef.current.pitch = currentTranspose;
        Tone.connect(mediaSource, pitchShiftRef.current);
        try { pitchShiftRef.current.disconnect(); } catch (_) {}
        pitchShiftRef.current.connect(eqFilterRef.current);
      } else {
        Tone.connect(mediaSource, eqFilterRef.current);
      }
    } catch (e) {
      console.warn("Audio routing notice:", e);
    }
  }, []);

  useEffect(() => {
    if (mediaSourceRef.current) {
      setupAudioRouting(mediaSourceRef.current, transpose);
    }
  }, [transpose, setupAudioRouting]);

  // Update playback rate natively on Audio element with built-in pitch preservation
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const updateTimeRef = useRef(null);
  const lastStateTimeRef = useRef(0);

  const updateTime = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      const cur = audioRef.current.currentTime;

      // Direct DOM update for 60fps hardware-synchronized timeline scrolling
      if (timelineTrackRef.current) {
        timelineTrackRef.current.style.transform = `translateX(-${cur * PX_PER_SEC}px)`;
      }
      if (beatsTrackRef.current) {
        beatsTrackRef.current.style.transform = `translateX(-${cur * PX_PER_SEC}px)`;
      }

      // Handle loop points
      if (loopEnabled && loopEnd > loopStart && cur >= loopEnd) {
        audioRef.current.currentTime = loopStart;
        setCurrentTime(loopStart);
        lastStateTimeRef.current = loopStart;

        // Progressive Tempo Speed Trainer (FEAT-17): Accelerate by +0.05x on each loop repetition up to 1.00x
        if (speedTrainerRef.current && playbackRateRef.current < 1.0) {
          const nextRate = Math.min(1.0, Math.round((playbackRateRef.current + 0.05) * 100) / 100);
          playbackRateRef.current = nextRate;
          setPlaybackRate(nextRate);
          if (audioRef.current) audioRef.current.playbackRate = nextRate;
        }

        if (timelineTrackRef.current) {
          timelineTrackRef.current.style.transform = `translateX(-${loopStart * PX_PER_SEC}px)`;
        }
        if (beatsTrackRef.current) {
          beatsTrackRef.current.style.transform = `translateX(-${loopStart * PX_PER_SEC}px)`;
        }
        if (analysisResult?.beats) {
          const idx = analysisResult.beats.findIndex(b => b >= loopStart);
          lastBeatIndexRef.current = idx >= 0 ? idx : 0;
        }
      } else {
        // Audio Metronome Click Track (studio-grade beat sync)
        if (metronomeEnabledRef.current && analysisResult?.beats && analysisResult.beats.length > 0) {
          const beats = analysisResult.beats;
          const ts = analysisResult.timeSignature || 4;
          while (lastBeatIndexRef.current < beats.length && cur >= beats[lastBeatIndexRef.current]) {
            const beatIdx = lastBeatIndexRef.current;
            if (cur - beats[beatIdx] < 0.075) {
              playMetronomeClick(isDownbeat(beatIdx, ts));
            }
            lastBeatIndexRef.current++;
          }
        }

        // Throttle React state updates to ~15fps (every 66ms) to avoid 60fps full-tree re-render thrashing
        if (Math.abs(cur - lastStateTimeRef.current) >= 0.066 || cur < lastStateTimeRef.current) {
          lastStateTimeRef.current = cur;
          setCurrentTime(cur);
        }
      }

      if (updateTimeRef.current) {
        animationRef.current = requestAnimationFrame(updateTimeRef.current);
      }
    }
  }, [loopEnabled, loopEnd, loopStart, PX_PER_SEC, analysisResult]);

  useEffect(() => {
    updateTimeRef.current = updateTime;
  }, [updateTime]);

  const handleResetToNewTrack = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.onerror = null;
        audioRef.current.onended = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.src = '';
        audioRef.current.load();
      } catch (_) {}
      audioRef.current = null;
    }

    if (audioBlobUrlRef.current) {
      try { URL.revokeObjectURL(audioBlobUrlRef.current); } catch (_) {}
      audioBlobUrlRef.current = null;
    }

    if (mediaSourceRef.current) {
      try { mediaSourceRef.current.disconnect(); } catch (_) {}
      mediaSourceRef.current = null;
    }

    if (pitchShiftRef.current) {
      try { pitchShiftRef.current.dispose(); } catch (_) {}
      pitchShiftRef.current = null;
    }

    if (masterLimiterRef.current) {
      try { masterLimiterRef.current.dispose(); } catch (_) {}
      masterLimiterRef.current = null;
    }

    if (eqFilterRef.current) {
      try { eqFilterRef.current.dispose(); } catch (_) {}
      eqFilterRef.current = null;
    }

    if (timelineTrackRef.current) timelineTrackRef.current.style.transform = 'translateX(0px)';
    if (beatsTrackRef.current) beatsTrackRef.current.style.transform = 'translateX(0px)';

    setAudioFile(null);
    setAnalysisResult(null);
    setIsAnalyzing(false);
    setAnalysisProgress({ stage: '', progress: 0 });
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setTranspose(0);
    setPlaybackRate(1.0);
    setLoopEnabled(false);
    setLoopStart(0);
    setLoopEnd(0);
    setMetronomeEnabled(false);
    lastBeatIndexRef.current = 0;
    disposeSynths();
    setUserChordOverrides({});

    // Cancel any in-flight worker job and reinitialize worker
    currentAnalysisIdRef.current++;
    initWorker();
  }, [initWorker]);

  const processAudioFile = async (file) => {
    if (!file) return;
    try { Tone.start(); } catch (_) {}

    // Guard file size (max 100 MB)
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select an audio file under 100 MB.`);
      return;
    }

    const analysisId = ++currentAnalysisIdRef.current;
    const worker = initWorker();

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.onerror = null;
        audioRef.current.onended = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.src = '';
        audioRef.current.load();
      } catch (_) {}
      audioRef.current = null;
    }
    if (audioBlobUrlRef.current) {
      try { URL.revokeObjectURL(audioBlobUrlRef.current); } catch (_) {}
      audioBlobUrlRef.current = null;
    }
    if (mediaSourceRef.current) {
      try { mediaSourceRef.current.disconnect(); } catch (_) {}
      mediaSourceRef.current = null;
    }
    if (pitchShiftRef.current) {
      try { pitchShiftRef.current.dispose(); } catch (_) {}
      pitchShiftRef.current = null;
    }
    if (masterLimiterRef.current) {
      try { masterLimiterRef.current.dispose(); } catch (_) {}
      masterLimiterRef.current = null;
    }
    if (eqFilterRef.current) {
      try { eqFilterRef.current.dispose(); } catch (_) {}
      eqFilterRef.current = null;
    }

    setAudioFile(file);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setAnalysisProgress({ stage: 'Decoding & resampling audio...', progress: 0.05 });

    // Deduce and normalize audio MIME type if missing or generic (e.g. Windows file drop)
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    const MIME_MAP = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      wave: 'audio/wav',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      opus: 'audio/opus',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      weba: 'audio/webm',
      webm: 'audio/webm'
    };
    const targetMime = file.type || MIME_MAP[ext] || 'audio/mpeg';
    const normalizedBlob = file.type ? file : file.slice(0, file.size, targetMime);

    // Initialize native Audio element for hardware-synchronized playback
    const blobUrl = URL.createObjectURL(normalizedBlob);
    audioBlobUrlRef.current = blobUrl;

    const audio = new Audio(blobUrl);
    audio.preservesPitch = true;
    audio.playbackRate = playbackRate;
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (timelineTrackRef.current) {
        timelineTrackRef.current.style.transform = 'translateX(0px)';
      }
      if (beatsTrackRef.current) {
        beatsTrackRef.current.style.transform = 'translateX(0px)';
      }
      cancelAnimationFrame(animationRef.current);
    };

    audio.onerror = (e) => {
      // Discard error if audio element was unmounted, superseded, or cleared
      if (
        !audioRef.current ||
        audioRef.current !== audio ||
        !audio.src ||
        audio.src === '' ||
        audio.src === window.location.href
      ) {
        return;
      }
      console.warn('Audio element playback notice:', e, audio.error);
      setIsPlaying(false);
    };

    try {
      const arrayBuffer = await file.arrayBuffer();
      if (analysisId !== currentAnalysisIdRef.current) return;

      await Tone.start();
      if (analysisId !== currentAnalysisIdRef.current) return;
      const rawCtx = Tone.getContext().rawContext;

      const mediaSource = rawCtx.createMediaElementSource(audio);
      mediaSourceRef.current = mediaSource;

      pitchShiftRef.current = new Tone.PitchShift({
        pitch: transpose,
        windowSize: 0.1,
        delayTime: 0,
        feedback: 0
      });

      setupAudioRouting(mediaSource, transpose);

      const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer.slice(0));
      if (analysisId !== currentAnalysisIdRef.current) return;

      // Guard audio duration (max 20 minutes)
      const MAX_DURATION_SEC = 20 * 60;
      if (audioBuffer.duration > MAX_DURATION_SEC) {
        setIsAnalyzing(false);
        alert(`Track duration is too long (${(audioBuffer.duration / 60).toFixed(1)} min). Maximum supported duration is 20 minutes.`);
        return;
      }

      setDuration(audioBuffer.duration);

      const targetRate = 44100;
      let copiedBuffer;

      // Fast-path: if audio is already 44.1 kHz, downmix in-memory without spawning OfflineAudioContext
      if (audioBuffer.sampleRate === targetRate) {
        const len = audioBuffer.length;
        const mono = new Float32Array(len);
        const numChannels = audioBuffer.numberOfChannels;
        for (let ch = 0; ch < numChannels; ch++) {
          const chData = audioBuffer.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            mono[i] += chData[i] / numChannels;
          }
        }
        copiedBuffer = mono.buffer;
      } else {
        // Resample cleanly via native OfflineAudioContext
        const targetLength = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
        const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const offlineCtx = new OfflineCtxClass(1, targetLength, targetRate);
        
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        const renderedBuffer = await offlineCtx.startRendering();
        if (analysisId !== currentAnalysisIdRef.current) return;
        const channelData = renderedBuffer.getChannelData(0);
        copiedBuffer = channelData.slice(0).buffer;
      }

      worker.postMessage(
        {
          type: 'ANALYZE_AUDIO',
          analysisId,
          audioData: new Float32Array(copiedBuffer),
          sampleRate: targetRate,
        },
        [copiedBuffer]
      );

    } catch (err) {
      if (analysisId !== currentAnalysisIdRef.current) return;
      console.error("Error setting up audio:", err.message || err);
      setIsAnalyzing(false);
      alert("Could not decode audio: " + (err.message || String(err)));
    }
  };

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await Tone.start();
      if (audioRef.current.error) {
        console.warn("Audio element error state:", audioRef.current.error);
        setIsPlaying(false);
        return;
      }
      if (audioRef.current.paused) {
        // Sync beat index for audio metronome
        if (analysisResult?.beats) {
          const beats = analysisResult.beats;
          const cur = audioRef.current.currentTime;
          let idx = 0;
          while (idx < beats.length && beats[idx] < cur) idx++;
          lastBeatIndexRef.current = idx;
        }
        await audioRef.current.play();
        setIsPlaying(true);
        animationRef.current = requestAnimationFrame(updateTime);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
        cancelAnimationFrame(animationRef.current);
      }
    } catch (err) {
      console.error("Playback error:", err);
      setIsPlaying(false);
    }
  }, [updateTime, analysisResult]);

  const seekTo = useCallback((time) => {
    const clampedTime = Math.max(0, Math.min(duration, time));
    // If seeking outside active loop, auto-disable loop to prevent playhead trap
    if (loopEnabled && (clampedTime < loopStart - 0.1 || clampedTime > loopEnd + 0.1)) {
      setLoopEnabled(false);
    }
    if (audioRef.current) {
      audioRef.current.currentTime = clampedTime;
    }
    if (analysisResult?.beats) {
      const beats = analysisResult.beats;
      let idx = 0;
      while (idx < beats.length && beats[idx] < clampedTime) idx++;
      lastBeatIndexRef.current = idx;
    }
    setCurrentTime(clampedTime);
    if (timelineTrackRef.current) {
      timelineTrackRef.current.style.transform = `translateX(-${clampedTime * PX_PER_SEC}px)`;
    }
    if (beatsTrackRef.current) {
      beatsTrackRef.current.style.transform = `translateX(-${clampedTime * PX_PER_SEC}px)`;
    }
  }, [duration, PX_PER_SEC, loopEnabled, loopStart, loopEnd, analysisResult]);

  const skipForward = () => seekTo(currentTime + 5);
  const skipBackward = () => seekTo(currentTime - 5);

  // Global Keyboard Shortcuts (UI-09): Space (Play/Pause), Left/Right (Seek ±5s), [ ] (Loop In/Out), + - (Transpose)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;
      if (e.code === 'Space' && (tag === 'BUTTON' || e.target?.getAttribute('role') === 'button')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekTo(Math.max(0, currentTime - 5));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekTo(Math.min(duration, currentTime + 5));
      } else if (e.key === '[' && audioRef.current) {
        e.preventDefault();
        setLoopStart(currentTime);
        setLoopEnabled(true);
      } else if (e.key === ']' && audioRef.current) {
        e.preventDefault();
        setLoopEnd(currentTime);
        setLoopEnabled(true);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setTranspose(t => t + 1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setTranspose(t => t - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekTo, currentTime, duration]);

  // ─── Chord Processing ──────────────────────────────────────────────

  const calculateBestCapo = useCallback((chords) => {
    const easyRoots = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm'];
    let bestCapo = 0;
    let maxEasyScore = -1;

    for (let capo = 0; capo < 12; capo++) {
      let score = 0;
      for (const c of chords) {
        const transposed = transposeChordName(c.chord, -capo);
        const simplified = simplifyChord(transposed);
        if (easyRoots.includes(simplified)) score++;
      }
      if (score > maxEasyScore) {
        maxEasyScore = score;
        bestCapo = capo;
      }
    }
    return bestCapo;
  }, []);

  const { processedChords, capoFret } = useMemo(() => {
    let processed = [];
    let capo = 0;

    if (analysisResult && analysisResult.chords) {
      // 1. Attach stable IDs and apply user overrides to base detected chords (BUG-28)
      let currentChords = analysisResult.chords.map(c => {
        const chordId = c.id || `chord-${Number(c.time).toFixed(2)}`;
        const override = userChordOverrides[chordId];
        return {
          ...c,
          id: chordId,
          originalChord: c.originalChord || c.chord,
          chord: override || c.chord,
          isUserEdited: Boolean(override)
        };
      });

      // 2. Transposition
      if (transpose !== 0) {
        currentChords = currentChords.map(c => ({
          ...c,
          chord: transposeChordName(c.chord, transpose)
        }));
      }

      // 3. Difficulty / Capo voicing
      if (difficulty === 'easy') {
        capo = calculateBestCapo(currentChords);
        processed = currentChords.map(c => ({
          ...c,
          chord: simplifyChord(transposeChordName(c.chord, -capo))
        }));
      } else if (difficulty === 'intermediate') {
        processed = currentChords.map(c => ({
          ...c,
          chord: simplifyChord(c.chord)
        }));
      } else {
        processed = currentChords;
      }

      // 4. Smart Chord Pacing & Harmonic Smoothing
      // Filters frantic switches and transient excursions ("even when it's not there in the chord")
      const smoothed = smartSmoothChords(processed, duration, {
        pacing: chordPacing,
        bpm: analysisResult.bpm || 120,
        timeSignature: analysisResult.timeSignature || 4
      });

      // 5. Ensure seamless duration tiling and Roman numerals (BUG-27)
      // Transpose key alongside chords; in easy mode evaluate relative to capo shape
      const soundingKey = transposeKey(analysisResult.key, transpose);
      const effectiveKey = difficulty === 'easy' ? transposeKey(soundingKey, -capo) : soundingKey;

      for (let i = 0; i < smoothed.length; i++) {
        const nextTime = i < smoothed.length - 1 ? smoothed[i + 1].time : (duration || smoothed[i].time + (smoothed[i].duration || 4));
        smoothed[i].duration = Math.max(0.01, nextTime - smoothed[i].time);
        smoothed[i].romanNumeral = getRomanNumeral(smoothed[i].chord, effectiveKey);
      }
      processed = smoothed;
    }
    return { processedChords: processed, capoFret: capo };
  }, [analysisResult, difficulty, transpose, calculateBestCapo, duration, userChordOverrides, chordPacing]);

  const handleEditChord = useCallback((chordId, newChord) => {
    setUserChordOverrides(prev => {
      const updated = { ...prev };
      if (!newChord || newChord.trim() === '') {
        delete updated[chordId];
      } else {
        // Correctly normalize displayed shape back to detected base chord across capo & transpose
        const baseChord = normalizeUserEditedChord(newChord, {
          difficulty,
          capo: capoFret,
          transpose
        });
        updated[chordId] = baseChord;
      }
      return updated;
    });
  }, [difficulty, capoFret, transpose]);

  // Active chord index
  let activeChordIndex = -1;
  if (processedChords.length > 0) {
    activeChordIndex = processedChords.findIndex((c, i) => {
      const nextTime = i < processedChords.length - 1 ? processedChords[i + 1].time : Infinity;
      return currentTime >= c.time && currentTime < nextTime;
    });
    if (activeChordIndex === -1 && processedChords.length > 0 && currentTime < processedChords[0].time) {
      activeChordIndex = 0;
    }
  }

  // Active chord & upcoming chord derivation for live sync display
  const activeChord = activeChordIndex >= 0 ? processedChords[activeChordIndex] : null;
  const nextChord = activeChordIndex >= 0 && activeChordIndex < processedChords.length - 1
    ? processedChords[activeChordIndex + 1]
    : null;
  const timeUntilNextChord = nextChord ? Math.max(0, nextChord.time - currentTime) : 0;

  // Active chord beats for live synchronized beat indicators
  const activeChordBeats = useMemo(() => {
    if (!activeChord || !analysisResult?.beats) return [];
    const chordEnd = activeChordIndex < processedChords.length - 1
      ? processedChords[activeChordIndex + 1].time
      : (duration || activeChord.time + (activeChord.duration || 4));
    return analysisResult.beats.filter(b => b >= activeChord.time - 0.05 && b < chordEnd - 0.05);
  }, [activeChord, activeChordIndex, processedChords, analysisResult, duration]);

  // Format time helper
  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Count unique chords
  const uniqueChords = useMemo(() => {
    if (!processedChords.length) return 0;
    return new Set(processedChords.map(c => c.chord)).size;
  }, [processedChords]);

  // Set loop to a section
  const setLoopToSection = (section) => {
    // If clicking the currently active looped section, toggle the loop off
    if (loopEnabled && Math.abs(loopStart - section.startTime) < 0.05 && Math.abs(loopEnd - section.endTime) < 0.05) {
      setLoopEnabled(false);
      return;
    }
    setLoopStart(section.startTime);
    setLoopEnd(section.endTime);
    setLoopEnabled(true);
  };

  // Set loop around current playback position (DAW 4-bar loop window)
  const handleSetCurrentLoop = useCallback(() => {
    if (!duration) return;
    const currentSection = analysisResult?.sections?.find(
      s => currentTime >= s.startTime && currentTime < s.endTime
    );
    if (currentSection) {
      setLoopStart(currentSection.startTime);
      setLoopEnd(currentSection.endTime);
      setLoopEnabled(true);
      return;
    }
    const bpm = analysisResult?.bpm || 120;
    const ts = analysisResult?.timeSignature || 4;
    const barDuration = (60 / bpm) * ts;
    const loopDuration = barDuration * 4;
    const start = Math.max(0, currentTime - 0.5);
    const end = Math.min(duration, start + loopDuration);
    setLoopStart(start);
    setLoopEnd(end);
    setLoopEnabled(true);
  }, [duration, analysisResult, currentTime]);

  // 1-Click Practice Chord Chart Export (inspired by Orbiter's RenderView)
  const handleExportChart = useCallback(() => {
    if (!analysisResult) return;
    const chartText = formatPracticeChartText({
      title: audioFile?.name || 'Untitled Song',
      key: analysisResult.key,
      bpm: analysisResult.bpm,
      timeSignature: analysisResult.timeSignature,
      capoFret: difficulty === 'easy' ? capoFret : 0,
      sections: analysisResult.sections,
      chords: processedChords
    });

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(chartText);
      setChartCopied(true);
      setTimeout(() => setChartCopied(false), 2000);
    }
  }, [analysisResult, audioFile, difficulty, capoFret, processedChords]);

  return (
    <div className={`container ${audioFile ? 'studio-active' : ''}`}>
      {/* ─── Header / Studio Topbar ─────────────────────────────────── */}
      <Header
        audioFile={audioFile}
        analysisResult={analysisResult}
        uniqueChords={uniqueChords}
        onResetTrack={handleResetToNewTrack}
      />

      {/* ─── Upload Zone or Main Studio ────────────────────────────── */}
      {!audioFile ? (
        <UploadZone onFileSelected={processAudioFile} />
      ) : (
        <div className="animate-fade-in studio-workspace">
          {/* ─── Analysis Progress Banner ────────────────────────────── */}
          {isAnalyzing && (
            <div className="studio-progress-banner">
              <div className="progress-info">
                <span className="animate-pulse">
                  <Zap size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  {analysisProgress.stage || 'Analyzing audio...'}
                </span>
                <span className="progress-num">{Math.round(analysisProgress.progress * 100)}%</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${analysisProgress.progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ─── Primary Rehearsal Stage (Hero + Timeline/Sheet) ─────── */}
          {analysisResult && processedChords.length > 0 && (
            <section className="rehearsal-stage" aria-label="Chord Rehearsal Stage">
              <div className="stage-header-row">
                <div className="stage-title-wrap">
                  <span className="stage-title">Rehearsal Stage</span>
                  <div className="stage-pills">
                    {difficulty === 'easy' && capoFret > 0 && (
                      <span className="stage-pill">Capo {capoFret}</span>
                    )}
                    <span className="stage-pill">{chordPacing}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="segmented-control stage-toggle">
                    <button
                      className={`segmented-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                      onClick={() => setViewMode('timeline')}
                    >
                      Timeline
                    </button>
                    <button
                      className={`segmented-btn ${viewMode === 'sheet' ? 'active' : ''}`}
                      onClick={() => setViewMode('sheet')}
                    >
                      Chord Sheet
                    </button>
                  </div>

                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.78rem', gap: '5px' }}
                    onClick={handleExportChart}
                    title="Copy formatted chord practice chart to clipboard"
                  >
                    {chartCopied ? <Check size={12} /> : <Share2 size={12} />}
                    <span>{chartCopied ? 'Copied Chart!' : 'Export Chart'}</span>
                  </button>
                </div>
              </div>

              {viewMode === 'timeline' ? (
                <TimelineView
                  processedChords={processedChords}
                  activeChordIndex={activeChordIndex}
                  activeChord={activeChord}
                  nextChord={nextChord}
                  timeUntilNextChord={timeUntilNextChord}
                  activeChordBeats={activeChordBeats}
                  analysisResult={analysisResult}
                  currentTime={currentTime}
                  duration={duration}
                  isPlaying={isPlaying}
                  difficulty={difficulty}
                  chordPacing={chordPacing}
                  capoFret={capoFret}
                  leftHanded={leftHanded}
                  PX_PER_SEC={PX_PER_SEC}
                  beatsTrackRef={beatsTrackRef}
                  timelineTrackRef={timelineTrackRef}
                  onSeek={seekTo}
                  formatTime={formatTime}
                  onEditChord={handleEditChord}
                />
              ) : (
                <ChordSheetView
                  processedChords={processedChords}
                  activeChordIndex={activeChordIndex}
                  analysisResult={analysisResult}
                  currentTime={currentTime}
                  duration={duration}
                  difficulty={difficulty}
                  capoFret={capoFret}
                  onSeek={seekTo}
                  formatTime={formatTime}
                  audioFile={audioFile}
                />
              )}
            </section>
          )}

          {/* ─── Studio Player Dock (Waveform & Transport) ───────────── */}
          <PlayerControls
            audioFile={audioFile}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            isAnalyzing={isAnalyzing}
            analysisProgress={analysisProgress}
            analysisResult={analysisResult}
            processedChords={processedChords}
            loopEnabled={loopEnabled}
            loopStart={loopStart}
            loopEnd={loopEnd}
            metronomeEnabled={metronomeEnabled}
            onToggleMetronome={() => setMetronomeEnabled(m => !m)}
            onSetCurrentLoop={handleSetCurrentLoop}
            onClearLoop={() => setLoopEnabled(false)}
            onTogglePlay={togglePlay}
            onSeek={seekTo}
            onSkipBackward={skipBackward}
            onSkipForward={skipForward}
            onResetTrack={handleResetToNewTrack}
            formatTime={formatTime}
          />

          {/* ─── Song Section Markers ────────────────────────────────── */}
          <SectionMarkers
            sections={analysisResult?.sections}
            currentTime={currentTime}
            loopEnabled={loopEnabled}
            loopStart={loopStart}
            loopEnd={loopEnd}
            onSectionClick={(sec) => {
              if (loopEnabled && Math.abs(loopStart - sec.startTime) < 0.05 && Math.abs(loopEnd - sec.endTime) < 0.05) {
                setLoopEnabled(false);
              } else {
                seekTo(sec.startTime);
                setLoopToSection(sec);
              }
            }}
            onClearLoop={() => setLoopEnabled(false)}
            formatTime={formatTime}
          />

          {/* ─── Studio Toolbar (Voicing, Pacing, Transpose, Speed, Focus) ──── */}
          <SettingsBar
            transpose={transpose}
            onTransposeChange={setTranspose}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            chordPacing={chordPacing}
            onChordPacingChange={setChordPacing}
            capoFret={capoFret}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
            leftHanded={leftHanded}
            onLeftHandedChange={setLeftHanded}
            speedTrainer={speedTrainer}
            onSpeedTrainerChange={setSpeedTrainer}
            audioFocus={audioFocus}
            onAudioFocusChange={setAudioFocus}
          />

          {/* ─── Metronome Pulse Visualizer ──────────────────────────── */}
          {analysisResult && analysisResult.beats && (
            <Visualizer
              beats={analysisResult.beats}
              beatStrengths={analysisResult.beatStrengths}
              currentTime={currentTime}
              isPlaying={isPlaying}
              bpm={analysisResult.bpm || 0}
              timeSignature={analysisResult.timeSignature || 4}
            />
          )}
        </div>
      )}
    </div>
  );
}
