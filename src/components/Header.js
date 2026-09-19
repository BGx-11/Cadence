"use client";

import React from 'react';
import { Music } from 'lucide-react';

export default function Header() {
  return (
    <header className="flex-center" style={{ flexDirection: 'column', textAlign: 'center', marginBottom: '2.5rem', paddingTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: '8px',
          background: 'var(--foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Music size={18} color="#ffffff" />
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>
          Cadence
        </h1>
      </div>
      <p className="subtitle">Key, tempo, and chord recognition engine.</p>
    </header>
  );
}
