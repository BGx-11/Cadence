"use client";

import React from 'react';
import { Settings2, Guitar, Gauge, Sparkles, SlidersHorizontal } from 'lucide-react';

export default function SettingsBar({
  transpose,
  onTransposeChange,
  difficulty,
  onDifficultyChange,
  capoFret,
  playbackRate,
  onPlaybackRateChange,
  leftHanded,
  onLeftHandedChange,
  speedTrainer,
  onSpeedTrainerChange,
  chordPacing = 'smart',
  onChordPacingChange,
  audioFocus = 'full',
  onAudioFocusChange,
}) {
  return (
    <div className="studio-toolbar" role="toolbar" aria-label="Audio and practice settings">
      {/* 1. Voicing & Fretboard */}
      <div className="toolbar-group">
        <span className="toolbar-label">
          <Guitar size={13} />
          <span>Voicing</span>
        </span>
        <div className="segmented-control">
          {['easy', 'intermediate', 'hard'].map((level) => (
            <button
              key={level}
              id={`difficulty-${level}`}
              className={`segmented-btn ${difficulty === level ? 'active' : ''}`}
              onClick={() => onDifficultyChange(level)}
            >
              {level === 'intermediate' ? 'Med' : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
          <button
            className={`segmented-btn ${leftHanded ? 'active' : ''}`}
            onClick={() => onLeftHandedChange(!leftHanded)}
            title="Mirror chord charts for left-handed guitarists"
          >
            {leftHanded ? 'LH' : 'RH'}
          </button>
        </div>
        {difficulty === 'easy' && capoFret > 0 && (
          <span className="toolbar-badge-pill" title="Recommended capo position for open chords">
            Capo {capoFret}
          </span>
        )}
      </div>

      {/* 2. Chord Pacing */}
      <div className="toolbar-group">
        <span className="toolbar-label">
          <Sparkles size={13} />
          <span>Pacing</span>
        </span>
        <div className="segmented-control">
          {[
            { id: 'smart', label: 'Smart' },
            { id: 'relaxed', label: 'Relaxed' },
            { id: 'detailed', label: 'Detailed' }
          ].map((mode) => (
            <button
              key={mode.id}
              id={`pacing-${mode.id}`}
              className={`segmented-btn ${chordPacing === mode.id ? 'active' : ''}`}
              onClick={() => onChordPacingChange && onChordPacingChange(mode.id)}
              title={
                mode.id === 'smart'
                  ? 'Smart filters passing flickers and melodic transients'
                  : mode.id === 'relaxed'
                  ? 'Sustains chords across full bars'
                  : 'Preserves raw beat transitions'
              }
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Transpose / Pitch */}
      <div className="toolbar-group">
        <span className="toolbar-label">
          <Settings2 size={13} />
          <span>Pitch</span>
        </span>
        <div className="stepper-control">
          <button
            className="stepper-btn"
            onClick={() => onTransposeChange(transpose - 1)}
            aria-label="Transpose down one semitone"
          >
            −
          </button>
          <span
            className="stepper-val"
            style={{
              color: transpose === 0 ? 'var(--foreground-muted)' : 'var(--foreground)',
              fontWeight: 700
            }}
          >
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <button
            className="stepper-btn"
            onClick={() => onTransposeChange(transpose + 1)}
            aria-label="Transpose up one semitone"
          >
            +
          </button>
        </div>
      </div>

      {/* 4. Speed & Trainer */}
      <div className="toolbar-group">
        <span className="toolbar-label">
          <Gauge size={13} />
          <span>Speed</span>
        </span>
        <div className="stepper-control">
          <button
            className="stepper-btn"
            onClick={() => onPlaybackRateChange(Math.max(0.25, playbackRate - 0.25))}
            aria-label="Decrease playback speed"
          >
            −
          </button>
          <span
            className="stepper-val"
            style={{
              color: playbackRate === 1.0 ? 'var(--foreground-muted)' : 'var(--foreground)',
              fontWeight: 700
            }}
          >
            {playbackRate.toFixed(2)}x
          </span>
          <button
            className="stepper-btn"
            onClick={() => onPlaybackRateChange(Math.min(2.0, playbackRate + 0.25))}
            aria-label="Increase playback speed"
          >
            +
          </button>
        </div>
        <button
          className={`speed-trainer-toggle ${speedTrainer ? 'active' : ''}`}
          onClick={() => onSpeedTrainerChange(!speedTrainer)}
          title="Speed Trainer increments tempo by +0.05x on each loop repetition up to 1.00x"
        >
          {speedTrainer ? '⚡ Trainer ON' : '⚡ Trainer'}
        </button>
      </div>

      {/* 5. Audio Focus (Orbiter-inspired frequency & stem isolation) */}
      <div className="toolbar-group">
        <span className="toolbar-label">
          <SlidersHorizontal size={13} />
          <span>Focus</span>
        </span>
        <div className="segmented-control">
          {[
            { id: 'full', label: 'Full', desc: 'Balanced natural studio mix' },
            { id: 'chords', label: 'Chords', desc: 'Boosts rhythm guitar and piano harmonic frequencies' },
            { id: 'bass', label: 'Bass', desc: 'Isolates bass root notes' },
            { id: 'lead-cut', label: 'Vocal Cut', desc: 'Attenuates lead vocals so backing accompaniment emerges' }
          ].map((mode) => (
            <button
              key={mode.id}
              id={`focus-${mode.id}`}
              className={`segmented-btn ${audioFocus === mode.id ? 'active' : ''}`}
              onClick={() => onAudioFocusChange && onAudioFocusChange(mode.id)}
              title={mode.desc}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
