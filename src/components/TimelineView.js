"use client";

import React from 'react';
import { Music } from 'lucide-react';
import NowPlayingHero from '@/components/NowPlayingHero';
import ChordChart from '@/components/ChordChart';

export default function TimelineView({
  processedChords,
  activeChordIndex,
  activeChord,
  nextChord,
  timeUntilNextChord,
  activeChordBeats,
  analysisResult,
  currentTime,
  duration,
  isPlaying,
  difficulty,
  capoFret,
  PX_PER_SEC,
  beatsTrackRef,
  timelineTrackRef,
  onSeek,
  formatTime,
}) {
  return (
    <div className="glass-panel">
      <div className="section-header" style={{ marginBottom: '0.75rem' }}>
        <div className="icon-circle">
          <Music size={14} />
        </div>
        <h3>Progression Timeline</h3>
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

      {/* Now Playing Live Hero Display */}
      {activeChord && (
        <NowPlayingHero
          activeChord={activeChord}
          nextChord={nextChord}
          timeUntilNextChord={timeUntilNextChord}
          activeChordBeats={activeChordBeats}
          currentTime={currentTime}
          isPlaying={isPlaying}
          formatTime={formatTime}
        />
      )}

      {/* Synchronized Timeline Container */}
      <div className="chord-timeline-container" id="chord-timeline">
        {/* Fixed Center Playhead */}
        <div className="chord-playhead" />

        {/* Beat markers track */}
        <div
          ref={beatsTrackRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            height: '100%',
            transform: `translateX(-${currentTime * PX_PER_SEC}px)`,
            transition: isPlaying ? 'none' : 'transform 0.2s ease-out',
            pointerEvents: 'none',
            zIndex: 5
          }}
        >
          {analysisResult?.beats && analysisResult.beats.map((beat, i) => {
            const ts = analysisResult.timeSignature || 4;
            const isDownbeat = i % ts === 0;
            return (
              <div
                key={`beat-${i}`}
                style={{
                  position: 'absolute',
                  left: `${beat * PX_PER_SEC}px`,
                  top: 0,
                  width: isDownbeat ? '1.5px' : '1px',
                  height: isDownbeat ? '100%' : '18%',
                  background: isDownbeat
                    ? 'rgba(9, 9, 11, 0.15)'
                    : 'rgba(9, 9, 11, 0.06)',
                  transformOrigin: 'top',
                }}
              />
            );
          })}
        </div>

        {/* Chord cards track */}
        <div
          ref={timelineTrackRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            height: '100%',
            transform: `translateX(-${currentTime * PX_PER_SEC}px)`,
            transition: isPlaying ? 'none' : 'transform 0.2s ease-out'
          }}
        >
          {processedChords.map((c, i) => {
            const nextTime = i < processedChords.length - 1 ? processedChords[i + 1].time : (duration || c.time + 4);
            const chordDuration = c.duration || (nextTime - c.time);
            const width = Math.max(chordDuration * PX_PER_SEC - 4, 32);
            const leftPos = c.time * PX_PER_SEC;
            const isActive = i === activeChordIndex;
            const isPast = c.time + chordDuration < currentTime;
            const progress = isActive
              ? Math.max(0, Math.min(100, ((currentTime - c.time) / chordDuration) * 100))
              : 0;

            const chordBeats = (analysisResult?.beats || []).filter(
              (b) => b >= c.time - 0.05 && b < nextTime - 0.05
            );

            return (
              <div
                key={i}
                className={`chord-card ${isActive ? 'active' : isPast ? 'past' : 'upcoming'}`}
                style={{
                  left: `${leftPos}px`,
                  width: `${width}px`,
                  height: '230px',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer'
                }}
                onClick={() => onSeek(c.time)}
                title={`Click to seek to ${c.chord} at ${formatTime(c.time)}`}
              >
                {/* Active progress fill line */}
                {isActive && (
                  <div className="chord-progress-fill" style={{ width: `${progress}%` }} />
                )}

                <div className="chord-card-inner">
                  {/* Leading edge header */}
                  <div className="chord-card-header">
                    <span className="chord-card-name">{c.chord}</span>
                    <span className="chord-card-time">{formatTime(c.time)}</span>
                  </div>

                  {/* Beat dots if card width allows */}
                  {chordBeats.length > 0 && width >= 75 && (
                    <div className="chord-card-beats">
                      {chordBeats.map((bt, bIdx) => {
                        const isPastBeat = currentTime >= bt;
                        return (
                          <span
                            key={bIdx}
                            className={`chord-beat-dot ${isPastBeat ? 'filled' : ''}`}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Chord diagram if width allows */}
                  {width >= 90 && (
                    <div className="chord-card-diagram">
                      <ChordChart chordName={c.chord} width={Math.min(110, width - 16)} height={135} />
                    </div>
                  )}

                  {/* Card footer */}
                  <div className="chord-card-footer">
                    <span>{chordDuration.toFixed(1)}s</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
