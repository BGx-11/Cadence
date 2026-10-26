# Changelog

All notable changes to **Cadence** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-10-26

Comprehensive technical audit, DSP mathematical stabilization, performance profiling, and practice workflow enhancements across the workstation.

### Added
- **Editable Chord Timeline (`FEAT-29`)**:
  - Interactive inline chord correction directly on `TimelineView` chord cards.
  - Quick-edit input allows updating any misdetected chord with instant visual feedback, while retaining a 1-click Revert button (`RotateCcw`) to undo manual overrides.
- **Roman Numeral Harmonic Analysis (`FEAT-34`)**:
  - Diatonic and chromatic harmonic function badges (`I`, `ii`, `IV`, `V`, `vii°`, etc.) computed in `src/lib/musicTheory.js` relative to detected song key.
  - Displayed cleanly alongside chord symbols in `NowPlayingHero` and `TimelineView`.
- **Global Keyboard Control (`UI-09`)**:
  - Added workstation keyboard shortcuts: `Space` (Play/Pause), `ArrowLeft`/`ArrowRight` (Seek -5s/+5s), `[` / `]` (Set loop start/end to current time), and `+`/`-` (Transpose key up/down semitone).
- **Consolidated Music Theory Engine (`src/lib/musicTheory.js`)**:
  - Centralized chord transposition, enharmonic normalization, root/suffix extraction, simplification, and Roman numeral degree analysis into a unified, tested module.
- **Progressive Tempo Speed Trainer (`FEAT-17`)**:
  - Hands-free practice accelerator toggled from `SettingsBar`.
  - Automatically increments `playbackRate` by `+0.05x` on each loop boundary until reaching standard tempo (`1.00x`), building muscle memory incrementally.
- **Left-Handed Fretboard Mirror (`FEAT-22`, `FEAT-28`)**:
  - 1-click toggle in `SettingsBar` (`Left-Hand / Right-Hand`).
  - Mirrors string thickness ordering (thick Low E on right), finger dots, open/muted string badges, and barre spans dynamically across `ChordChart`, `NowPlayingHero`, and `TimelineView`.
