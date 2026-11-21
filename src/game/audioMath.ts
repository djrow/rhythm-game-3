import type {
  ClefType,
  HarmonicProfile,
  HitGrade,
  InstrumentFamily,
  MusicianFrameInference,
  ScoreNote,
} from './types';

export const INSTRUMENT_TIMBRE_PROFILES: Record<InstrumentFamily, HarmonicProfile> = {
  violin: {
    instrument: 'violin',
    label: 'Violin',
    defaultClef: 'treble',
    defaultColor: '#D4A34A',
    harmonics: [1.0, 0.78, 0.56, 0.42, 0.34, 0.22, 0.16, 0.1],
    centroidTarget: 2.65,
    synthAttackMs: 45,
    synthReleaseMs: 140,
  },
  cello: {
    instrument: 'cello',
    label: 'Cello',
    defaultClef: 'bass',
    defaultColor: '#C46D45',
    harmonics: [0.95, 1.0, 0.68, 0.44, 0.28, 0.18, 0.12, 0.08],
    centroidTarget: 2.55,
    synthAttackMs: 65,
    synthReleaseMs: 180,
  },
  flute: {
    instrument: 'flute',
    label: 'Flute',
    defaultClef: 'treble',
    defaultColor: '#4BA3A8',
    harmonics: [1.0, 0.36, 0.14, 0.06, 0.03, 0.02, 0.01, 0.01],
    centroidTarget: 1.55,
    synthAttackMs: 35,
    synthReleaseMs: 110,
  },
  trumpet: {
    instrument: 'trumpet',
    label: 'Trumpet',
    defaultClef: 'treble',
    defaultColor: '#E07B39',
    harmonics: [0.72, 1.0, 0.92, 0.78, 0.62, 0.45, 0.3, 0.2],
    centroidTarget: 3.45,
    synthAttackMs: 22,
    synthReleaseMs: 90,
  },
  clarinet: {
    instrument: 'clarinet',
    label: 'Clarinet',
    defaultClef: 'treble',
    defaultColor: '#7C8FD6',
    harmonics: [1.0, 0.12, 0.76, 0.1, 0.48, 0.08, 0.24, 0.06],
    centroidTarget: 2.6,
    synthAttackMs: 30,
    synthReleaseMs: 100,
  },
  guitar: {
    instrument: 'guitar',
    label: 'Acoustic Guitar',
    defaultClef: 'treble',
    defaultColor: '#5BA370',
    harmonics: [1.0, 0.62, 0.45, 0.25, 0.16, 0.1, 0.06, 0.03],
    centroidTarget: 2.25,
    synthAttackMs: 8,
    synthReleaseMs: 240,
  },
  piano: {
    instrument: 'piano',
    label: 'Piano',
    defaultClef: 'treble',
    defaultColor: '#9A8CC4',
    harmonics: [1.0, 0.58, 0.36, 0.24, 0.15, 0.1, 0.06, 0.04],
    centroidTarget: 2.15,
    synthAttackMs: 10,
    synthReleaseMs: 220,
  },
  saxophone: {
    instrument: 'saxophone',
    label: 'Tenor Sax',
    defaultClef: 'treble',
    defaultColor: '#D97B8A',
    harmonics: [0.88, 1.0, 0.72, 0.58, 0.38, 0.26, 0.16, 0.1],
    centroidTarget: 2.95,
    synthAttackMs: 28,
    synthReleaseMs: 120,
  },
};

const NOTE_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SEMITONE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  if (freq <= 0) return 0;
  return 69 + 12 * Math.log2(freq / 440);
}

export function pitchNameToMidi(pitch: string): number {
  const match = pitch.trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return 60; // Default C4
  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = parseInt(match[3], 10);
  let semitone = NOTE_SEMITONES[letter] ?? 0;
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  return (octave + 1) * 12 + semitone;
}

export function midiToPitchName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const note = SEMITONE_NAMES[((rounded % 12) + 12) % 12];
  return `${note}${octave}`;
}

export function freqToCentsError(detectedFreq: number, expectedFreq: number): number {
  if (detectedFreq <= 0 || expectedFreq <= 0) return 0;
  return 1200 * Math.log2(detectedFreq / expectedFreq);
}

