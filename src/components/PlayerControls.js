"use client";

import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Zap, RefreshCw } from 'lucide-react';
import WaveformDisplay from '@/components/WaveformDisplay';

export default function PlayerControls({
  audioFile,
  isPlaying,
  currentTime,
  duration,
  isAnalyzing,
  analysisProgress,
  analysisResult,
  processedChords,
  onTogglePlay,
  onSeek,
  onSkipBackward,
  onSkipForward,
  onResetTrack,
  formatTime,
}) {
  return (
    <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
      {/* Song info row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {audioFile.name}
          </h3>
          {isAnalyzing ? (
            <span className="animate-pulse" style={{ color: 'var(--foreground-muted)', fontWeight: 500, fontSize: '0.8rem' }}>
              <Zap size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              {analysisProgress.stage || 'Analyzing audio...'}
            </span>
          ) : analysisResult ? (
            <span style={{ color: 'var(--foreground-dim)', fontWeight: 500, fontSize: '0.8rem' }}>
              Analyzed at 44.1 kHz • Viterbi Decoded
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-secondary"
          onClick={onResetTrack}
          id="change-song-btn"
          title="Clear current track and choose a new audio file"
        >
          <RefreshCw size={13} />
          New Track
        </button>
      </div>

      {/* Transport controls */}
      <div className="flex-center" style={{ gap: '0.85rem', marginBottom: '1rem' }}>
        <button
          className="transport-btn"
          onClick={onSkipBackward}
          id="skip-back-btn"
          aria-label="Skip back 5 seconds"
        >
          <SkipBack size={16} />
        </button>

        <button
          className="play-btn"
          onClick={onTogglePlay}
          id="play-pause-btn"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>

        <button
          className="transport-btn"
          onClick={onSkipForward}
          id="skip-forward-btn"
          aria-label="Skip forward 5 seconds"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Waveform display / fallback seek slider */}
      {analysisResult && analysisResult.waveform ? (
        <WaveformDisplay
          waveform={analysisResult.waveform}
          currentTime={currentTime}
          duration={duration}
          chords={processedChords}
          beats={analysisResult.beats}
          sections={analysisResult.sections}
          isPlaying={isPlaying}
          onSeek={onSeek}
          timeSignature={analysisResult.timeSignature || 4}
        />
      ) : (
        <div style={{ padding: '0 0.25rem' }}>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.01}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            id="seek-bar"
            aria-label="Seek position"
          />
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '0.35rem',
        fontSize: '0.75rem',
        color: 'var(--foreground-dim)',
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        padding: '0 0.25rem'
      }}>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
