'use client';
import React, { useRef, useEffect, useCallback } from 'react';

/**
 * WaveformDisplay — Minimalist Monochrome Waveform
 * Clean visual waveform with click-to-seek, beat ticks,
 * chord boundaries, and responsive rendering.
 */
export default React.memo(function WaveformDisplay({
  waveform,        // Float32Array or number[] — amplitude bins
  currentTime,     // Current playback position in seconds
  duration,        // Total audio duration in seconds
  chords,          // Array of { time, chord, confidence }
  beats,           // Array of beat timestamps
  sections,        // Array of { label, startTime, endTime }
  isPlaying,
  onSeek,          // Callback: (timeInSeconds) => void
  timeSignature = 4,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

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
        ctx.fillStyle = s % 2 === 0 ? 'rgba(0, 0, 0, 0.02)' : 'rgba(0, 0, 0, 0.04)';
        ctx.fillRect(x1, 0, x2 - x1, h);

        // Section label
        ctx.fillStyle = '#71717a';
        ctx.font = '600 10px var(--font-mono, monospace)';
        ctx.fillText(section.label, x1 + 5, 12);
      }
    }

    // Draw waveform bars with subtle alternating tonal separation by chord
    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * w;
      const amp = waveform[i];
      const barH = Math.max(1.5, amp * (h * 0.82));
      const time = (i / waveform.length) * duration;

      // Find which chord index this corresponds to
      let chordIdx = 0;
      if (chords && chords.length > 0) {
        for (let c = chords.length - 1; c >= 0; c--) {
          if (time >= chords[c].time) {
            chordIdx = c;
            break;
          }
        }
      }

      const isPlayed = x <= playheadX;
      if (isPlayed) {
        // Tonal monochrome played styling
        ctx.fillStyle = chordIdx % 2 === 0 ? '#18181b' : '#27272a';
      } else {
        // Tonal monochrome upcoming styling
        ctx.fillStyle = chordIdx % 2 === 0 ? '#d4d4d8' : '#e4e4e7';
      }

      ctx.fillRect(x, centerY - barH / 2, Math.max(barWidth - 0.4, 0.6), barH);
    }

    // Draw beat ticks
    if (beats && beats.length > 0 && duration > 0) {
      for (let i = 0; i < beats.length; i++) {
        const x = (beats[i] / duration) * w;
        const isDownbeat = i % timeSignature === 0;

        ctx.strokeStyle = isDownbeat ? 'rgba(9, 9, 11, 0.22)' : 'rgba(9, 9, 11, 0.07)';
        ctx.lineWidth = isDownbeat ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, isDownbeat ? 0 : h * 0.3);
        ctx.lineTo(x, isDownbeat ? h : h * 0.7);
        ctx.stroke();
      }
    }

    // Draw clean monochrome playhead
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Playhead top/bottom pips
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(playheadX, 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(playheadX, h - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [waveform, currentTime, duration, chords, beats, sections, timeSignature, updateCanvasDimensions]);

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

  return (
    <div
      ref={containerRef}
      className="waveform-container"
      onClick={handlePointer}
      role="slider"
      aria-label="Audio waveform timeline"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      tabIndex={0}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});
