"use client";

import React from 'react';
import { Settings2, Guitar, Gauge } from 'lucide-react';

export default function SettingsBar({
  transpose,
  onTransposeChange,
  difficulty,
  onDifficultyChange,
  capoFret,
  playbackRate,
  onPlaybackRateChange,
}) {
  return (
    <div className="grid-3" style={{ marginBottom: '1.25rem' }}>
      {/* Transpose Card */}
      <div className="settings-card">
        <div className="card-header">
          <Settings2 size={16} />
          <h4>Transpose</h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => onTransposeChange(transpose - 1)}
            style={{ width: 32, height: 32, padding: 0 }}
            aria-label="Transpose down one semitone"
          >
            −
          </button>
          <span style={{
            fontSize: '1.2rem',
            fontWeight: 700,
            minWidth: '42px',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            color: transpose === 0 ? 'var(--foreground-muted)' : 'var(--foreground)'
          }}>
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => onTransposeChange(transpose + 1)}
            style={{ width: 32, height: 32, padding: 0 }}
            aria-label="Transpose up one semitone"
          >
            +
          </button>
        </div>
        <p className="card-desc">Shift pitch in semitone intervals.</p>
      </div>

      {/* Fretboard Voicing Card */}
      <div className="settings-card">
        <div className="card-header">
          <Guitar size={16} />
          <h4>Fretboard Voicing</h4>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {['easy', 'intermediate', 'hard'].map((level) => (
            <button
              key={level}
              id={`difficulty-${level}`}
              className={`btn ${difficulty === level ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onDifficultyChange(level)}
              style={{ textTransform: 'capitalize', fontSize: '0.75rem', padding: '5px 9px' }}
            >
              {level}
            </button>
          ))}
        </div>
        <p className="card-desc">
          {difficulty === 'easy'
            ? (capoFret > 0 ? `Capo ${capoFret} active for open chords.` : 'Open chord shapes prioritized.')
            : difficulty === 'intermediate'
            ? 'Standard triad shapes.'
            : 'Full seventh & suspension voicings.'}
        </p>
      </div>

      {/* Speed Adjustment Card */}
      <div className="settings-card">
        <div className="card-header">
          <Gauge size={16} />
          <h4>Speed</h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => onPlaybackRateChange(Math.max(0.25, playbackRate - 0.25))}
            style={{ width: 32, height: 32, padding: 0 }}
            aria-label="Decrease playback speed"
          >
            −
          </button>
          <span style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            minWidth: '48px',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            color: playbackRate === 1.0 ? 'var(--foreground-muted)' : 'var(--foreground)'
          }}>
            {playbackRate.toFixed(2)}x
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => onPlaybackRateChange(Math.min(2.0, playbackRate + 0.25))}
            style={{ width: 32, height: 32, padding: 0 }}
            aria-label="Increase playback speed"
          >
            +
          </button>
        </div>
        <p className="card-desc">Practice at adjusted tempo.</p>
      </div>
    </div>
  );
}
