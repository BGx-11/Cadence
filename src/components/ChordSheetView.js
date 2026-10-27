"use client";

import React, { useState } from 'react';
import { Music, Copy, Download, Check } from 'lucide-react';
import { formatPracticeChartText } from '@/lib/musicTheory';

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
  audioFile,
}) {
  const [copied, setCopied] = useState(false);

  const getChartText = () => {
    return formatPracticeChartText({
      title: audioFile?.name || 'Untitled Song',
      key: analysisResult?.key,
      bpm: analysisResult?.bpm,
      timeSignature: analysisResult?.timeSignature,
      capoFret: difficulty === 'easy' ? capoFret : 0,
      sections: analysisResult?.sections,
      chords: processedChords
    });
  };

  const handleCopy = () => {
    const text = getChartText();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const text = getChartText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanName = (audioFile?.name || 'chord-chart').replace(/\.[^/.]+$/, '');
    a.download = `${cleanName}-chords.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel">
      <div className="section-header" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="icon-circle">
            <Music size={14} />
          </div>
          <h3>Chord Sheet</h3>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {difficulty === 'easy' && capoFret > 0 && (
            <span style={{
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
          <button
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px' }}
            onClick={handleCopy}
            title="Copy formatted chord practice chart to clipboard"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px' }}
            onClick={handleDownload}
            title="Download offline chord chart (.txt)"
          >
            <Download size={11} />
            <span>Download</span>
          </button>
        </div>
      </div>
      <div className="chord-sheet">
        {processedChords.map((c, i) => {
          const nextTime = i < processedChords.length - 1 ? processedChords[i + 1].time : duration;
          const chordDuration = nextTime - c.time;
          const isActive = i === activeChordIndex;
          const isPast = c.time + chordDuration < currentTime;
          const ts = analysisResult?.timeSignature?.numerator || analysisResult?.timeSignature || 4;

          const beatsInChord = analysisResult?.beats
            ? analysisResult.beats.filter((b) => b >= c.time - 0.05 && b < nextTime - 0.05).length
            : Math.round(chordDuration * ((analysisResult?.bpm || 120) / 60));

          const beatIdx = analysisResult?.beats
            ? analysisResult.beats.findIndex((b) => Math.abs(b - c.time) < 0.1)
            : -1;
          const isNewMeasure = beatIdx >= 0 && beatIdx % ts === 0;

          return (
            <button
              key={`${c.chord}-${c.time}`}
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