/**
 * Extracts a canonical 11-character YouTube video ID from common YouTube URL formats.
 * Returns null if the URL is empty or not a valid YouTube link.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Bare 11-char ID not accepted unless wrapped in a valid YouTube domain
  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const idRegex = /^[a-zA-Z0-9_-]{11}$/;

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    return idRegex.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const vParam = parsed.searchParams.get('v');
    if (vParam && idRegex.test(vParam)) return vParam;

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length >= 2 &&
      (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live')
    ) {
      return idRegex.test(segments[1]) ? segments[1] : null;
    }
  }

  return null;
}

/**
 * Computes cosine similarity (0..100) between a measured 8-harmonic vector and an
 * instrument's reference acoustic harmonic profile, plus spectral descriptor.
 */
export function computeTimbreMatch(
  measuredHarmonics: number[],
  instrument: InstrumentFamily
): { score: number; descriptor: string } {
  const profile = INSTRUMENT_TIMBRE_PROFILES[instrument];
  const ref = profile.harmonics;

  let dot = 0;
  let normMeas = 0;
  let normRef = 0;
  let weightedSum = 0;
  let totalMag = 0;

  for (let i = 0; i < 8; i++) {
    const m = Math.max(0, measuredHarmonics[i] ?? 0);
    const r = ref[i];
    dot += m * r;
    normMeas += m * m;
    normRef += r * r;
    weightedSum += (i + 1) * m;
    totalMag += m;
  }

  if (normMeas < 1e-8 || totalMag < 1e-6) {
    return { score: 0, descriptor: 'Awaiting tone' };
  }

  const cosine = dot / (Math.sqrt(normMeas) * Math.sqrt(normRef));
  const measuredCentroid = weightedSum / totalMag;
  const centroidDiff = measuredCentroid - profile.centroidTarget;
  const centroidPenalty = Math.min(0.22, Math.abs(centroidDiff) * 0.08);
  const rawScore = Math.max(0, Math.min(1, cosine - centroidPenalty * 0.5));
  const score = Math.round(rawScore * 100);

  let descriptor = 'Pure Tone';
  if (score >= 86) {
    descriptor = 'Rich & True';
  } else if (score >= 72) {
    descriptor = centroidDiff > 0.35 ? 'Bright Edge' : centroidDiff < -0.35 ? 'Warm Tone' : 'Balanced';
  } else if (score >= 52) {
    descriptor = centroidDiff > 0.4 ? 'Thin / Reedy' : 'Muted Tone';
  } else {
    descriptor = centroidDiff > 0.5 ? 'Harsh Overtones' : 'Airy / Hollow';
  }

  return { score, descriptor };
}

/**
 * Samples linear magnitude at an arbitrary frequency from an FFT magnitude buffer
 * using linear interpolation, or finds the local parabolic peak within a search window.
 */
function sampleBinInterpolated(magnitudes: Float32Array | number[], binFloat: number): number {
  const len = magnitudes.length;
  if (binFloat < 0 || binFloat >= len - 1) return 0;
  const idx = Math.floor(binFloat);
  const frac = binFloat - idx;
  return magnitudes[idx] * (1 - frac) + magnitudes[idx + 1] * frac;
}

export interface PolyphonicExpectedPart {
  partId: string;
  instrument: InstrumentFamily;
  activeNote: ScoreNote | null;
}

/**
 * Multi-instrument single-microphone polyphonic audio inference:
 * Given a single mixed FFT linear magnitude spectrum (0..1 per bin) from one microphone,
 * isolates each musician's expected fundamental + harmonic comb to extract:
 * - isolated detected frequency & intonation error in cents
 * - 8-harmonic timbre vector & cosine similarity score against their instrument's profile
 * - signal energy & real-time descriptors
 */
