import {
  INSTRUMENT_TIMBRE_PROFILES,
  midiToFreq,
} from '../game/audioMath';
import type { HitGrade, InstrumentFamily } from '../game/types';

export type MicStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable';

interface ActiveVoice {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  stopAt: number;
}

/**
 * Single-microphone & acoustic-practice Web Audio engine.
 * Routes EITHER the live physical microphone OR synthesized multi-harmonic ensemble
 * instruments into the exact same 4096-pt AnalyserNode so the DSP polyphonic
 * inference model scores real FFT spectra in every mode.
 */
export class AcousticEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private synthBus: GainNode | null = null;
  private speakerBus: GainNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;

  private periodicWaves = new Map<InstrumentFamily, PeriodicWave>();
  private dbBuffer: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private linearBuffer: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private timeBuffer: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private activeVoices = new Map<string, ActiveVoice>();

  public micStatus: MicStatus = 'idle';
  public isMuted = false;

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.25;
      this.analyser.minDecibels = -95;
      this.analyser.maxDecibels = -12;

      this.dbBuffer = new Float32Array(this.analyser.frequencyBinCount);
      this.linearBuffer = new Float32Array(this.analyser.frequencyBinCount);
      this.timeBuffer = new Float32Array(this.analyser.fftSize);

      this.synthBus = this.ctx.createGain();
      this.synthBus.gain.value = 0.72;

      this.speakerBus = this.ctx.createGain();
      this.speakerBus.gain.value = this.isMuted ? 0 : 0.45;

      // Synth goes into BOTH analyser (for real FFT DSP scoring) AND speakers
      this.synthBus.connect(this.analyser);
      this.synthBus.connect(this.speakerBus);
      this.speakerBus.connect(this.ctx.destination);

      this.buildPeriodicWaves();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Autoplay policies may keep context suspended until user gesture
      });
    }

    return this.ctx;
  }

  private buildPeriodicWaves(): void {
    if (!this.ctx) return;
    (Object.keys(INSTRUMENT_TIMBRE_PROFILES) as InstrumentFamily[]).forEach((inst) => {
      const profile = INSTRUMENT_TIMBRE_PROFILES[inst];
      const real = new Float32Array(profile.harmonics.length + 1);
      const imag = new Float32Array(profile.harmonics.length + 1);
      real[0] = 0;
      imag[0] = 0;
      for (let i = 0; i < profile.harmonics.length; i++) {
        // Place harmonic amplitudes in sine terms (imag)
        imag[i + 1] = profile.harmonics[i];
      }
      this.periodicWaves.set(inst, this.ctx!.createPeriodicWave(real, imag, { disableNormalization: false }));
    });
  }

  public async enableMicrophone(): Promise<MicStatus> {
    const ctx = this.ensureContext();
    if (!ctx || !this.analyser) {
      this.micStatus = 'unavailable';
      return this.micStatus;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.micStatus = 'unavailable';
      return this.micStatus;
    }

    if (this.micStream && this.micStatus === 'active') {
      return 'active';
    }

    this.micStatus = 'requesting';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micGain = ctx.createGain();
      this.micGain.gain.value = 1.65;
      // Microphone feeds ONLY the analyser (never speakers -> prevents acoustic feedback)
      this.micSource.connect(this.micGain);
      this.micGain.connect(this.analyser);
      this.micStatus = 'active';
      return 'active';
    } catch {
      this.micStatus = 'denied';
      return 'denied';
    }
  }

  public disableMicrophone(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // ignore
      }
      this.micSource = null;
    }
    if (this.micGain) {
      try {
        this.micGain.disconnect();
      } catch {
        // ignore
      }
      this.micGain = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micStatus === 'active') {
      this.micStatus = 'idle';
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.speakerBus && this.ctx) {
      this.speakerBus.gain.setTargetAtTime(muted ? 0 : 0.45, this.ctx.currentTime, 0.02);
    }
  }

  public getSampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  public getFftSize(): number {
    return this.analyser?.fftSize ?? 4096;
  }

  /**
   * Triggers a realistic multi-harmonic instrument voice routed through the AnalyserNode.
   * Used both for interactive Practice Mode (keys 1-4 / lane clicks) and Ensemble Demo.
   */
  public triggerInstrumentNote(
    voiceKey: string,
    instrument: InstrumentFamily,
    midi: number,
    durationSec: number,
    centsDetune = 0,
    velocity = 0.72
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.synthBus) return;

    this.stopVoice(voiceKey);

    const profile = INSTRUMENT_TIMBRE_PROFILES[instrument];
    const now = ctx.currentTime;
    const freq = midiToFreq(midi) * Math.pow(2, centsDetune / 1200);

    const osc = ctx.createOscillator();
    const wave = this.periodicWaves.get(instrument);
    if (wave) {
      osc.setPeriodicWave(wave);
    } else {
      osc.type = 'sawtooth';
    }
    osc.frequency.setValueAtTime(freq, now);

    // Subtle acoustic filter tailored per instrument family
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(
      instrument === 'flute'
        ? freq * 4.5
        : instrument === 'trumpet'
        ? freq * 9.5
        : freq * 7.0,
      now
    );
    filter.Q.value = instrument === 'violin' || instrument === 'cello' ? 1.4 : 0.8;

    const gain = ctx.createGain();
    const attackSec = profile.synthAttackMs / 1000;
    const releaseSec = profile.synthReleaseMs / 1000;
    const clampedDur = Math.max(0.14, Math.min(4.0, durationSec));
    const peakGain = Math.min(0.32, Math.max(0.1, velocity * 0.28));

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + attackSec);
    gain.gain.setValueAtTime(peakGain * 0.86, now + Math.max(attackSec + 0.02, clampedDur - releaseSec));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + clampedDur + 0.04);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthBus);

    osc.start(now);
    const stopAt = now + clampedDur + 0.06;
    osc.stop(stopAt);

    this.activeVoices.set(voiceKey, { osc, gain, filter, stopAt });
    osc.onended = () => {
      const existing = this.activeVoices.get(voiceKey);
      if (existing?.osc === osc) {
        this.activeVoices.delete(voiceKey);
      }
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  public stopVoice(voiceKey: string): void {
    const voice = this.activeVoices.get(voiceKey);
    if (!voice || !this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, 0.02);
      voice.osc.stop(now + 0.06);
    } catch {
      // already stopped
    }
    this.activeVoices.delete(voiceKey);
  }

  public stopAllVoices(): void {
    for (const key of Array.from(this.activeVoices.keys())) {
      this.stopVoice(key);
    }
  }

  /**
   * Woodblock metronome click routed directly to speakers (bypasses analyser so it never interferes with scoring).
   */
  public playMetronomeClick(isDownbeat: boolean): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.speakerBus) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDownbeat ? 1180 : 820, now);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 620 : 440, now + 0.035);

    gain.gain.setValueAtTime(isDownbeat ? 0.14 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.speakerBus);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Subtle acoustic feedback chime on note hit (bypasses analyser).
   */
  public playHitChime(grade: HitGrade): void {
    if (this.isMuted || grade === 'MISS') return;
    const ctx = this.ensureContext();
    if (!ctx || !this.speakerBus) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const baseFreq = grade === 'PERFECT' ? 1318.5 : grade === 'GREAT' ? 1046.5 : 880;
    osc.frequency.setValueAtTime(baseFreq, now);

    gain.gain.setValueAtTime(grade === 'PERFECT' ? 0.045 : 0.028, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.speakerBus);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Reads the current FFT spectrum from the AnalyserNode into a pre-allocated linear [0..1] buffer.
   */
  public readLinearSpectrum(): Float32Array {
    if (!this.analyser) {
      this.linearBuffer.fill(0);
      return this.linearBuffer;
    }

    this.analyser.getFloatFrequencyData(this.dbBuffer);
    const len = this.dbBuffer.length;
    for (let i = 0; i < len; i++) {
      const db = this.dbBuffer[i];
      if (!Number.isFinite(db) || db <= -90) {
        this.linearBuffer[i] = 0;
      } else {
        // Convert dBFS to scaled linear amplitude (0..1) with acoustic headroom
        const lin = Math.pow(10, (db + 26) / 20);
        this.linearBuffer[i] = lin > 1 ? 1 : lin;
      }
    }
    return this.linearBuffer;
  }

  /**
   * Returns current normalized RMS input energy (0..1) for the single-mic level meter.
   */
  public readInputLevel(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.timeBuffer);
    let sumSq = 0;
    const step = 4;
    for (let i = 0; i < this.timeBuffer.length; i += step) {
      const v = this.timeBuffer[i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / (this.timeBuffer.length / step));
    return Math.min(1, rms * 4.5);
  }

  public dispose(): void {
    this.stopAllVoices();
    this.disableMicrophone();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
