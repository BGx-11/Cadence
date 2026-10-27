"use client";

import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Zap, Repeat, Timer, X } from 'lucide-react';
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
  loopEnabled = false,
  loopStart = 0,
  loopEnd = 0,
  metronomeEnabled = false,
  onToggleMetronome,
  onSetCurrentLoop,
  onClearLoop,
  onTogglePlay,
  onSeek,
  onSkipBackward,
  onSkipForward,
  onResetTrack,
  formatTime,
}) {
  return (
    <div className="studio-player-dock">
      {/* Waveform visual scrubber */}
      {analysisResult && analysisResult.waveform ? (
        <div className="dock-waveform-wrap">
          <WaveformDisplay
            waveform={analysisResult.waveform}
            currentTime={currentTime}
            duration={duration}
            chords={processedChords}
            beats={analysisResult.beats}
            sections={analysisResult.sections}
            loopEnabled={loopEnabled}
            loopStart={loopStart}
            loopEnd={loopEnd}
            isPlaying={isPlaying}
            onSeek={onSeek}
            timeSignature={analysisResult.timeSignature || 4}
          />
        </div>
      ) : (
        <div className="dock-slider-wrap">
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

      {/* Dock control bar: Time | Transport | Status */}
      <div className="dock-controls-row">
        {/* Left: Time readout */}
        <div className="dock-time-readout">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="time-sep">/</span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>

        {/* Center: Transport buttons */}
        <div className="dock-transport">
          <button
            className="transport-btn"
            onClick={onSkipBackward}
            id="skip-back-btn"
            aria-label="Skip back 5 seconds"
            title="Skip back 5s (←)"
          >
            <SkipBack size={15} />
          </button>

          <button
            className="play-btn"
            onClick={onTogglePlay}
            id="play-pause-btn"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>

          <button
            className="transport-btn"
            onClick={onSkipForward}
            id="skip-forward-btn"
            aria-label="Skip forward 5 seconds"
            title="Skip forward 5s (→)"
          >
            <SkipForward size={15} />
          </button>

          {/* Loop toggle pill */}
          {loopEnabled && loopEnd > loopStart ? (
            <button
              className="transport-loop-btn active"
              onClick={onClearLoop}
              title="Active loop region. Click to clear"
            >
              <Repeat size={11} />
              <span>{formatTime(loopStart)}–{formatTime(loopEnd)}</span>
              <X size={10} style={{ marginLeft: 2 }} />
            </button>
          ) : (
            <button
              className="transport-loop-btn"
              onClick={onSetCurrentLoop}
              title="Set loop around current playback position (hotkeys: [ and ])"
            >
              <Repeat size={11} />
              <span>Loop [ ]</span>
            </button>
          )}

          {/* Metronome click toggle */}
          <button
            className={`transport-metronome-btn ${metronomeEnabled ? 'active' : ''}`}
            onClick={onToggleMetronome}
            title={metronomeEnabled ? 'Disable audio metronome click' : 'Enable audio metronome click (woodblock tick on beats)'}
          >
            <Timer size={11} />
            <span>Click</span>
          </button>
        </div>

        {/* Right: Status or helper */}
        <div className="dock-meta-right">
          {isAnalyzing ? (
            <span className="dock-status-pill animate-pulse">
              <Zap size={11} />
              <span>{analysisProgress.stage || 'Analyzing...'}</span>
            </span>
          ) : (
            <span className="dock-status-pill idle">
              <span>Space to {isPlaying ? 'pause' : 'play'}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
