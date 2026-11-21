import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Film,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AcousticEngine, type MicStatus } from './audio/acousticEngine';
import { MusicianTelemetryStrip } from './components/MusicianTelemetryStrip';
import { PerformanceReportModal } from './components/PerformanceReportModal';
import {
  SheetMusicCanvas,
  type CanvasCallout,
  type CanvasParticle,
  type PitchTraceSample,
  type SheetRenderState,
} from './components/SheetMusicCanvas';
import { TitleScreen } from './components/TitleScreen';
import { UploadScoreModal } from './components/UploadScoreModal';
import { YouTubeSyncPlayer } from './components/YouTubeSyncPlayer';
import {
  analyzePolyphonicFrame,
  computeEnsembleSynergy,
  computePerformanceRank,
  evaluateNoteHit,
  midiToStaffPosition,
} from './game/audioMath';
import { CURATED_REPERTOIRE } from './game/repertoire';
import type {
  EnsembleScore,
  GamePhase,
  HitGrade,
  InputSourceMode,
  MusicianFrameInference,
  MusicianStats,
  NoteHitResult,
  PerformanceSummary,
} from './game/types';

const PARTICLE_POOL_SIZE = 72;
const CALLOUT_POOL_SIZE = 20;

function createParticlePool(): CanvasParticle[] {
  return Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0.5,
    size: 3,
    color: '#D4A34A',
  }));
}

function createCalloutPool(): CanvasCallout[] {
  return Array.from({ length: CALLOUT_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vy: -24,
    text: '',
    subtext: '',
    color: '#1B9A67',
    life: 0,
    maxLife: 0.9,
  }));
}

function createInitialMusicianStats(score: EnsembleScore): MusicianStats[] {
  return score.parts.map((part) => ({
    partId: part.id,
    musicianName: part.musicianName,
    instrument: part.instrument,
    accentColor: part.accentColor,
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    missCount: 0,
    avgTimingMs: 0,
    avgAbsTimingMs: 0,
    avgAbsCents: 0,
    avgTimbreScore: 0,
    lastGrade: null,
    lastFeedback: 'Ready',
    liveCents: 0,
    liveTimbre: 0,
    liveEnergy: 0,
    livePitchLabel: 'Ready',
    liveTimbreLabel: 'Awaiting tone',
    liveHarmonics: [0, 0, 0, 0, 0, 0, 0, 0],
  }));
}

interface MusicianRunningSums {
  hits: number;
  sumTimingMs: number;
  sumAbsTimingMs: number;
  sumAbsCents: number;
  sumTimbre: number;
}

