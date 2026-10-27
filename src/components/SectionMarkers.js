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
    <div className="sections-strip">
      <div className="sections-strip-header">
        <span className="sections-strip-title">
          <Repeat size={12} />
          <span>Sections</span>
        </span>
        {loopEnabled && (
          <button
            className="clear-loop-btn"
            onClick={onClearLoop}
            title="Disable active section loop"
          >
            Clear Loop
          </button>
        )}
      </div>
      <div className="sections-pill-list">
        {sections.map((section, i) => {
          const isActiveSection = currentTime >= section.startTime && currentTime < section.endTime;
          const isLooped = loopEnabled && loopStart === section.startTime && loopEnd === section.endTime;
          return (
            <button
              key={i}
              className={`section-pill ${isActiveSection ? 'active' : ''} ${isLooped ? 'looped' : ''}`}
              onClick={() => onSectionClick(section)}
              title={`Loop ${section.label} (${formatTime(section.startTime)} – ${formatTime(section.endTime)})`}
            >
              <span className="section-label">{section.label}</span>
              <span className="section-time">
                {formatTime(section.startTime)}–{formatTime(section.endTime)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