export function analyzePolyphonicFrame(
  linearMagnitudes: Float32Array | number[],
  sampleRate: number,
  fftSize: number,
  expectedParts: PolyphonicExpectedPart[],
  noiseFloor = 0.025
): MusicianFrameInference[] {
  const binHz = sampleRate / fftSize;
  const maxBin = linearMagnitudes.length - 2;

  return expectedParts.map((part) => {
    const profile = INSTRUMENT_TIMBRE_PROFILES[part.instrument];
    if (!part.activeNote) {
      return {
        partId: part.partId,
        isActive: false,
        energy: 0,
        expectedMidi: null,
        detectedFreq: null,
        centsError: 0,
        timbreScore: 0,
        timbreDescriptor: 'Rest',
        pitchDescriptor: '—',
        harmonics: [0, 0, 0, 0, 0, 0, 0, 0],
      };
    }

    const expectedFreq = midiToFreq(part.activeNote.midi);
    // Search ±65 cents around expectedFreq using harmonic comb scoring
    const minFreq = expectedFreq * Math.pow(2, -65 / 1200);
    const maxFreq = expectedFreq * Math.pow(2, 65 / 1200);

    // Evaluate 27 candidate frequencies (~5 cent steps) with instrument-weighted harmonic comb
    let bestScore = 0;
    let bestFreq = expectedFreq;
    const steps = 26;

    for (let s = 0; s <= steps; s++) {
      const candFreq = minFreq + ((maxFreq - minFreq) * s) / steps;
      let combEnergy = 0;
      let weightTotal = 0;

      for (let h = 1; h <= 4; h++) {
        const hFreq = candFreq * h;
        const hBin = hFreq / binHz;
        if (hBin >= 1 && hBin <= maxBin) {
          const w = profile.harmonics[h - 1];
          combEnergy += sampleBinInterpolated(linearMagnitudes, hBin) * w;
          weightTotal += w;
        }
      }

      const normComb = weightTotal > 0 ? combEnergy / weightTotal : 0;
      if (normComb > bestScore) {
        bestScore = normComb;
        bestFreq = candFreq;
      }
    }

    // Fine parabolic refinement around bestFreq (±4 cents in 1-cent steps)
    let refinedFreq = bestFreq;
    let refinedScore = bestScore;
    for (let dc = -4; dc <= 4; dc++) {
      const f = bestFreq * Math.pow(2, dc / 1200);
      let comb = 0;
      let wSum = 0;
      for (let h = 1; h <= 4; h++) {
        const hBin = (f * h) / binHz;
        if (hBin >= 1 && hBin <= maxBin) {
          const w = profile.harmonics[h - 1];
          comb += sampleBinInterpolated(linearMagnitudes, hBin) * w;
          wSum += w;
        }
      }
      const norm = wSum > 0 ? comb / wSum : 0;
      if (norm > refinedScore) {
        refinedScore = norm;
        refinedFreq = f;
      }
    }

    const energy = Math.min(1, refinedScore * 2.2);
    const isActive = refinedScore >= noiseFloor;

    if (!isActive) {
      return {
        partId: part.partId,
        isActive: false,
        energy: Math.min(0.15, energy),
        expectedMidi: part.activeNote.midi,
        detectedFreq: null,
        centsError: 0,
        timbreScore: 0,
        timbreDescriptor: 'Listening',
        pitchDescriptor: 'Listening',
        harmonics: [0, 0, 0, 0, 0, 0, 0, 0],
      };
    }

    // Extract 8 harmonics at multiples of refinedFreq
    const rawHarmonics: number[] = [];
    let maxH = 1e-6;
    for (let h = 1; h <= 8; h++) {
      const centerBin = (refinedFreq * h) / binHz;
      // Take narrow peak within ±0.6 bins to capture slight inharmonicity
      let peak = 0;
      if (centerBin >= 1 && centerBin <= maxBin) {
        const p0 = sampleBinInterpolated(linearMagnitudes, centerBin);
        const pL = sampleBinInterpolated(linearMagnitudes, Math.max(0, centerBin - 0.5));
        const pR = sampleBinInterpolated(linearMagnitudes, Math.min(maxBin, centerBin + 0.5));
        peak = Math.max(p0, pL, pR);
      }
      rawHarmonics.push(peak);
      if (peak > maxH) maxH = peak;
    }

    const harmonics = rawHarmonics.map((v) => Number((v / maxH).toFixed(3)));
    const centsError = Math.max(-65, Math.min(65, Math.round(freqToCentsError(refinedFreq, expectedFreq))));
    const { score: timbreScore, descriptor: timbreDescriptor } = computeTimbreMatch(
      harmonics,
      part.instrument
    );

    let pitchDescriptor = 'In Tune';
    if (Math.abs(centsError) <= 8) {
      pitchDescriptor = 'Locked';
    } else if (centsError > 8) {
      pitchDescriptor = `Sharp +${centsError}¢`;
    } else {
      pitchDescriptor = `Flat ${centsError}¢`;
    }

    return {
      partId: part.partId,
      isActive: true,
      energy,
      expectedMidi: part.activeNote.midi,
      detectedFreq: refinedFreq,
      centsError,
      timbreScore,
      timbreDescriptor,
      pitchDescriptor,
      harmonics,
    };
  });
}

/**
 * Evaluates a note hit across timing (ms), pitch accuracy (cents), and timbre match (0..100).
 */
