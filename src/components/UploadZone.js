"use client";

import React from 'react';
import { UploadCloud, Music2, Loader2 } from 'lucide-react';

const SAMPLE_TRACKS = [
  { name: 'Ed Sheeran – Perfect', file: '/songs/02_Ed_Sheeran_Perfect.mp3' },
  { name: 'The Animals – House of the Rising Sun', file: '/songs/03_House_Of_The_Rising_Sun.mp3' },
  { name: 'Guns N\' Roses – Sweet Child O\' Mine', file: '/songs/04_Sweet_Child_O_Mine.mp3' },
];

export default function UploadZone({ onFileSelected }) {
  const [loadingTrack, setLoadingTrack] = React.useState(null);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) onFileSelected(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = '';
  };

  const loadSampleTrack = async (sample) => {
    if (loadingTrack) return;
    setLoadingTrack(sample.name);
    try {
      const res = await fetch(sample.file);
      if (!res.ok) {
        throw new Error(`Track not found on server (${res.status} ${res.statusText}). Ensure public/songs are committed and deployed.`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('Server returned an HTML page instead of an audio file.');
      }
      const blob = await res.blob();
      const file = new File([blob], `${sample.name}.mp3`, { type: 'audio/mpeg' });
      onFileSelected(file);
    } catch (err) {
      console.error('Error loading sample track:', err);
      alert(`Could not load demo track: ${err.message}`);
    } finally {
      setLoadingTrack(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div
        className="upload-zone"
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="audio/*"
          onChange={handleInputChange}
          id="audio-upload"
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          aria-label="Upload audio file"
        />
        <UploadCloud size={48} color="var(--foreground)" style={{ marginBottom: '0.85rem' }} />
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Select audio file</h2>
        <p style={{ color: 'var(--foreground-muted)', fontSize: '0.875rem' }}>
          Drop any track or <span style={{ textDecoration: 'underline', fontWeight: 600, color: 'var(--foreground)' }}>browse</span>
        </p>
        <p style={{ color: 'var(--foreground-dim)', fontSize: '0.75rem', marginTop: '1rem', fontFamily: 'var(--font-mono)' }}>
          MP3, WAV, FLAC, OGG, AAC
        </p>
      </div>

      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--foreground-dim)', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Or try a sample track
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {SAMPLE_TRACKS.map((track, i) => (
            <button
              key={i}
              className="btn btn-secondary"
              onClick={() => loadSampleTrack(track)}
              disabled={!!loadingTrack}
              style={{
                fontSize: '0.75rem',
                padding: '6px 12px',
                opacity: loadingTrack && loadingTrack !== track.name ? 0.5 : 1,
                cursor: loadingTrack ? 'not-allowed' : 'pointer'
              }}
            >
              {loadingTrack === track.name ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Music2 size={13} />
              )}
              {loadingTrack === track.name ? 'Loading...' : track.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
