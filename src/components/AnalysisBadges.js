"use client";

import React from 'react';

export default function AnalysisBadges({ analysisResult, uniqueChords }) {
  if (!analysisResult) return null;

  return (
    <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
      <div className="info-badge">
        <span className="badge-label">Key</span>
        <span className="badge-value">{analysisResult.key}</span>
      </div>
      <div className="info-badge">
        <span className="badge-label">BPM</span>
        <span className="badge-value">{analysisResult.bpm || '—'}</span>
      </div>
      <div className="info-badge">
        <span className="badge-label">Meter</span>
        <span className="badge-value">{analysisResult.timeSignature || 4}/4</span>
      </div>
      <div className="info-badge">
        <span className="badge-label">Chords</span>
        <span className="badge-value">{uniqueChords}</span>
      </div>
    </div>
  );
}
