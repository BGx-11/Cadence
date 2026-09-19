import React from 'react';

/**
 * Visualizer — Minimalist Metronome & Rhythm Pulse
 * Synchronous, zero-render-cascade beat tracking in sleek monochrome.
 */
export default function Visualizer({ beats, beatStrengths, currentTime, isPlaying, bpm, timeSignature = 4 }) {
  // Pure derivation of current beat index via binary search (zero React state/effect overhead)
  let activeBeatIndex = -1;
  if (isPlaying && beats && beats.length > 0) {
    let lo = 0, hi = beats.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (beats[mid] <= currentTime) {
        activeBeatIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  }

  const measureBeat = activeBeatIndex >= 0 ? (activeBeatIndex % timeSignature) : -1;

  // Onset strength
  const currentStrength = activeBeatIndex >= 0 && beatStrengths && beatStrengths[activeBeatIndex]
    ? beatStrengths[activeBeatIndex]
    : 0.5;

  // Progress within current beat
  let beatProgress = 0;
  if (activeBeatIndex >= 0 && beats && activeBeatIndex < beats.length) {
    const beatStart = beats[activeBeatIndex];
    const beatEnd = activeBeatIndex < beats.length - 1 ? beats[activeBeatIndex + 1] : beatStart + 0.5;
    beatProgress = Math.max(0, Math.min(1, (currentTime - beatStart) / Math.max(0.001, beatEnd - beatStart)));
  }

  // Pendulum swing angle
  const pendulumAngle = isPlaying ? Math.sin(beatProgress * Math.PI) * 22 * (measureBeat % 2 === 0 ? 1 : -1) : 0;

  return (
    <div className="metronome-container">
      {/* Minimalist Pendulum Indicator */}
      <div className="pendulum-wrapper">
        <div
          className="pendulum-arm"
          style={{
            transform: `rotate(${pendulumAngle}deg)`,
            transition: isPlaying ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          <div
            className="pendulum-weight"
            style={{
              background: measureBeat === 0 ? 'var(--foreground)' : 'var(--foreground-muted)',
              transform: `scale(${isPlaying ? 0.95 + currentStrength * 0.2 : 1})`,
            }}
          />
        </div>
        <div className="pendulum-pivot" />
      </div>

      {/* BPM Readout */}
      {bpm > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '55px' }}>
          <span
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: isPlaying ? 'var(--foreground)' : 'var(--foreground-dim)',
              lineHeight: 1,
              fontFamily: 'var(--font-mono, monospace)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {bpm}
          </span>
          <span
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--foreground-dim)',
              marginTop: 3,
            }}
          >
            BPM
          </span>
        </div>
      )}

      {/* Divider */}
      {bpm > 0 && <div className="metronome-divider" />}

      {/* Beat Dots */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {Array.from({ length: timeSignature }).map((_, dotIndex) => {
          const isActive = measureBeat === dotIndex;
          const isDownbeat = dotIndex === 0;

          return (
            <div
              key={dotIndex}
              className={`beat-dot${isActive ? ' active' : ''}${isActive && isDownbeat ? ' downbeat' : ''}`}
            >
              {dotIndex + 1}
            </div>
          );
        })}
      </div>

      {/* Time Signature */}
      <div
        style={{
          marginLeft: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: '24px',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--foreground-muted)',
            lineHeight: 1,
            borderBottom: '1px solid var(--border)',
            paddingBottom: '1px',
          }}
        >
          {timeSignature}
        </span>
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--foreground-muted)',
            lineHeight: 1.2,
          }}
        >
          4
        </span>
      </div>

      {/* Status Badge */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isPlaying ? 'var(--foreground)' : 'var(--border-bright)',
            transition: 'background 0.2s ease',
          }}
        />
        <span
          style={{
            fontWeight: 600,
            fontSize: '0.65rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isPlaying ? 'var(--foreground)' : 'var(--foreground-dim)',
          }}
        >
          {isPlaying ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>
    </div>
  );
}
