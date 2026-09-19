"use client";

import React from 'react';
import { Music } from 'lucide-react';

export default function ChordSheetView({
  processedChords,
  activeChordIndex,
  analysisResult,
  currentTime,
  duration,
  difficulty,
  capoFret,
  onSeek,
  formatTime,
}) {
  return (
    <div className="glass-panel">
      <div className="section-header" style={{ marginBottom: '0.75rem' }}>
        <div className="icon-circle">
          <Music size={14} />
        </div>
        <h3>Chord Sheet</h3>
        {difficulty === 'easy' && capoFret > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.7rem',
            padding: '2px 8px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600
          }}>
            Capo {capoFret}
          </span>
        )}
      </div>
      <div className="chord-sheet">
        {processedChords.map((c, i) => {
          const nextTime = i < processedChords.length - 1 ? processedChords[i + 1].time : duration;
          const chordDuration = nextTime - c.time;
          const isActive = i === activeChordIndex;
          const isPast = c.time + chordDuration < currentTime;
          const ts = analysisResult?.timeSignature || 4;

          const beatsInChord = analysisResult?.beats
            ? analysisResult.beats.filter((b) => b >= c.time && b < nextTime).length
            : Math.round(chordDuration * ((analysisResult?.bpm || 120) / 60));

          const beatIdx = analysisResult?.beats
            ? analysisResult.beats.findIndex((b) => Math.abs(b - c.time) < 0.1)
            : -1;
          const isNewMeasure = beatIdx >= 0 && beatIdx % ts === 0;

          return (
            <button
              key={i}
              className={`chord-sheet-item ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isNewMeasure ? 'measure-start' : ''}`}
              onClick={() => onSeek(c.time)}
              title={`Click to jump to ${c.chord} at ${formatTime(c.time)}`}
            >
              <span className="chord-name">{c.chord}</span>
              <span className="chord-beats">
                {'● '.repeat(Math.min(beatsInChord, 8)).trim()}
              </span>
              <span className="chord-time">{formatTime(c.time)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
