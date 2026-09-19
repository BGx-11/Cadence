"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { Zap } from 'lucide-react';

import Header from '@/components/Header';
import UploadZone from '@/components/UploadZone';
import PlayerControls from '@/components/PlayerControls';
import AnalysisBadges from '@/components/AnalysisBadges';
import Visualizer from '@/components/Visualizer';
import SettingsBar from '@/components/SettingsBar';
import SectionMarkers from '@/components/SectionMarkers';
import TimelineView from '@/components/TimelineView';
import ChordSheetView from '@/components/ChordSheetView';

export default function Home() {
  const [audioFile, setAudioFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ stage: '', progress: 0 });

  const [analysisResult, setAnalysisResult] = useState(null);
  const [difficulty, setDifficulty] = useState('intermediate');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Loop points
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);

  // View mode
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'sheet'

  // Audio refs & playback
  const audioRef = useRef(null);
  const audioBlobUrlRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const pitchShiftRef = useRef(null);
  const workerRef = useRef(null);
  const animationRef = useRef(null);
  const timelineTrackRef = useRef(null);
  const beatsTrackRef = useRef(null);

  // Pixels per second for timeline rendering
  const PX_PER_SEC = 80;

  useEffect(() => {
    // Initialize Web Worker for audio analysis
    workerRef.current = new Worker(new URL('../lib/audioWorker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (e) => {
      const { type } = e.data;
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
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Dynamic audio routing: route native Audio element through optional pitch shift to destination
  const setupAudioRouting = useCallback((mediaSource, currentTranspose) => {
    if (!mediaSource) return;
    try {
      try { mediaSource.disconnect(); } catch (_) {}

      if (currentTranspose !== 0 && pitchShiftRef.current) {
        pitchShiftRef.current.pitch = currentTranspose;
        Tone.connect(mediaSource, pitchShiftRef.current);
        try { pitchShiftRef.current.disconnect(); } catch (_) {}
        pitchShiftRef.current.toDestination();
      } else {
        const rawCtx = Tone.getContext().rawContext;
        mediaSource.connect(rawCtx.destination);
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

  const updateTime = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      const cur = audioRef.current.currentTime;

      // Handle loop points
      if (loopEnabled && loopEnd > loopStart && cur >= loopEnd) {
        audioRef.current.currentTime = loopStart;
        setCurrentTime(loopStart);
        if (timelineTrackRef.current) {
          timelineTrackRef.current.style.transform = `translateX(-${loopStart * PX_PER_SEC}px)`;
        }
        if (beatsTrackRef.current) {
          beatsTrackRef.current.style.transform = `translateX(-${loopStart * PX_PER_SEC}px)`;
        }
      } else {
        setCurrentTime(cur);
        // Direct DOM update for 60fps hardware-synchronized timeline scrolling
        if (timelineTrackRef.current) {
          timelineTrackRef.current.style.transform = `translateX(-${cur * PX_PER_SEC}px)`;
        }
        if (beatsTrackRef.current) {
          beatsTrackRef.current.style.transform = `translateX(-${cur * PX_PER_SEC}px)`;
        }
      }

      if (updateTimeRef.current) {
        animationRef.current = requestAnimationFrame(updateTimeRef.current);
      }
    }
  }, [loopEnabled, loopEnd, loopStart, PX_PER_SEC]);

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
  }, []);

  const processAudioFile = async (file) => {
    if (!file) return;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.onended = null;
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

    setAudioFile(file);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setAnalysisProgress({ stage: 'Decoding & resampling audio...', progress: 0.05 });

    // Initialize native Audio element for hardware-synchronized playback
    const blobUrl = URL.createObjectURL(file);
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

    try {
      const arrayBuffer = await file.arrayBuffer();
      await Tone.start();
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
      setDuration(audioBuffer.duration);

      // Downmix stereo to mono & resample cleanly to 44100 Hz via native OfflineAudioContext
      const targetRate = 44100;
      const targetLength = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
      const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offlineCtx = new OfflineCtxClass(1, targetLength, targetRate);
      
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const channelData = renderedBuffer.getChannelData(0);
      const copiedBuffer = channelData.slice(0).buffer;

      workerRef.current.postMessage(
        {
          type: 'ANALYZE_AUDIO',
          audioData: new Float32Array(copiedBuffer),
          sampleRate: targetRate,
        },
        [copiedBuffer]
      );

    } catch (err) {
      console.error("Error setting up audio:", err.message || err);
      setIsAnalyzing(false);
      alert("Could not decode audio: " + (err.message || String(err)));
    }
  };

  const togglePlay = async () => {
    if (!audioRef.current) return;
    try {
      await Tone.start();
      if (audioRef.current.paused) {
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
    }
  };

  const seekTo = useCallback((time) => {
    const clampedTime = Math.max(0, Math.min(duration, time));
    if (audioRef.current) {
      audioRef.current.currentTime = clampedTime;
    }
    setCurrentTime(clampedTime);
    if (timelineTrackRef.current) {
      timelineTrackRef.current.style.transform = `translateX(-${clampedTime * PX_PER_SEC}px)`;
    }
    if (beatsTrackRef.current) {
      beatsTrackRef.current.style.transform = `translateX(-${clampedTime * PX_PER_SEC}px)`;
    }
  }, [duration, PX_PER_SEC]);

  const skipForward = () => seekTo(currentTime + 5);
  const skipBackward = () => seekTo(currentTime - 5);

  // ─── Chord Processing ──────────────────────────────────────────────

  const transposeChordName = useCallback((chord, steps) => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };

    const rootMatch = chord.match(/^[A-G][#b]?/);
    if (!rootMatch) return chord;
    let root = rootMatch[0];
    root = flatToSharp[root] || root;

    const rootIndex = notes.indexOf(root);
    if (rootIndex === -1) return chord;

    let newIndex = (rootIndex + steps) % 12;
    if (newIndex < 0) newIndex += 12;

    return notes[newIndex] + chord.slice(rootMatch[0].length);
  }, []);

  const simplifyChord = useCallback((chord) => {
    const rootMatch = chord.match(/^[A-G][#b]?m?/);
    return rootMatch ? rootMatch[0] : chord;
  }, []);

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
  }, [transposeChordName, simplifyChord]);

  const { processedChords, capoFret } = useMemo(() => {
    let processed = [];
    let capo = 0;

    if (analysisResult && analysisResult.chords) {
      let currentChords = analysisResult.chords;

      if (transpose !== 0) {
        currentChords = currentChords.map(c => ({
          ...c,
          chord: transposeChordName(c.chord, transpose)
        }));
      }

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

      // Consolidate consecutive identical chords produced by simplification or transposition
      const merged = [];
      for (const c of processed) {
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

      // Ensure seamless duration tiling so each chord card extends to the start of the next chord
      for (let i = 0; i < merged.length; i++) {
        const nextTime = i < merged.length - 1 ? merged[i + 1].time : (duration || merged[i].time + (merged[i].duration || 4));
        merged[i].duration = Math.max(0.8, nextTime - merged[i].time);
      }
      processed = merged;
    }
    return { processedChords: processed, capoFret: capo };
  }, [analysisResult, difficulty, transpose, calculateBestCapo, simplifyChord, transposeChordName, duration]);

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
    setLoopStart(section.startTime);
    setLoopEnd(section.endTime);
    setLoopEnabled(true);
  };

  return (
    <div className="container">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <Header />

      {/* ─── Upload Zone or Main Studio ────────────────────────────── */}
      {!audioFile ? (
        <UploadZone onFileSelected={processAudioFile} />
      ) : (
        <div className="animate-fade-in">

          {/* ─── Player Controls & Waveform ─────────────────────────── */}
          <PlayerControls
            audioFile={audioFile}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            isAnalyzing={isAnalyzing}
            analysisProgress={analysisProgress}
            analysisResult={analysisResult}
            processedChords={processedChords}
            onTogglePlay={togglePlay}
            onSeek={seekTo}
            onSkipBackward={skipBackward}
            onSkipForward={skipForward}
            onResetTrack={handleResetToNewTrack}
            formatTime={formatTime}
          />

          {/* ─── Analysis Progress Bar ─────────────────────────────── */}
          {isAnalyzing && (
            <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
              <div className="section-header" style={{ marginBottom: '0.75rem' }}>
                <div className="icon-circle">
                  <Zap size={14} />
                </div>
                <h3>{analysisProgress.stage || 'Analyzing...'}</h3>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${analysisProgress.progress * 100}%` }}
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--foreground-dim)', marginTop: '0.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                {Math.round(analysisProgress.progress * 100)}%
              </p>
            </div>
          )}

          {/* ─── Analysis Info Badges ─────────────────────────────── */}
          <AnalysisBadges
            analysisResult={analysisResult}
            uniqueChords={uniqueChords}
          />

          {/* ─── Metronome Visualizer ─────────────────────────────── */}
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

          {/* ─── Settings Controls ─────────────────────────────────── */}
          <SettingsBar
            transpose={transpose}
            onTransposeChange={setTranspose}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            capoFret={capoFret}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
          />

          {/* ─── Section Markers ───────────────────────────────────── */}
          <SectionMarkers
            sections={analysisResult?.sections}
            currentTime={currentTime}
            loopEnabled={loopEnabled}
            loopStart={loopStart}
            loopEnd={loopEnd}
            onSectionClick={(sec) => {
              seekTo(sec.startTime);
              setLoopToSection(sec);
            }}
            onClearLoop={() => setLoopEnabled(false)}
            formatTime={formatTime}
          />

          {/* ─── View Mode Toggle ──────────────────────────────────── */}
          {analysisResult && processedChords.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
              <button
                className={`btn ${viewMode === 'timeline' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('timeline')}
                style={{ fontSize: '0.75rem', padding: '6px 14px' }}
              >
                Timeline View
              </button>
              <button
                className={`btn ${viewMode === 'sheet' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('sheet')}
                style={{ fontSize: '0.75rem', padding: '6px 14px' }}
              >
                Chord Sheet View
              </button>
            </div>
          )}

          {/* ─── Chord Timeline View ───────────────────────────────── */}
          {analysisResult && processedChords.length > 0 && viewMode === 'timeline' && (
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
              capoFret={capoFret}
              PX_PER_SEC={PX_PER_SEC}
              beatsTrackRef={beatsTrackRef}
              timelineTrackRef={timelineTrackRef}
              onSeek={seekTo}
              formatTime={formatTime}
            />
          )}

          {/* ─── Chord Sheet View ──────────────────────────────────── */}
          {analysisResult && processedChords.length > 0 && viewMode === 'sheet' && (
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
            />
          )}
        </div>
      )}
    </div>
  );
}