export function evaluateNoteHit(
  timingMs: number,
  centsError: number,
  timbreScore: number
): {
  grade: HitGrade;
  points: number;
  timingLabel: string;
  pitchLabel: string;
  timbreLabel: string;
} {
  const absTiming = Math.abs(timingMs);
  const absCents = Math.abs(centsError);

  const timingLabel =
    absTiming <= 22
      ? 'In Pocket'
      : timingMs < 0
      ? `Early ${Math.round(timingMs)}ms`
      : `Late +${Math.round(timingMs)}ms`;

  const pitchLabel =
    absCents <= 10
      ? 'Pure Pitch'
      : centsError > 0
      ? `Sharp +${Math.round(centsError)}¢`
      : `Flat ${Math.round(centsError)}¢`;

  const timbreLabel =
    timbreScore >= 82
      ? 'Rich Timbre'
      : timbreScore >= 64
      ? 'Clean Tone'
      : timbreScore >= 45
      ? 'Thin Tone'
      : 'Rough Tone';

  let grade: HitGrade = 'MISS';
  let basePoints = 0;

  if (absTiming <= 55 && absCents <= 20 && timbreScore >= 68) {
    grade = 'PERFECT';
    basePoints = 300;
  } else if (absTiming <= 115 && absCents <= 38 && timbreScore >= 48) {
    grade = 'GREAT';
    basePoints = 200;
  } else if (absTiming <= 185 && absCents <= 58 && timbreScore >= 25) {
    grade = 'GOOD';
    basePoints = 100;
  }

  // Bonus precision points for sub-10c intonation & 90%+ timbre
  const precisionBonus =
    grade === 'MISS'
      ? 0
      : Math.round((Math.max(0, 20 - absCents) * 1.5) + (Math.max(0, timbreScore - 70) * 1.2));

  return {
    grade,
    points: basePoints + precisionBonus,
    timingLabel,
    pitchLabel,
    timbreLabel,
  };
}

/**
 * Computes ensemble synergy multiplier (1x to 4x) based on how many musicians are
 * simultaneously sustaining combo streaks.
 */
export function computeEnsembleSynergy(combos: number[]): {
  multiplier: number;
  lockPct: number;
} {
  if (combos.length === 0) return { multiplier: 1, lockPct: 0 };
  const inSyncCount = combos.filter((c) => c >= 2).length;
  const minCombo = Math.min(...combos);
  const lockPct = Math.round((inSyncCount / combos.length) * 100);

  let multiplier = 1;
  if (inSyncCount === combos.length && minCombo >= 8) {
    multiplier = 4;
  } else if (inSyncCount === combos.length && minCombo >= 4) {
    multiplier = 3;
  } else if (inSyncCount >= Math.ceil(combos.length / 2) && Math.max(...combos) >= 3) {
    multiplier = 2;
  }

  return { multiplier, lockPct };
}

export function computePerformanceRank(accuracyPct: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (accuracyPct >= 93) return 'S';
  if (accuracyPct >= 84) return 'A';
  if (accuracyPct >= 72) return 'B';
  if (accuracyPct >= 58) return 'C';
  return 'D';
}

/**
 * Maps a MIDI note number to a diatonic staff step relative to the middle line (0)
 * of a treble (B4 = 71) or bass (D3 = 50) 5-line musical staff, plus accidental.
 * Positive steps go UP on the staff; each staff line is 2 steps apart (-4, -2, 0, +2, +4).
 */
const DIATONIC_INDEX_IN_OCTAVE: Array<{ step: number; accidental: '#' | 'b' | null }> = [
  { step: 0, accidental: null }, // C
  { step: 0, accidental: '#' }, // C#
  { step: 1, accidental: null }, // D
  { step: 2, accidental: 'b' }, // Eb
  { step: 2, accidental: null }, // E
  { step: 3, accidental: null }, // F
  { step: 3, accidental: '#' }, // F#
  { step: 4, accidental: null }, // G
  { step: 5, accidental: 'b' }, // Ab
  { step: 5, accidental: null }, // A
  { step: 6, accidental: 'b' }, // Bb
  { step: 6, accidental: null }, // B
];

export function midiToStaffPosition(
  midi: number,
  clef: ClefType
): { step: number; accidental: '#' | 'b' | null } {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const pc = ((rounded % 12) + 12) % 12;
  const info = DIATONIC_INDEX_IN_OCTAVE[pc];
  const absoluteDiatonic = octave * 7 + info.step;
  // Treble middle line = B4 (octave 4, step 6 -> 34). Bass middle line = D3 (octave 3, step 1 -> 22).
  const centerDiatonic = clef === 'treble' ? 34 : 22;
  return {
    step: absoluteDiatonic - centerDiatonic,
    accidental: info.accidental,
  };
}
