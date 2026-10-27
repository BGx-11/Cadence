"use client";

import React from 'react';
import { Music, RefreshCw } from 'lucide-react';
import { formatTimeSignature } from '@/lib/musicTheory';

export default function Header({
  audioFile,
  analysisResult,
  uniqueChords,
  onResetTrack
}) {
  if (audioFile) {
    return (
      <header className="studio-topbar">
        <div className="studio-topbar-brand">
          <div className="logo-box">
            <Music size={15} color="#ffffff" />
          </div>
          <span className="brand-name">Cadence</span>
          <span className="topbar-divider" />
          <span className="track-title" title={audioFile.name}>
            {audioFile.name}
          </span>
        </div>

        <div className="studio-topbar-meta">
          {analysisResult && (
            <div className="topbar-badges">
              <span className="topbar-badge" title="Detected Musical Key">
                <span className="topbar-badge-label">KEY</span>
                <span className="topbar-badge-val">{analysisResult.key}</span>
              </span>
              <span className="topbar-badge" title="Detected Tempo">
                <span className="topbar-badge-label">BPM</span>
                <span className="topbar-badge-val">{analysisResult.bpm || '—'}</span>
              </span>
              <span className="topbar-badge" title="Time Signature">
                <span className="topbar-badge-label">METER</span>
                <span className="topbar-badge-val">{formatTimeSignature(analysisResult.timeSignature)}</span>
              </span>
              <span className="topbar-badge" title="Unique Chords Count">
                <span className="topbar-badge-label">CHORDS</span>
                <span className="topbar-badge-val">{uniqueChords}</span>
              </span>
            </div>
          )}

          {onResetTrack && (
            <button
              className="btn btn-secondary topbar-reset-btn"
              onClick={onResetTrack}
              id="change-song-btn"
              title="Open or upload a new audio file"
            >
              <RefreshCw size={12} />
              <span>New Track</span>
            </button>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="flex-center" style={{ flexDirection: 'column', textAlign: 'center', marginBottom: '2.25rem', paddingTop: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div className="logo-box" style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Music size={18} color="#ffffff" />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--foreground)' }}>
          Cadence
        </h1>
      </div>
      <p className="subtitle" style={{ color: 'var(--foreground-muted)', fontSize: '0.925rem', maxWidth: '480px', lineHeight: 1.45, marginBottom: 0 }}>
        Instant chord recognition, 96 guitar voicings, and real-time rehearsal studio.
      </p>
    </header>
  );
}