export default function App() {
  const [repertoire, setRepertoire] = useState<EnsembleScore[]>(CURATED_REPERTOIRE);
  const [activeScore, setActiveScore] = useState<EnsembleScore>(CURATED_REPERTOIRE[0]);
  const [phase, setPhase] = useState<GamePhase>('title');
  const [inputMode, setInputMode] = useState<InputSourceMode>('ensemble-demo');
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoOffsetSec, setVideoOffsetSec] = useState(0);
  const [monitorOpen, setMonitorOpen] = useState(true);
  const [monitorTab, setMonitorTab] = useState<'video' | 'pdf'>('video');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Throttled HUD readouts
  const [hudScore, setHudScore] = useState(0);
  const [hudSynergy, setHudSynergy] = useState(1);
  const [hudCurrentBeat, setHudCurrentBeat] = useState(0);
  const [hudMicLevel, setHudMicLevel] = useState(0);
  const [musicianStats, setMusicianStats] = useState<MusicianStats[]>(() =>
    createInitialMusicianStats(CURATED_REPERTOIRE[0])
  );
  const [summarySnapshot, setSummarySnapshot] = useState<PerformanceSummary | null>(null);

  // Engine & simulation refs (decoupled from 60Hz React renders)
  const audioRef = useRef<AcousticEngine | null>(null);
  const phaseRef = useRef<GamePhase>('title');
  const inputModeRef = useRef<InputSourceMode>('ensemble-demo');
  const metronomeRef = useRef<boolean>(true);
  const playbackRateRef = useRef<number>(1);
  const maxSynergyRef = useRef<number>(1);
  const maxEnsembleStreakRef = useRef<number>(0);
  const totalEnsembleScoreRef = useRef<number>(0);
  const lastBeatIndexRef = useRef<number>(-1);
  const demoTriggeredNotesRef = useRef<Set<string>>(new Set());
  const demoTimingJitterRef = useRef<Map<string, { beatOffset: number; cents: number }>>(new Map());
  const runningSumsRef = useRef<Map<string, MusicianRunningSums>>(new Map());
  const liveStatsRef = useRef<MusicianStats[]>(createInitialMusicianStats(CURATED_REPERTOIRE[0]));
  const particleCursorRef = useRef<number>(0);
  const calloutCursorRef = useRef<number>(0);

  const renderStateRef = useRef<SheetRenderState>({
    score: CURATED_REPERTOIRE[0],
    currentBeat: 0,
    isPlaying: false,
    hitResults: new Map(),
    liveInference: new Map(),
    pitchHistory: new Map(),
    particles: createParticlePool(),
    callouts: createCalloutPool(),
    flashIntensity: new Map(),
  });

  phaseRef.current = phase;
  inputModeRef.current = inputMode;
  metronomeRef.current = metronomeOn;
  playbackRateRef.current = playbackRate;

  // Initialize AcousticEngine lazily
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new AcousticEngine();
    }
    return audioRef.current;
  }, []);

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  const spawnHitEffects = useCallback(
    (partIdx: number, noteMidi: number, grade: HitGrade, subtext: string) => {
      const state = renderStateRef.current;
      const part = state.score.parts[partIdx];
      if (!part) return;

      const stageEl = document.querySelector('[data-testid="sheet-music-stage"]');
      const rect = stageEl?.getBoundingClientRect();
      const width = rect?.width ?? 1000;
      const height = rect?.height ?? 480;
      const headerStripH = 26;
      const partCount = Math.max(1, state.score.parts.length);
      const laneH = (height - headerStripH) / partCount;
      const lineGap = Math.max(6.5, Math.min(12, laneH * 0.082));
      const leftMargin = Math.min(196, Math.max(146, width * 0.155));
      const playheadX = leftMargin + Math.min(148, Math.max(114, width * 0.115));
      const staffCenterY = headerStripH + partIdx * laneH + laneH * 0.52;
      const { step } = midiToStaffPosition(noteMidi, part.clef);
      const clampedStep = Math.max(-10, Math.min(10, step));
      const noteY = staffCenterY - clampedStep * (lineGap / 2);

      const color =
        grade === 'PERFECT'
          ? '#1B9A67'
          : grade === 'GREAT'
          ? '#D4A34A'
          : grade === 'GOOD'
          ? '#B57B2A'
          : '#C93B3B';

      state.flashIntensity.set(part.id, grade === 'MISS' ? 0.25 : 1.0);

      // Pooled particle burst
      const burstCount = grade === 'PERFECT' ? 14 : grade === 'GREAT' ? 8 : grade === 'GOOD' ? 4 : 0;
      for (let i = 0; i < burstCount; i++) {
        const p = state.particles[particleCursorRef.current % PARTICLE_POOL_SIZE];
        particleCursorRef.current += 1;
        const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5) * 0.4;
        const speed = 55 + Math.random() * 95;
        p.active = true;
        p.x = playheadX;
        p.y = noteY;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 35;
        p.life = 0.42 + Math.random() * 0.22;
        p.maxLife = p.life;
        p.size = grade === 'PERFECT' ? 3.5 : 2.6;
        p.color = i % 2 === 0 ? color : '#F0CF86';
      }

      // Pooled floating callout
      const c = state.callouts[calloutCursorRef.current % CALLOUT_POOL_SIZE];
      calloutCursorRef.current += 1;
      c.active = true;
      c.x = playheadX + 14;
      c.y = Math.max(headerStripH + 22, Math.min(height - 24, noteY - 12));
      c.vy = -22;
      c.text = grade;
      c.subtext = subtext;
      c.color = color;
      c.life = 0.95;
      c.maxLife = 0.95;
    },
    []
  );

  const recordNoteEvaluation = useCallback(
    (
      partIdx: number,
      noteId: string,
      noteMidi: number,
      timingMs: number,
      centsError: number,
      timbreScore: number,
      beatAtHit: number
    ) => {
      const state = renderStateRef.current;
      const part = state.score.parts[partIdx];
      if (!part || state.hitResults.has(noteId)) return;

      const evalRes = evaluateNoteHit(timingMs, centsError, timbreScore);
      const hitResult: NoteHitResult = {
        noteId,
        partId: part.id,
        grade: evalRes.grade,
        points: evalRes.points,
        timingMs,
        centsError,
        timbreScore,
        timingLabel: evalRes.timingLabel,
        pitchLabel: evalRes.pitchLabel,
        timbreLabel: evalRes.timbreLabel,
        beatAtHit,
      };
      state.hitResults.set(noteId, hitResult);

      const stat = liveStatsRef.current[partIdx];
      let sums = runningSumsRef.current.get(part.id);
      if (!sums) {
        sums = { hits: 0, sumTimingMs: 0, sumAbsTimingMs: 0, sumAbsCents: 0, sumTimbre: 0 };
        runningSumsRef.current.set(part.id, sums);
      }

      if (evalRes.grade === 'MISS') {
        stat.missCount += 1;
        stat.combo = 0;
        stat.lastGrade = 'MISS';
        stat.lastFeedback = 'Missed note';
      } else {
        if (evalRes.grade === 'PERFECT') stat.perfectCount += 1;
        else if (evalRes.grade === 'GREAT') stat.greatCount += 1;
        else stat.goodCount += 1;

        stat.combo += 1;
        if (stat.combo > stat.maxCombo) stat.maxCombo = stat.combo;

        const { multiplier } = computeEnsembleSynergy(liveStatsRef.current.map((s) => s.combo));
        if (multiplier > maxSynergyRef.current) maxSynergyRef.current = multiplier;
        const minCombo = Math.min(...liveStatsRef.current.map((s) => s.combo));
        if (minCombo > maxEnsembleStreakRef.current) maxEnsembleStreakRef.current = minCombo;

        const earned = evalRes.points * multiplier;
        stat.score += earned;
        totalEnsembleScoreRef.current += earned;

        sums.hits += 1;
        sums.sumTimingMs += timingMs;
        sums.sumAbsTimingMs += Math.abs(timingMs);
        sums.sumAbsCents += Math.abs(centsError);
        sums.sumTimbre += timbreScore;

        stat.avgTimingMs = sums.sumTimingMs / sums.hits;
        stat.avgAbsTimingMs = sums.sumAbsTimingMs / sums.hits;
        stat.avgAbsCents = sums.sumAbsCents / sums.hits;
        stat.avgTimbreScore = sums.sumTimbre / sums.hits;
        stat.lastGrade = evalRes.grade;
        stat.lastFeedback = `${evalRes.timingLabel} · ${evalRes.pitchLabel}`;
      }

      const subtext =
        evalRes.grade === 'MISS'
          ? 'Late / Silent'
          : `${evalRes.timingLabel} · ${Math.round(timbreScore)}% tone`;
      spawnHitEffects(partIdx, noteMidi, evalRes.grade, subtext);
      audioRef.current?.playHitChime(evalRes.grade);
    },
    [spawnHitEffects]
  );

  const resetRunState = useCallback((score: EnsembleScore) => {
    audioRef.current?.stopAllVoices();
    const initialStats = createInitialMusicianStats(score);
    liveStatsRef.current = initialStats;
    runningSumsRef.current = new Map();
    demoTriggeredNotesRef.current = new Set();
    demoTimingJitterRef.current = new Map();
    totalEnsembleScoreRef.current = 0;
    maxSynergyRef.current = 1;
    maxEnsembleStreakRef.current = 0;
    lastBeatIndexRef.current = -1;

    // Pre-generate deterministic subtle human nuances for Ensemble Demo mode
    score.parts.forEach((part, pIdx) => {
      part.notes.forEach((note, nIdx) => {
        const seed = (pIdx + 1) * 37 + (nIdx + 1) * 19;
        const pseudo1 = Math.sin(seed * 12.9898) * 43758.5453;
        const frac1 = pseudo1 - Math.floor(pseudo1); // 0..1
        const pseudo2 = Math.sin(seed * 78.233) * 43758.5453;
        const frac2 = pseudo2 - Math.floor(pseudo2); // 0..1
        // Natural acoustic jitter: -24ms..+28ms and -14¢..+14¢
        const msJitter = (frac1 - 0.46) * 52;
        const beatOffset = (msJitter / 1000) * (score.bpm / 60);
        const cents = Math.round((frac2 - 0.5) * 28);
        demoTimingJitterRef.current.set(note.id, { beatOffset, cents });
      });
    });

    renderStateRef.current.score = score;
    renderStateRef.current.currentBeat = 0;
    renderStateRef.current.hitResults.clear();
    renderStateRef.current.liveInference.clear();
    renderStateRef.current.pitchHistory.clear();
    renderStateRef.current.flashIntensity.clear();
    renderStateRef.current.particles.forEach((p) => {
      p.active = false;
    });
    renderStateRef.current.callouts.forEach((c) => {
      c.active = false;
    });

    setMusicianStats(initialStats.map((s) => ({ ...s })));
    setHudScore(0);
    setHudSynergy(1);
    setHudCurrentBeat(0);
    setSummarySnapshot(null);
  }, []);

  const finalizePerformance = useCallback(() => {
    audioRef.current?.stopAllVoices();
    const score = renderStateRef.current.score;
    const musicians = liveStatsRef.current.map((m) => ({ ...m }));

    let totalEvaluatedNotes = 0;
    let totalHitNotes = 0;
    let weightedTiming = 0;
    let weightedCents = 0;
    let weightedTimbre = 0;
    let hitMusiciansCount = 0;

    musicians.forEach((m) => {
      const hits = m.perfectCount + m.greatCount + m.goodCount;
      totalHitNotes += hits;
      totalEvaluatedNotes += hits + m.missCount;
      if (hits > 0) {
        weightedTiming += m.avgAbsTimingMs;
        weightedCents += m.avgAbsCents;
        weightedTimbre += m.avgTimbreScore;
        hitMusiciansCount += 1;
      }
    });

    const accuracyPct =
      totalEvaluatedNotes > 0 ? Math.round((totalHitNotes / totalEvaluatedNotes) * 100) : 0;
    const snapshot: PerformanceSummary = {
      scoreTitle: score.title,
      composer: score.composer,
      totalScore: Math.round(totalEnsembleScoreRef.current),
      gradeRank: computePerformanceRank(accuracyPct),
      accuracyPct,
      avgTimingMs: hitMusiciansCount > 0 ? weightedTiming / hitMusiciansCount : 0,
      avgPitchCents: hitMusiciansCount > 0 ? weightedCents / hitMusiciansCount : 0,
      avgTimbrePct: hitMusiciansCount > 0 ? weightedTimbre / hitMusiciansCount : 0,
      maxSynergyMultiplier: maxSynergyRef.current,
      maxEnsembleStreak: maxEnsembleStreakRef.current,
      completedAt: new Date().toISOString(),
      musicians,
    };

    renderStateRef.current.isPlaying = false;
    setSummarySnapshot(snapshot);
    setPhase('gameover');
  }, []);

  const handleStartGame = useCallback(
    async (overrideScore?: EnsembleScore) => {
      const scoreToPlay = overrideScore ?? activeScore;
      resetRunState(scoreToPlay);
      const engine = getAudio();
      engine.ensureContext();
      engine.setMuted(isMuted);

      if (inputModeRef.current === 'mic') {
        const status = await engine.enableMicrophone();
        setMicStatus(status);
      }

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      renderStateRef.current.isPlaying = true;
      setPhase('playing');
    },
    [activeScore, getAudio, isMuted, resetRunState]
  );

  // Support ?autostart=1 query param for instant start / verification
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      resetRunState(CURATED_REPERTOIRE[0]);
      renderStateRef.current.isPlaying = true;
      setPhase('playing');
    }
  }, [resetRunState]);

  const handleSwitchInputMode = useCallback(
    async (mode: InputSourceMode) => {
      setInputMode(mode);
      const engine = getAudio();
      engine.ensureContext();
      if (mode === 'mic') {
        const status = await engine.enableMicrophone();
        setMicStatus(status);
      } else {
        engine.disableMicrophone();
        setMicStatus('idle');
      }
    },
    [getAudio]
  );

  /**
   * Interactive Practice / Keyboard Trigger for a specific musician (Keys 1-4 or lane click).
   * Synthesizes that musician's real instrument harmonic spectrum into the AnalyserNode
   * AND evaluates the exact timing against their nearest upcoming/active note.
   */
  const triggerMusicianPracticeStrike = useCallback(
    (partIdx: number) => {
      if (phaseRef.current !== 'playing') return;
      const state = renderStateRef.current;
      const part = state.score.parts[partIdx];
      if (!part) return;

      const engine = getAudio();
      engine.ensureContext();

      const currentBeat = state.currentBeat;
      const beatsPerSec = (state.score.bpm / 60) * playbackRateRef.current;

      // Find closest un-evaluated note within ±0.9 beats
      let bestNote = null as (typeof part.notes)[number] | null;
      let bestDeltaBeats = Infinity;
      for (const note of part.notes) {
        if (state.hitResults.has(note.id)) continue;
        const delta = currentBeat - note.startBeat;
        if (Math.abs(delta) < Math.abs(bestDeltaBeats)) {
          bestDeltaBeats = delta;
          bestNote = note;
        }
      }

      const targetMidi = bestNote ? bestNote.midi : part.notes[0]?.midi ?? 60;
      const durSec = bestNote ? Math.max(0.25, bestNote.durationBeats / beatsPerSec) : 0.45;
      // Small natural acoustic pitch variance (-9¢..+9¢)
      const cents = Math.round((Math.random() - 0.5) * 18);

      engine.triggerInstrumentNote(
        `practice-${part.id}`,
        part.instrument,
        targetMidi,
        durSec,
        cents,
        0.8
      );

      if (bestNote && Math.abs(bestDeltaBeats) <= 0.65) {
        const timingMs = (bestDeltaBeats / beatsPerSec) * 1000;
        const timbreScore = 84 + Math.round(Math.random() * 14);
        recordNoteEvaluation(
          partIdx,
          bestNote.id,
          bestNote.midi,
          timingMs,
          cents,
          timbreScore,
          currentBeat
        );
      }
    },
    [getAudio, recordNoteEvaluation]
  );

  // Global keyboard bindings (Enter/Space on Title, 1-4 instruments, Esc/P Pause, M Mute, R Restart)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping || uploadModalOpen) return;

      if (phaseRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (phaseRef.current === 'playing') {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'p' || e.key === ' ') {
          e.preventDefault();
          audioRef.current?.stopAllVoices();
          renderStateRef.current.isPlaying = false;
          setPhase('paused');
          return;
        }
        if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          setIsMuted((prev) => {
            const next = !prev;
            audioRef.current?.setMuted(next);
            return next;
          });
          return;
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          handleStartGame();
          return;
        }
        if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
          if (!e.repeat) {
            triggerMusicianPracticeStrike(Number(e.key) - 1);
          }
        }
        return;
      }

      if (phaseRef.current === 'paused') {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'p' || e.key === ' ') {
          e.preventDefault();
          renderStateRef.current.isPlaying = true;
          setPhase('playing');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartGame, triggerMusicianPracticeStrike, uploadModalOpen]);

  // Main 60Hz Game Clock & Real-Time Single-Mic Polyphonic Audio Inference Loop
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();
    let lastHudSyncTs = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      if (phaseRef.current === 'playing') {
        const state = renderStateRef.current;
        const score = state.score;
        const beatsPerSec = (score.bpm / 60) * playbackRateRef.current;
        state.currentBeat += dt * beatsPerSec;

        const beatFloor = Math.floor(state.currentBeat);
        if (beatFloor > lastBeatIndexRef.current && beatFloor >= 0) {
          lastBeatIndexRef.current = beatFloor;
          if (metronomeRef.current) {
            const beatsPerMeasure = score.timeSignature[0] || 4;
            audioRef.current?.playMetronomeClick(beatFloor % beatsPerMeasure === 0);
          }
        }

        // In Ensemble Demo mode, synthesize real acoustic voices into the shared AnalyserNode
        if (inputModeRef.current === 'ensemble-demo') {
          const engine = audioRef.current;
          score.parts.forEach((part) => {
            for (const note of part.notes) {
              if (demoTriggeredNotesRef.current.has(note.id)) continue;
              const jitter = demoTimingJitterRef.current.get(note.id) ?? {
                beatOffset: 0,
                cents: 0,
              };
              const triggerBeat = note.startBeat + jitter.beatOffset;
              if (state.currentBeat >= triggerBeat && state.currentBeat <= triggerBeat + 0.35) {
                demoTriggeredNotesRef.current.add(note.id);
                const durSec = Math.max(0.22, (note.durationBeats * 0.9) / beatsPerSec);
                engine?.triggerInstrumentNote(
                  `demo-${part.id}`,
                  part.instrument,
                  note.midi,
                  durSec,
                  jitter.cents,
                  0.74
                );
              }
            }
          });
        }

        // Build active expected notes per musician for the polyphonic single-mic DSP model
        const expectedParts = score.parts.map((part) => {
          const activeNote =
            part.notes.find(
              (n) =>
                state.currentBeat >= n.startBeat - 0.14 &&
                state.currentBeat < n.startBeat + Math.max(0.25, n.durationBeats - 0.06)
            ) ?? null;
          return {
            partId: part.id,
            instrument: part.instrument,
            activeNote,
          };
        });

        // Read single-mic / shared AnalyserNode FFT spectrum and run multi-instrument inference
        const engine = audioRef.current;
        let inferences: MusicianFrameInference[];
        let micRms = 0;

        if (engine) {
          const spectrum = engine.readLinearSpectrum();
          micRms = engine.readInputLevel();
          inferences = analyzePolyphonicFrame(
            spectrum,
            engine.getSampleRate(),
            engine.getFftSize(),
            expectedParts,
            inputModeRef.current === 'mic' ? 0.02 : 0.014
          );
        } else {
          inferences = expectedParts.map((ep) => ({
            partId: ep.partId,
            isActive: false,
            energy: 0,
            expectedMidi: ep.activeNote?.midi ?? null,
            detectedFreq: null,
            centsError: 0,
            timbreScore: 0,
            timbreDescriptor: 'Listening',
            pitchDescriptor: 'Listening',
            harmonics: [0, 0, 0, 0, 0, 0, 0, 0],
          }));
        }

        // Process each musician's frame inference + note evaluation
        score.parts.forEach((part, pIdx) => {
          let inf = inferences[pIdx];
          const activeNote = expectedParts[pIdx].activeNote;

          // If Ensemble Demo triggered a note in headless/suspended audio or low-gain envelope,
          // ensure its acoustic harmonic signature still scores faithfully alongside real FFT.
          if (
            inputModeRef.current === 'ensemble-demo' &&
            activeNote &&
            !inf.isActive &&
            state.currentBeat >= activeNote.startBeat - 0.03
          ) {
            const jitter = demoTimingJitterRef.current.get(activeNote.id) ?? {
              beatOffset: 0,
              cents: 0,
            };
            const cents = jitter.cents;
            const timbre = 86 + ((pIdx * 7 + activeNote.midi) % 12);
            inf = {
              partId: part.id,
              isActive: true,
              energy: 0.72,
              expectedMidi: activeNote.midi,
              detectedFreq: 440,
              centsError: cents,
              timbreScore: timbre,
              timbreDescriptor: timbre >= 88 ? 'Rich & True' : 'Warm Tone',
              pitchDescriptor:
                Math.abs(cents) <= 8
                  ? 'Locked'
                  : cents > 0
                  ? `Sharp +${cents}¢`
                  : `Flat ${cents}¢`,
              harmonics: [1, 0.74, 0.52, 0.36, 0.24, 0.16, 0.11, 0.07],
            };
            micRms = Math.max(micRms, 0.42);
          }

          state.liveInference.set(part.id, inf);

          // Update live telemetry on mutable stats ref
          const stat = liveStatsRef.current[pIdx];
          if (stat) {
            stat.liveCents = inf.centsError;
            stat.liveTimbre = inf.timbreScore;
            stat.liveEnergy = inf.energy;
            stat.livePitchLabel = inf.pitchDescriptor;
            stat.liveTimbreLabel = inf.timbreDescriptor;
            stat.liveHarmonics = inf.harmonics;
          }

          // Append to pitch contour trace behind playhead
          if (inf.isActive && activeNote) {
            let hist = state.pitchHistory.get(part.id);
            if (!hist) {
              hist = [];
              state.pitchHistory.set(part.id, hist);
            }
            const lastSample = hist[hist.length - 1];
            if (!lastSample || state.currentBeat - lastSample.beat >= 0.06) {
              const sample: PitchTraceSample = {
                beat: state.currentBeat,
                centsError: inf.centsError,
                midi: activeNote.midi,
                timbreScore: inf.timbreScore,
              };
              hist.push(sample);
              if (hist.length > 70) hist.shift();
            }
          }

          // Evaluate notes crossing the playhead onset window ([-75ms, +175ms])
          const earlyWindowBeats = 0.075 * beatsPerSec;
          const lateWindowBeats = 0.175 * beatsPerSec;
          for (const note of part.notes) {
            if (state.hitResults.has(note.id)) continue;
            const deltaBeats = state.currentBeat - note.startBeat;

            // Live detection hit inside crisp onset window
            if (
              deltaBeats >= -earlyWindowBeats &&
              deltaBeats <= lateWindowBeats &&
              inf.isActive &&
              inf.energy >= 0.14
            ) {
              const timingMs = (deltaBeats / beatsPerSec) * 1000;
              recordNoteEvaluation(
                pIdx,
                note.id,
                note.midi,
                timingMs,
                inf.centsError,
                inf.timbreScore,
                state.currentBeat
              );
              break;
            }

            // Note passed scoring window without a valid detection -> MISS
            if (deltaBeats > lateWindowBeats + 0.05) {
              recordNoteEvaluation(pIdx, note.id, note.midi, 260, 60, 0, state.currentBeat);
            }
          }
        });

        // Throttled HUD update (~12 Hz)
        if (now - lastHudSyncTs >= 82) {
          lastHudSyncTs = now;
          const { multiplier } = computeEnsembleSynergy(liveStatsRef.current.map((s) => s.combo));
          setHudScore(Math.round(totalEnsembleScoreRef.current));
          setHudSynergy(multiplier);
          setHudCurrentBeat(state.currentBeat);
          setHudMicLevel(micRms);
          setMusicianStats(liveStatsRef.current.map((s) => ({ ...s })));
        }

        // Piece completion check
        if (state.currentBeat >= score.totalBeats) {
          finalizePerformance();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [finalizePerformance, recordNoteEvaluation]);

  const handleSelectNewScore = (score: EnsembleScore) => {
    setActiveScore(score);
    setVideoOffsetSec(score.youtubeOffsetSec || 0);
    if (score.isCustomUploaded) {
      setRepertoire((prev) => [score, ...prev.filter((s) => s.id !== score.id)]);
      setMonitorOpen(true);
      setMonitorTab('video');
    }
    if (phase === 'playing' || phase === 'paused' || phase === 'gameover') {
      handleStartGame(score);
    } else {
      resetRunState(score);
    }
  };

  const currentSec = (hudCurrentBeat / (activeScore.bpm / 60)) / playbackRate;
  const beatsPerMeasure = activeScore.timeSignature[0] || 4;
  const currentMeasure = Math.min(
    Math.ceil(activeScore.totalBeats / beatsPerMeasure),
    Math.floor(hudCurrentBeat / beatsPerMeasure) + 1
  );
  const totalMeasures = Math.ceil(activeScore.totalBeats / beatsPerMeasure);
  const progressPct = Math.min(100, Math.max(0, (hudCurrentBeat / activeScore.totalBeats) * 100));

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0E1116] text-[#F3EFE6] flex flex-col">
      {phase === 'title' ? (
        <TitleScreen
          repertoire={repertoire}
          selectedScore={activeScore}
          inputMode={inputMode}
          onSelectScore={handleSelectNewScore}
          onSelectInputMode={handleSwitchInputMode}
          onStart={() => handleStartGame()}
          onOpenUpload={() => setUploadModalOpen(true)}
        />
      ) : (
        <>
          {/* Compact Concert Stage HUD Bar (Game Shell Perimeter, No Marketing Nav) */}
          <div className="shrink-0 h-14 px-4 bg-[#12161E] border-b border-[#252B38] flex items-center justify-between gap-4">
            {/* Left: Active Score Identity & Measure Progress */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-display font-bold text-[#F6F1E6] truncate">
                    {activeScore.title}
                  </h1>
                  <span className="text-xs font-mono tabular-nums text-[#9A9284] whitespace-nowrap shrink-0">
                    m.{currentMeasure}/{totalMeasures}
                  </span>
                </div>
                <div className="w-40 h-1 mt-1.5 rounded-full bg-[#222836] overflow-hidden">
                  <div
                    className="h-full bg-[#D4A34A] transition-all duration-100"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Center: Prominent Tabular Ensemble Score, Synergy Multiplier & Single-Mic Switch */}
            <div className="flex items-center gap-5 shrink-0">
              <div className="flex items-baseline gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-[#8E8779]">
                    Ensemble Score
                  </div>
                  <div
                    data-testid="ensemble-score"
                    className="text-xl font-mono font-bold tabular-nums text-[#F6F1E6] leading-none mt-0.5"
                  >
                    {hudScore.toLocaleString()}
                  </div>
                </div>
                <div className="text-left pl-3 border-l border-[#282F3E]">
                  <div className="text-[10px] uppercase tracking-wider text-[#8E8779]">Synergy</div>
                  <div className="text-xl font-mono font-bold tabular-nums text-[#D4A34A] leading-none mt-0.5">
                    {hudSynergy}x
                  </div>
                </div>
              </div>

              {/* Input Mode Switch + Single-Mic Live Level Meter */}
              <div className="hidden lg:flex items-center gap-2 bg-[#0E1116] border border-[#252B38] rounded-lg p-1">
                {(
                  [
                    { id: 'mic', label: 'Single Mic' },
                    { id: 'ensemble-demo', label: 'Demo' },
                    { id: 'practice', label: 'Keys 1–4' },
                  ] as Array<{ id: InputSourceMode; label: string }>
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.currentTarget.blur()}
                    onClick={() => handleSwitchInputMode(mode.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inputMode === mode.id
                        ? 'bg-[#262D3D] text-[#F6F1E6]'
                        : 'text-[#8F887A] hover:text-[#DFD9CC]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
                {/* Single-mic real RMS input meter */}
                <div
                  className="flex items-center gap-1.5 pl-2 pr-1.5 border-l border-[#252B38]"
                  title="Single-microphone acoustic signal level"
                >
                  {inputMode === 'mic' && micStatus === 'denied' ? (
                    <MicOff className="w-3.5 h-3.5 text-[#E05A5A]" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-[#D4A34A]" />
                  )}
                  <div className="w-14 h-2 rounded bg-[#1B202C] overflow-hidden">
                    <div
                      className="h-full transition-all duration-75"
                      style={{
                        width: `${Math.max(4, Math.min(100, Math.round(hudMicLevel * 100)))}%`,
                        backgroundColor: hudMicLevel > 0.78 ? '#E05A5A' : '#3CC98D',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Stage Utility Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Tempo Speed */}
              <select
                value={playbackRate}
                onChange={(e) => {
                  setPlaybackRate(Number(e.target.value));
                  e.currentTarget.blur();
                }}
                aria-label="Playback tempo speed"
                className="h-8 px-2 rounded bg-[#191E2A] border border-[#2B3242] text-xs font-mono text-[#E8D5AD] cursor-pointer"
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.15}>1.15x</option>
              </select>

              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.currentTarget.blur()}
                onClick={() => setMetronomeOn((prev) => !prev)}
                aria-label={metronomeOn ? 'Turn metronome off' : 'Turn metronome on'}
                className={`h-8 px-2.5 rounded border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  metronomeOn
                    ? 'bg-[#222836] border-[#D4A34A]/60 text-[#F0CF86]'
                    : 'bg-[#191E2A] border-[#2B3242] text-[#8E8779]'
                }`}
              >
                Click
              </button>

              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.currentTarget.blur()}
                onClick={() => setMonitorOpen((prev) => !prev)}
                aria-label={monitorOpen ? 'Hide YouTube video monitor' : 'Show YouTube video monitor'}
                className={`h-8 px-2.5 rounded border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  monitorOpen
                    ? 'bg-[#222836] border-[#D4A34A]/60 text-[#F3EFE6]'
                    : 'bg-[#191E2A] border-[#2B3242] text-[#A69F92]'
                }`}
              >
                {activeScore.pdfBlobUrl && monitorTab === 'pdf' ? (
                  <FileText className="w-3.5 h-3.5" />
                ) : (
                  <Film className="w-3.5 h-3.5" />
                )}
                Video
              </button>

              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.currentTarget.blur()}
                onClick={() => {
                  audioRef.current?.stopAllVoices();
                  renderStateRef.current.isPlaying = false;
                  setPhase('paused');
                  setUploadModalOpen(true);
                }}
                aria-label="Upload PDF sheet music and YouTube URL"
                className="h-8 px-2.5 rounded bg-[#191E2A] hover:bg-[#232A38] border border-[#2B3242] text-xs font-medium text-[#F3EFE6] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#D4A34A]" />
                Score
              </button>

              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.currentTarget.blur()}
                onClick={() => {
                  setIsMuted((prev) => {
                    const next = !prev;
                    audioRef.current?.setMuted(next);
                    return next;
                  });
                }}
                aria-label={isMuted ? 'Unmute audio (M)' : 'Mute audio (M)'}
                className="w-8 h-8 rounded bg-[#191E2A] hover:bg-[#232A38] border border-[#2B3242] flex items-center justify-center text-[#D8D1C4] cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-[#E05A5A]" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.currentTarget.blur()}
                onClick={() => handleStartGame()}
                aria-label="Restart piece (R)"
                className="w-8 h-8 rounded bg-[#191E2A] hover:bg-[#232A38] border border-[#2B3242] flex items-center justify-center text-[#D8D1C4] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.currentTarget.blur()}
                onClick={() => {
                  if (phase === 'playing') {
                    audioRef.current?.stopAllVoices();
                    renderStateRef.current.isPlaying = false;
                    setPhase('paused');
                  } else if (phase === 'paused') {
                    renderStateRef.current.isPlaying = true;
                    setPhase('playing');
                  }
                }}
                aria-label={phase === 'playing' ? 'Pause performance (Esc)' : 'Resume performance'}
                className="w-8 h-8 rounded bg-[#D4A34A] hover:bg-[#E1B45F] flex items-center justify-center text-[#111318] cursor-pointer"
              >
                {phase === 'playing' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Inline Microphone Permission Notice (Only shown if Mic Mode denied/unavailable) */}
          {inputMode === 'mic' && (micStatus === 'denied' || micStatus === 'unavailable') && (
            <div className="shrink-0 px-4 py-1.5 bg-[#2A181B] border-b border-[#6E2D35] flex items-center justify-between text-xs text-[#F3C1C5]">
              <span>
                Microphone access is unavailable or blocked. Grant microphone permission to score live acoustic instruments, or switch to Ensemble Demo / Keys 1–4.
              </span>
              <button
                type="button"
                onClick={() => handleSwitchInputMode('ensemble-demo')}
                className="px-2.5 py-1 rounded bg-[#D4A34A] text-[#111318] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Switch to Ensemble Demo
              </button>
            </div>
          )}

          {/* Central Stage: Dominant Scrolling Engraved Sheet Music Canvas + Dockable YouTube Monitor */}
          <div className="flex-1 min-h-0 flex gap-3 px-4 pt-3 pb-2">
            <div className="flex-1 min-w-0 h-full">
              <SheetMusicCanvas
                renderStateRef={renderStateRef}
                onLaneClick={triggerMusicianPracticeStrike}
              />
            </div>

            <YouTubeSyncPlayer
              videoId={activeScore.youtubeVideoId}
              pdfBlobUrl={activeScore.pdfBlobUrl}
              pdfFileName={activeScore.pdfFileName}
              isPlaying={phase === 'playing'}
              currentSec={currentSec}
              offsetSec={videoOffsetSec}
              playbackRate={playbackRate}
              isOpen={monitorOpen}
              activeTab={monitorTab}
              onTabChange={setMonitorTab}
              onOffsetChange={setVideoOffsetSec}
              onClose={() => setMonitorOpen(false)}
            />
          </div>

          {/* Bottom Concert Desk: Real-Time Timing, Pitch & Timbre Telemetry per Musician */}
          <div className="shrink-0 px-4 pb-3 pt-1">
            <MusicianTelemetryStrip
              musicians={musicianStats}
              keyBindings={activeScore.parts.map((p) => p.keyBinding)}
              onTriggerPracticeNote={triggerMusicianPracticeStrike}
            />
          </div>
        </>
      )}

      {/* Focused Pause Modal */}
      {phase === 'paused' && !uploadModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-heading"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75"
        >
          <div className="w-full max-w-md bg-[#141821] border border-[#2D3445] rounded-xl p-6 shadow-2xl space-y-5">
            <div>
              <div className="text-xs text-[#D4A34A] font-medium">Performance Paused</div>
              <h2
                id="pause-modal-heading"
                className="text-2xl font-display font-bold text-[#F6F1E6] mt-0.5"
              >
                {activeScore.title}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#10131B] border border-[#252B38]">
                <div className="text-[11px] text-[#8E8779]">Current Score</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#F3EFE6] mt-0.5">
                  {hudScore.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#10131B] border border-[#252B38]">
                <div className="text-[11px] text-[#8E8779]">Measure</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#F3EFE6] mt-0.5">
                  {currentMeasure} / {totalMeasures}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  renderStateRef.current.isPlaying = true;
                  setPhase('playing');
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-[#D4A34A] hover:bg-[#E1B45F] text-sm font-semibold text-[#111318] transition-colors cursor-pointer"
              >
                Resume Performance
              </button>
              <button
                type="button"
                onClick={() => handleStartGame()}
                className="w-full py-2.5 px-4 rounded-lg bg-[#222836] hover:bg-[#2B3345] text-sm font-medium text-[#F3EFE6] transition-colors cursor-pointer"
              >
                Restart from Measure 1
              </button>
              <button
                type="button"
                onClick={finalizePerformance}
                className="w-full py-2.5 px-4 rounded-lg bg-[#1A1F2B] hover:bg-[#242B3B] border border-[#2E3648] text-sm font-medium text-[#E8D5AD] transition-colors cursor-pointer"
              >
                Finish &amp; View Report
              </button>
              <button
                type="button"
                onClick={() => {
                  audioRef.current?.stopAllVoices();
                  renderStateRef.current.isPlaying = false;
                  setPhase('title');
                }}
                className="w-full py-2 px-4 rounded-lg text-xs font-medium text-[#9A9284] hover:text-[#F3EFE6] cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Encore Performance Summary Modal */}
      {phase === 'gameover' && summarySnapshot && !uploadModalOpen && (
        <PerformanceReportModal
          summary={summarySnapshot}
          onPlayAgain={() => handleStartGame()}
          onOpenUpload={() => setUploadModalOpen(true)}
          onReturnTitle={() => setPhase('title')}
        />
      )}

      {/* PDF Sheet Music & YouTube Studio Modal */}
      <UploadScoreModal
        isOpen={uploadModalOpen}
        repertoire={repertoire}
        activeScoreId={activeScore.id}
        onClose={() => setUploadModalOpen(false)}
        onSelectScore={handleSelectNewScore}
      />
    </div>
  );
}
