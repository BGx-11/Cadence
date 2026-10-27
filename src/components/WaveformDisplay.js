'use client';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { isDownbeat } from '@/lib/musicTheory';

function formatSec(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * WaveformDisplay — Minimalist Monochrome Waveform
 * Clean visual waveform with click-to-seek, beat ticks,
 * chord boundaries, loop bracket handles, and hover inspection.
 */
export default React.memo(function WaveformDisplay({
  waveform,        // Float32Array or number[] — amplitude bins
  currentTime,     // Current playback position in seconds
  duration,        // Total audio duration in seconds
  chords,          // Array of { time, chord, confidence }
  beats,           // Array of beat timestamps
  sections,        // Array of { label, startTime, endTime }
  loopEnabled = false,
  loopStart = 0,
  loopEnd = 0,
  isPlaying,
  onSeek,          // Callback: (timeInSeconds) => void
  timeSignature = 4,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const [hoverData, setHoverData] = useState(null); // { x, time, chord, section }

  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w > 0 && h > 0 && (w !== sizeRef.current.w || h !== sizeRef.current.h || dpr !== sizeRef.current.dpr)) {
      sizeRef.current = { w, h, dpr };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform || waveform.length === 0) return;

    updateCanvasDimensions();
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const centerY = h / 2;
    const barWidth = Math.max(1, w / waveform.length);
    const playheadX = duration > 0 ? (currentTime / duration) * w : 0;

    // Draw subtle section backgrounds
    if (sections && sections.length > 0) {
      for (let s = 0; s < sections.length; s++) {
        const section = sections[s];
        const x1 = (section.startTime / duration) * w;
        const x2 = (section.endTime / duration) * w;
        ctx.fillStyle = s % 2 === 0 ? 'rgba(0, 0, 0, 0.015)' : 'rgba(0, 0, 0, 0.035)';
        ctx.fillRect(x1, 0, x2 - x1, h);

        // Section label
        ctx.fillStyle = '#9ca3af';
        ctx.font = '600 10px var(--font-mono, monospace)';
        ctx.fillText(section.label, x1 + 5, 12);
      }
    }

    // Draw waveform bars with subtle alternating tonal separation by chord
    let chordIdx = 0;
    const numChords = chords ? chords.length : 0;

    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * w;
      const amp = waveform[i];
      const barH = Math.max(1.5, amp * (h * 0.82));
      const time = (i / waveform.length) * duration;

      // Monotonically advance chord index in O(1) amortized time
      while (chordIdx < numChords - 1 && time >= chords[chordIdx + 1].time) {
        chordIdx++;
      }

      const isPlayed = x <= playheadX;
      if (isPlayed) {
        // Deep crisp charcoal for played audio
        ctx.fillStyle = chordIdx % 2 === 0 ? '#111827' : '#374151';
      } else {
        // Soft muted gray for upcoming audio
        ctx.fillStyle = chordIdx % 2 === 0 ? '#e5e7eb' : '#d1d5db';
      }

      ctx.fillRect(x, centerY - barH / 2, Math.max(barWidth - 0.4, 0.8), barH);
    }

    // Draw beat ticks
    if (beats && beats.length > 0 && duration > 0) {
      for (let i = 0; i < beats.length; i++) {
        const x = (beats[i] / duration) * w;
        const downbeat = isDownbeat(i, timeSignature);

        ctx.strokeStyle = downbeat ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = downbeat ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, downbeat ? 0 : h * 0.3);
        ctx.lineTo(x, downbeat ? h : h * 0.7);
        ctx.stroke();
      }
    }

    // Draw loop region highlight and handles (Orbiter style)
    if (loopEnabled && loopEnd > loopStart && duration > 0) {
      const xStart = Math.max(0, Math.min(w, (loopStart / duration) * w));
      const xEnd = Math.max(0, Math.min(w, (loopEnd / duration) * w));
      const loopW = Math.max(2, xEnd - xStart);

      // Shaded loop window
      ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
      ctx.fillRect(xStart, 0, loopW, h);

      // Boundary brackets [ and ]
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;

      // In-bracket [
      ctx.beginPath();
      ctx.moveTo(xStart, 0);
      ctx.lineTo(xStart, h);
      ctx.moveTo(xStart, 0);
      ctx.lineTo(xStart + 5, 0);
      ctx.moveTo(xStart, h);
      ctx.lineTo(xStart + 5, h);
      ctx.stroke();

      // Out-bracket ]
      ctx.beginPath();
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd, h);
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd - 5, 0);
      ctx.moveTo(xEnd, h);
      ctx.lineTo(xEnd - 5, h);
      ctx.stroke();

      // Small loop badge
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 9px var(--font-mono, monospace)';
      ctx.fillText('LOOP', xStart + 4, 11);
    }

    // Draw clean minimalist playhead
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Playhead top/bottom pips
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(playheadX, 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(playheadX, h - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [waveform, currentTime, duration, chords, beats, sections, loopEnabled, loopStart, loopEnd, timeSignature, updateCanvasDimensions]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      updateCanvasDimensions();
      draw();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateCanvasDimensions, draw]);

  // Click / Drag to seek
  const handlePointer = useCallback((e) => {
    if (!containerRef.current || !duration || !onSeek) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / rect.width;
    onSeek(ratio * duration);
  }, [duration, onSeek]);

  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current || !duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const time = (x / rect.width) * duration;

    // Find chord at cursor
    let chordName = '';
    if (chords && chords.length > 0) {
      for (let i = chords.length - 1; i >= 0; i--) {
        if (time >= chords[i].time) {
          chordName = chords[i].chord;
          break;
        }
      }
    }

    // Find section at cursor
    let sectionLabel = '';
    if (sections && sections.length > 0) {
      const sec = sections.find(s => time >= s.startTime && time < s.endTime);
      if (sec) sectionLabel = sec.label;
    }

    setHoverData({ x, time, chord: chordName, section: sectionLabel });
  }, [duration, chords, sections]);

  const handleMouseLeave = useCallback(() => {
    setHoverData(null);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (!duration || !onSeek) return;
    const step = 5; // 5-second scrub step
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onSeek(Math.min(duration, currentTime + step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSeek(duration);
    }
  }, [duration, currentTime, onSeek]);

  return (
    <div
      ref={containerRef}
      className="waveform-container"
      onClick={handlePointer}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      role="slider"
      aria-label="Audio waveform timeline"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      tabIndex={0}
      style={{ position: 'relative' }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Ghost hover playhead line */}
      {hoverData && (
        <div
          style={{
            position: 'absolute',
            left: `${hoverData.x}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--foreground)',
            opacity: 0.35,
            pointerEvents: 'none',
            zIndex: 3
          }}
        />
      )}

      {/* Floating hover inspection pill */}
      {hoverData && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(50, Math.min((sizeRef.current.w || 300) - 50, hoverData.x))}px`,
            top: '-23px',
            transform: 'translateX(-50%)',
            background: 'var(--foreground)',
            color: '#ffffff',
            padding: '2px 7px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>{formatSec(hoverData.time)}</span>
          {hoverData.chord && <span style={{ opacity: 0.5 }}>•</span>}
          {hoverData.chord && <span style={{ color: '#93c5fd' }}>{hoverData.chord}</span>}
          {hoverData.section && <span style={{ opacity: 0.5 }}>•</span>}
          {hoverData.section && <span style={{ opacity: 0.85 }}>{hoverData.section}</span>}
        </div>
      )}
    </div>
  );
});
