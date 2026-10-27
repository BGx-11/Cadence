"use client";

import * as Tone from 'tone';
import { Chord } from 'tonal';

let strumSynth = null;
let clickSynth = null;

/**
 * Voiced octave mapping for clean acoustic-style chord playback.
 */
export function getVoicedNotes(chordName) {
  if (!chordName || chordName === 'N.C.') return [];
  try {
    const chordData = Chord.get(chordName);
    const notes = (chordData.notes && chordData.notes.length > 0)
      ? chordData.notes
      : [chordName.replace(/[^A-G#b]/g, '')];

    return notes.map((note, i) => note + (i === 0 ? 3 : (3 + Math.floor((i + 1) / 2))));
  } catch (_) {
    return [];
  }
}

/**
 * Strums a chord with natural down-strum delay across individual string notes.
 */
export function playChordStrum(chordName) {
  if (typeof window === 'undefined') return;
  const voiced = getVoicedNotes(chordName);
  if (!voiced || voiced.length === 0) return;

  try {
    Tone.start();

    if (!strumSynth) {
      strumSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.005,
          decay: 0.8,
          sustain: 0.08,
          release: 0.8
        }
      }).toDestination();
      strumSynth.volume.value = -7;
    }

    const now = Tone.now();
    const staggerSec = 0.028; // 28ms humanized string strum interval

    voiced.forEach((note, idx) => {
      strumSynth.triggerAttackRelease(note, '8n', now + idx * staggerSec, 0.65);
    });
  } catch (err) {
    console.warn("Chord audition notice:", err);
  }
}

/**
 * Plays a high-precision wooden metronome tick.
 * Downbeats trigger higher pitch at C6; offbeats trigger lower pitch at G5.
 */
export function playMetronomeClick(downbeat = false) {
  if (typeof window === 'undefined') return;
  try {
    if (!clickSynth) {
      clickSynth = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 }
      }).toDestination();
      clickSynth.volume.value = -8;
    }

    const note = downbeat ? 'C6' : 'G5';
    clickSynth.triggerAttackRelease(note, '32n', undefined, downbeat ? 0.9 : 0.55);
  } catch (_) {}
}

/**
 * Disposes cached synthesizers on app cleanup.
 */
export function disposeSynths() {
  try {
    if (strumSynth) {
      strumSynth.dispose();
      strumSynth = null;
    }
    if (clickSynth) {
      clickSynth.dispose();
      clickSynth = null;
    }
  } catch (_) {}
}
