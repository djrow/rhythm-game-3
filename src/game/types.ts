export type InstrumentFamily =
  | 'violin'
  | 'cello'
  | 'flute'
  | 'trumpet'
  | 'clarinet'
  | 'guitar'
  | 'piano'
  | 'saxophone';

export type ClefType = 'treble' | 'bass';

export type GamePhase = 'title' | 'setup' | 'playing' | 'paused' | 'gameover';

export type InputSourceMode = 'mic' | 'practice' | 'ensemble-demo';

export type HitGrade = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface ScoreNote {
  id: string;
  pitch: string; // e.g. "D4", "F#5", "Bb3"
  midi: number;
  startBeat: number; // 0-indexed beat from start of piece
  durationBeats: number; // e.g. 0.5, 1, 2
  dynamics?: 'p' | 'mp' | 'mf' | 'f';
}

export interface MusicianPart {
  id: string;
  musicianName: string;
  instrument: InstrumentFamily;
  clef: ClefType;
  accentColor: string;
  keyBinding: string; // '1' | '2' | '3' | '4' for practice/testing
  notes: ScoreNote[];
}

export interface EnsembleScore {
  id: string;
  title: string;
  composer: string;
  subtitle: string;
  bpm: number;
  timeSignature: [number, number]; // e.g. [4, 4]
  keySignature: string; // e.g. "D minor"
  totalBeats: number;
  youtubeUrl: string;
  youtubeVideoId: string | null;
  youtubeOffsetSec: number;
  pdfBlobUrl?: string;
  pdfFileName?: string;
  isCustomUploaded?: boolean;
  parts: MusicianPart[];
}

export interface HarmonicProfile {
  instrument: InstrumentFamily;
  label: string;
  defaultClef: ClefType;
  defaultColor: string;
  /** Normalized expected relative amplitudes for harmonics H1..H8 */
  harmonics: [number, number, number, number, number, number, number, number];
  /** Expected spectral brightness centroid index (1.0 = pure fundamental, 4.0+ = bright brass) */
  centroidTarget: number;
  /** Oscillator/synth parameters for acoustic practice & backing synthesis */
  synthAttackMs: number;
  synthReleaseMs: number;
}

export interface NoteHitResult {
  noteId: string;
  partId: string;
  grade: HitGrade;
  points: number;
  timingMs: number; // negative = early, positive = late
  centsError: number; // negative = flat, positive = sharp
  timbreScore: number; // 0..100
  timingLabel: string;
  pitchLabel: string;
  timbreLabel: string;
  beatAtHit: number;
}

export interface MusicianFrameInference {
  partId: string;
  isActive: boolean;
  energy: number; // 0..1 normalized signal presence in instrument band
  expectedMidi: number | null;
  detectedFreq: number | null;
  centsError: number; // -65..+65
  timbreScore: number; // 0..100
  timbreDescriptor: string;
  pitchDescriptor: string;
  harmonics: number[]; // length 8 normalized 0..1
}

export interface MusicianStats {
  partId: string;
  musicianName: string;
  instrument: InstrumentFamily;
  accentColor: string;
  score: number;
  combo: number;
  maxCombo: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  avgTimingMs: number; // signed average ms offset
  avgAbsTimingMs: number;
  avgAbsCents: number;
  avgTimbreScore: number;
  lastGrade: HitGrade | null;
  lastFeedback: string;
  liveCents: number;
  liveTimbre: number;
  liveEnergy: number;
  livePitchLabel: string;
  liveTimbreLabel: string;
  liveHarmonics: number[];
}

export interface PerformanceSummary {
  scoreTitle: string;
  composer: string;
  totalScore: number;
  gradeRank: 'S' | 'A' | 'B' | 'C' | 'D';
  accuracyPct: number;
  avgTimingMs: number;
  avgPitchCents: number;
  avgTimbrePct: number;
  maxSynergyMultiplier: number;
  maxEnsembleStreak: number;
  completedAt: string;
  musicians: MusicianStats[];
}

export interface ConductorCritique {
  headline: string;
  ensembleSummary: string;
  musicianNotes: Array<{
    musicianName: string;
    instrument: string;
    feedback: string;
  }>;
}
