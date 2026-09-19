"use client";

import React from 'react';
import { Repeat } from 'lucide-react';

export default function SectionMarkers({
  sections,
  currentTime,
  loopEnabled,
  loopStart,
  loopEnd,
  onSectionClick,
  onClearLoop,
  formatTime,
}) {
  if (!sections || sections.length <= 1) return null;

  return (
    <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
      <div className="section-header" style={{ marginBottom: '0.75rem' }}>
        <div className="icon-circle">
          <Repeat size={14} />
        </div>
        <h3>Song Sections</h3>
        {loopEnabled && (
          <button
            className="btn btn-secondary"
            onClick={onClearLoop}
            style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '3px 8px' }}
          >
            Clear Loop
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {sections.map((section, i) => {
          const isActiveSection = currentTime >= section.startTime && currentTime < section.endTime;
          const isLooped = loopEnabled && loopStart === section.startTime && loopEnd === section.endTime;
          return (
            <button
              key={i}
              className={`section-pill ${isActiveSection ? 'active' : ''} ${isLooped ? 'looped' : ''}`}
              onClick={() => onSectionClick(section)}
            >
              <span className="section-label">{section.label}</span>
              <span className="section-time">
                {formatTime(section.startTime)} – {formatTime(section.endTime)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
