"use client";

import React from 'react';
import { Volume2 } from 'lucide-react';
import ChordChart from '@/components/ChordChart';
import { playChordStrum } from '@/lib/audioSynth';

export default function NowPlayingHero({
  activeChord,
  nextChord,
  timeUntilNextChord,
  activeChordBeats,
  currentTime,
  isPlaying,
  formatTime,
  leftHanded = false,
}) {
  if (!activeChord) return null;

  return (
    <div className="now-playing-hero">
      {/* Active Chord Focus */}
      <div className="now-playing-current">
        <div className="now-playing-header">
          <span className="live-indicator">
            <span
              className="live-dot"
              style={{
                opacity: isPlaying ? 1 : 0.45,
                animation: isPlaying ? 'pulse-dot 1.2s ease-in-out infinite' : 'none'
              }}
            />
            {isPlaying ? 'LIVE CHORD' : 'ACTIVE CHORD'}
          </span>
          <span className="now-playing-timing">
            {formatTime(activeChord.time)} – {formatTime(activeChord.time + (activeChord.duration || 4))}
          </span>
        </div>

        <div className="now-playing-main">
          <div className="now-playing-symbol-box">
            <h2 className="now-playing-chord" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span>{activeChord.chord}</span>
              {activeChord.romanNumeral && (
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--foreground-muted)',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 7px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    letterSpacing: '0.04em'
                  }}
                  title="Roman numeral harmonic degree relative to song key"
                >
                  {activeChord.romanNumeral}
                </span>
              )}
              <button
                className="btn btn-secondary"
                style={{
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  gap: '4px',
                  borderRadius: 'var(--radius-sm)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  playChordStrum(activeChord.chord);
                }}
                title="Audition chord: click to hear acoustic strum"
              >
                <Volume2 size={11} />
                <span>Strum</span>
              </button>
            </h2>
            {activeChord.originalChord && activeChord.originalChord !== activeChord.chord && (
              <span style={{
                display: 'inline-block',
                fontSize: '0.75rem',
                color: 'var(--foreground-muted)',
                fontWeight: 500,
                marginTop: '-2px',
                marginBottom: '4px'
              }}>
                approx. of {activeChord.originalChord}
              </span>
            )}

            {/* Synchronized beat dots */}
            {activeChordBeats.length > 0 && (
              <div className="now-playing-beats">
                {activeChordBeats.map((bt, bIdx) => {
                  const isPastBeat = currentTime >= bt;
                  const isCurrentBeat = isPlaying && currentTime >= bt && (
                    bIdx === activeChordBeats.length - 1 || currentTime < activeChordBeats[bIdx + 1]
                  );
                  return (
                    <span
                      key={bIdx}
                      className={`now-playing-beat-dot ${isCurrentBeat ? 'current' : isPastBeat ? 'filled' : ''}`}
                      title={`Beat ${bIdx + 1}: ${formatTime(bt)}`}
                    />
                  );
                })}
              </div>
            )}

            <div className="now-playing-meta">
              <span>{(activeChord.duration || 4).toFixed(1)}s duration</span>
              {activeChord.confidence && (
                <span>• {Math.round(activeChord.confidence * 100)}% match</span>
              )}
            </div>
          </div>

          <div
            className="now-playing-diagram"
            onClick={() => playChordStrum(activeChord.chord)}
            style={{ cursor: 'pointer' }}
            title="Click diagram to hear acoustic strum"
          >
            <ChordChart chordName={activeChord.chord} width={120} height={145} leftHanded={leftHanded} />
          </div>
        </div>
      </div>

      {/* Upcoming Chord Preview */}
      {nextChord && (
        <div className="now-playing-next">
          <div className="now-playing-next-header">
            <span className="next-label">UPCOMING</span>
            <span className="next-countdown">
              in {timeUntilNextChord.toFixed(1)}s
            </span>
          </div>
          <div className="now-playing-next-content">
            <div className="next-chord-name">{nextChord.chord}</div>
            <div
              className="next-chord-diagram"
              onClick={() => playChordStrum(nextChord.chord)}
              style={{ cursor: 'pointer' }}
              title="Click upcoming chord to hear acoustic strum"
            >
              <ChordChart chordName={nextChord.chord} width={85} height={105} leftHanded={leftHanded} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
