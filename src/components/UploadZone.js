"use client";

import React, { useState } from 'react';
import { UploadCloud, Music, Sparkles, Disc3, Loader2, ArrowRight } from 'lucide-react';
import * as Tone from 'tone';

const SAMPLE_TRACKS = [
  {
    title: 'Perfect',
    artist: 'Ed Sheeran',
    file: '/songs/02_Ed_Sheeran_Perfect.mp3',
    key: 'Ab Maj',
    bpm: '95 BPM',
    color: '#f59e0b',
  },
  {
    title: 'House of the Rising Sun',
    artist: 'The Animals',
    file: '/songs/03_House_Of_The_Rising_Sun.mp3',
    key: 'A min',
    bpm: '118 BPM',
    color: '#38bdf8',
  },
  {
    title: 'Sweet Child O\' Mine',
    artist: 'Guns N\' Roses',
    file: '/songs/04_Sweet_Child_O_Mine.mp3',
    key: 'Db Maj',
    bpm: '125 BPM',
    color: '#a855f7',
  },
  {
    title: 'Take Me Home, Country Roads',
    artist: 'John Denver',
    file: '/songs/05_Take_Me_Home_Country_Roads.mp3',
    key: 'A Maj',
    bpm: '82 BPM',
    color: '#10b981',
  },
];

export default function UploadZone({ onFileSelected }) {
  const [loadingTrack, setLoadingTrack] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      try { Tone.start(); } catch (_) {}
      onFileSelected(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try { Tone.start(); } catch (_) {}
      onFileSelected(file);
    }
    e.target.value = '';
  };

  const loadSampleTrack = async (sample) => {
    if (loadingTrack) return;
    try { Tone.start(); } catch (_) {}
    setLoadingTrack(sample.title);
    try {
      const res = await fetch(sample.file, { cache: 'no-cache' });
      if (!res.ok) {
        throw new Error(`Track not found on server (${res.status}).`);
      }
      const blob = await res.blob();
      const file = new File([blob], `${sample.artist} – ${sample.title}.mp3`, { type: 'audio/mpeg' });
      onFileSelected(file);
    } catch (err) {
      console.error('Error loading sample track:', err);
      alert(`Could not load demo track: ${err.message}`);
    } finally {
      setLoadingTrack(null);
    }
  };

  return (
    <div className="upload-hero-wrapper animate-fade-in">
      {/* ─── Hero Dropzone ────────────────────────────────────────── */}
      <div
        className={`upload-hero-card ${isDragging ? 'dragging' : ''}`}
        onClick={() => document.getElementById('audio-upload')?.click()}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            document.getElementById('audio-upload')?.click();
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
          onChange={handleInputChange}
          id="audio-upload"
          className="file-input-hidden"
          aria-label="Upload audio file"
        />

        {/* Ambient background glow orb */}
        <div className="upload-glow-orb" />

        <div className="upload-icon-stage">
          <div className="upload-pulse-ring" />
          <div className="upload-icon-inner">
            <Disc3 size={32} className="upload-disc-icon" />
          </div>
        </div>

        <div className="upload-copy-block">
          <h2 className="upload-headline">Drop your track here</h2>
          <p className="upload-subline">
            or <span className="upload-browse-cta">browse from device</span>
          </p>
        </div>

        <div className="upload-badges-row">
          <span className="format-tag">MP3</span>
          <span className="format-tag">WAV</span>
          <span className="format-tag">FLAC</span>
          <span className="format-tag">M4A</span>
          <span className="format-tag">OGG</span>
        </div>

        <div className="upload-meta-footer">
          <span className="engine-badge">
            <Sparkles size={11} className="engine-icon" />
            Viterbi Chroma Engine • 96 Guitar Voicings
          </span>
        </div>
      </div>

      {/* ─── Benchmark Demo Tracks ────────────────────────────────── */}
      <div className="demo-tracks-section">
        <div className="demo-header">
          <div className="demo-header-line" />
          <span className="demo-header-title">Or explore studio benchmarks</span>
          <div className="demo-header-line" />
        </div>

        <div className="demo-tracks-grid">
          {SAMPLE_TRACKS.map((track, i) => (
            <button
              key={i}
              id={`sample-track-${i}`}
              type="button"
              className={`demo-track-card ${loadingTrack === track.title ? 'loading' : ''}`}
              onClick={() => loadSampleTrack(track)}
              disabled={!!loadingTrack}
            >
              <div
                className="demo-card-accent"
                style={{ background: track.color }}
              />
              <div className="demo-card-icon">
                {loadingTrack === track.title ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Music size={16} />
                )}
              </div>
              <div className="demo-card-info">
                <span className="demo-song-title">{track.title}</span>
                <span className="demo-artist-name">{track.artist}</span>
              </div>
              <div className="demo-card-meta">
                <span className="demo-pill key">{track.key}</span>
                <span className="demo-pill bpm">{track.bpm}</span>
              </div>
              <ArrowRight size={13} className="demo-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* ─── Keyboard Shortcuts Hint ──────────────────────────────── */}
      <div className="studio-shortcuts-bar">
        <div className="shortcut-item">
          <kbd>Space</kbd>
          <span>Play / Pause</span>
        </div>
        <span className="shortcut-sep">•</span>
        <div className="shortcut-item">
          <kbd>←</kbd> <kbd>→</kbd>
          <span>Seek 5s</span>
        </div>
        <span className="shortcut-sep">•</span>
        <div className="shortcut-item">
          <kbd>[</kbd> <kbd>]</kbd>
          <span>Loop Range</span>
        </div>
        <span className="shortcut-sep">•</span>
        <div className="shortcut-item">
          <kbd>+</kbd> <kbd>−</kbd>
          <span>Transpose</span>
        </div>
      </div>
    </div>
  );
}