- **Complete 96-Chord Fretboard Database (`MUS-02`)**:
  - Added voicings for all 10 previously missing worker chords: `C#sus2`, `D#sus2`, `F#sus2`, `G#sus2`, `A#sus2`, `C#sus4`, `D#sus4`, `F#sus4`, `G#sus4`, `A#sus4`.
  - Re-voiced `Cdim`, `C#dim`, and `D#dim` as proper root-b3-b5 triads.
  - Corrected `Dadd9` (added F# 3rd) and differentiated major 3rd vs minor 3rd across `D9` and `Dm9`.
- **Automated Invariant Test Suite (`scripts/test_invariants.js`)**:
  - Lightweight, assert-based validation runnable via `npm test` without framework dependencies.
  - Tests 12-bin template dimensions, diminished tritone placement, `maj7` simplification, duration tiling, silence preservation, metronome continuity, monotonic pointer scan, No-Chord silence state, exact meter fractions, and Roman numeral analysis.
- **Dual Licensing Attribution (`LICENSE`)**:
  - Explicit MIT License for Cadence code, Tone.js MIT compliance, and AGPL-3.0 attribution for Essentia.js WASM DSP binaries.

### Fixed
#### DSP & Audio Analysis Engine
- **DSP-01**: Fixed 13-element array typo in `CHORD_TEMPLATES['dim']` that shifted diminished 5th ($b5$) into the perfect 5th ($P5$) slot, restoring detection across all 12 diminished triads (`Cdim`–`Bdim`).
- **DSP-02**: Lowered Viterbi self-transition probability from `0.85` to `0.52`, scaled temperature to `0.18`, and balanced diatonic/chromatic transition weights to eliminate path locking on fast chord progressions.
- **DSP-03**: Repaired `consolidateChords` duration tiling (`Math.max(0.01, nextTime - finalChords[i].time)`), preserved opening fast chords (`flickerThreshold = Math.min(minDurationSec, 0.4)`), and preserved leading silence when song audio starts after 0.5s.
- **DSP-04**: Replaced phase-biased downbeat detection with phase-invariant evaluation testing downbeat offsets across 3/4, 4/4, and compound 6/8 meter.
- **DSP-05**: Replaced 6-letter clamping (`Math.min(labelIdx, 5)`) with dynamic alphabet generation (`A..Z`, `A1..`), preventing complex tracks from collapsing into section `'F'`.
- **DSP-08**: Rebalanced `CHORD_TEMPLATES` with defining 3rds weighted `0.85` over common 5ths (`0.65`) and removed spurious `rotated[7] * 0.06` fifth boost, preventing bass notes from triggering false triad matches.
- **DSP-09**: Refined post-Viterbi 1-beat excursion smoother to evaluate competing chord scores (`currentScore < neighborScore * 1.25 && beatDuration < 0.75`), preserving genuine quick chord transitions while absorbing transient noise flickers.
- **DSP-10**: Normalized chord tone energy against active bins (`avgChord` vs `avgNonChord` contrast ratio) in `scoreChordMatch` and `computeChordConfidence`, eliminating the spurious +0.0292 noise boost on 4-note 7th chords.
- **DSP-11**: Added explicit `.delete()` calls on `rhythm.estimates` and `rhythm.bpmIntervals` C++ `VectorFloat` instances in `RhythmExtractor2013`, resolving linear WASM heap memory leaks.
- **DSP-12**: Patched `initEssentia()` to verify `calledRun` and `EssentiaJS` before binding `onRuntimeInitialized`, eliminating hangs on fast WASM initialization.
- **DSP-13**: Added explicit 97th state `N.C.` (No Chord / Silence / Ambient) to `workerDSP.js` and `audioWorker.js` (`NUM_STATES = 97`) with pre-normalization raw energy and RMS scaling, preventing low-volume audio from being artificially blown up by `normalizeHPCP()`.
- **DSP-14**: Extracted pure DSP and chord detection primitives into `src/lib/workerDSP.js`, ensuring identical, testable implementations shared between the Web Worker and invariant test suite.

#### Playback & Concurrency
- **PERF-07**: Introduced `currentAnalysisIdRef` and worker lifecycle re-initialization in `processAudioFile` to prevent race conditions when uploading new tracks during in-flight decoding.
- **PERF-08**: Resumed `Tone.start()` synchronously within user-gesture handlers (`loadSampleTrack`, input changes, drop events) before asynchronous `await` suspensions, unlocking AudioContext playback on iOS Safari / WebKit.
- **PERF-09**: Attached `audio.onerror` to handle unsupported audio codecs cleanly with descriptive error alerts.
- **UX-06**: Prevented playhead trap on manual seek outside active loop boundaries (`loopEnabled` auto-disables when seeking past `[loopStart, loopEnd]`), and enabled clicking an active `.section-pill.looped` to toggle the loop off.

#### Music Theory & Notation
- **BUG-02**: Time signature represented as `{ numerator, denominator }` object across worker, page, and UI (`Visualizer.js`, `ChordSheetView.js`, `TimelineView.js`), eliminating hardcoded `/4` denominator and accurately supporting 3/4, 4/4, and 6/8 meter.
- **MUS-01**: Corrected `simplifyChord` regex from `/^[A-G][#b]?m?/` to check `rest.startsWith('maj')`, preventing `Cmaj7` from converting to `Cm`.
- **MUS-06**: Replaced alternating meter parity in `Visualizer` with continuous beat parity (`activeBeatIndex % 2 === 0 ? 1 : -1`) and `Math.cos()` swing, ensuring the metronome pendulum turnaround apex aligns with beat clicks without mid-air snaps in 3/4 time.
- **MUS-07**: Aligned beat filtering tolerance between `page.js`, `TimelineView.js`, and `ChordSheetView.js` to `b >= time - 0.05 && b < end - 0.05`.

#### UI, Rendering & Performance
- **PERF-01**: Throttled React `setCurrentTime` state updates in the RAF playback loop to ~15fps (`66ms`) while maintaining 60fps direct DOM track translations (`translateX`), eliminating 60fps full-tree re-render thrashing.
- **PERF-02**: Implemented direct in-memory mono downmix for 44.1 kHz audio buffers, bypassing redundant Web Audio `offlineCtx.startRendering()` allocations.
- **PERF-10**: Replaced the $O(N \times M)$ nested backward chord search in `WaveformDisplay.draw()` with an $O(N + M)$ monotonic advancing pointer, saving ~18M operations per second at 60fps.
- **PERF-11**: Virtualized `TimelineView` DOM rendering to window beat ticks and chord cards to `currentTime - 18s` through `currentTime + 26s`, reducing active DOM elements from >4,000 to <100.
- **UX-01**: Defined missing `--border-strong: #a1a1aa;` token in `:root`, restoring invisible unplayed beat dots and upcoming chord card borders.
- **UX-07**: Updated `NowPlayingHero` badge to display steady `"ACTIVE CHORD"` when paused and pulsing `"LIVE CHORD"` when playing.
- **UX-08**: Replaced array-index React keys (`key={i}`) with stable keys (`${c.chord}-${c.time}`) across `TimelineView` and `ChordSheetView`, preventing stale DOM transitions during difficulty changes.

---

## [0.1.0] - 2026-10-25

Initial release of Cadence client-side guitar chord and rhythm workstation.
- Client-side Essentia.js DSP audio worker.
- Chromagram (HPCP) extraction and Viterbi HMM chord recognition.
- Key and tempo detection via `KeyExtractor` and `RhythmExtractor2013`.
- Dynamic SVG guitar fretboard diagrams with barre chord rendering.
- Real-time synchronized progression timeline and chord sheet views.
- Section segmentation and practice looping controls.
