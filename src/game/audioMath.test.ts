import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTRUMENT_TIMBRE_PROFILES,
  analyzePolyphonicFrame,
  computeEnsembleSynergy,
  computePerformanceRank,
  computeTimbreMatch,
  evaluateNoteHit,
  extractYouTubeVideoId,
  freqToCentsError,
  midiToFreq,
  midiToPitchName,
  midiToStaffPosition,
  pitchNameToMidi,
} from './audioMath';

test('MIDI <-> frequency & pitch name conversions are accurate', () => {
  assert.equal(Math.round(midiToFreq(69)), 440); // A4
  assert.equal(Math.round(midiToFreq(60) * 100) / 100, 261.63); // C4
  assert.equal(pitchNameToMidi('A4'), 69);
  assert.equal(pitchNameToMidi('C4'), 60);
  assert.equal(pitchNameToMidi('F#5'), 78);
  assert.equal(pitchNameToMidi('Bb3'), 58);
  assert.equal(midiToPitchName(69), 'A4');
  assert.equal(midiToPitchName(60), 'C4');
  assert.equal(Math.round(freqToCentsError(440 * Math.pow(2, 25 / 1200), 440)), 25);
});

test('YouTube URL parser handles standard, short, embed, shorts, and rejects invalid URLs', () => {
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtu.be/9bZkp7q19f0?t=42'),
    '9bZkp7q19f0'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtube.com/embed/kJQP7kiw5Fk'),
    'kJQP7kiw5Fk'
  );
  assert.equal(
    extractYouTubeVideoId('https://m.youtube.com/shorts/abcdefghijk'),
    'abcdefghijk'
  );
  assert.equal(extractYouTubeVideoId('https://vimeo.com/123456789'), null);
  assert.equal(extractYouTubeVideoId('not a url at all'), null);
  assert.equal(extractYouTubeVideoId(''), null);
});

test('Timbre cosine similarity distinguishes instrument harmonic fingerprints', () => {
  const fluteVec = [...INSTRUMENT_TIMBRE_PROFILES.flute.harmonics];
  const trumpetVec = [...INSTRUMENT_TIMBRE_PROFILES.trumpet.harmonics];
  const clarinetVec = [...INSTRUMENT_TIMBRE_PROFILES.clarinet.harmonics];

  const fluteAsFlute = computeTimbreMatch(fluteVec, 'flute').score;
  const fluteAsTrumpet = computeTimbreMatch(fluteVec, 'trumpet').score;
  const clarinetAsClarinet = computeTimbreMatch(clarinetVec, 'clarinet').score;
  const clarinetAsFlute = computeTimbreMatch(clarinetVec, 'flute').score;
  const trumpetAsTrumpet = computeTimbreMatch(trumpetVec, 'trumpet').score;

  assert.ok(fluteAsFlute >= 95, `Expected flute match >= 95, got ${fluteAsFlute}`);
  assert.ok(fluteAsFlute > fluteAsTrumpet + 20, 'Flute spectrum must outscore trumpet on flute profile');
  assert.ok(clarinetAsClarinet >= 95);
  assert.ok(clarinetAsClarinet > clarinetAsFlute + 10);
  assert.ok(trumpetAsTrumpet >= 95);
});

test('Polyphonic single-mic FFT inference separates 3 simultaneous instruments', () => {
  const sampleRate = 44100;
  const fftSize = 4096;
  const binHz = sampleRate / fftSize;
  const spectrum = new Float32Array(fftSize / 2);

  // Helper to inject a realistic instrument harmonic spectrum into the mixed single-mic buffer
  const injectInstrument = (freq: number, harmonics: readonly number[], gain: number) => {
    harmonics.forEach((amp, idx) => {
      const hFreq = freq * (idx + 1);
      const bin = hFreq / binHz;
      const b0 = Math.floor(bin);
      const frac = bin - b0;
      if (b0 >= 1 && b0 < spectrum.length - 1) {
        spectrum[b0] += amp * gain * (1 - frac);
        spectrum[b0 + 1] += amp * gain * frac;
      }
    });
  };

  // Violin playing A4 (440 Hz) perfectly in tune
  injectInstrument(midiToFreq(69), INSTRUMENT_TIMBRE_PROFILES.violin.harmonics, 0.5);
  // Flute playing E5 (659.25 Hz) slightly sharp by +18 cents
  injectInstrument(
    midiToFreq(76) * Math.pow(2, 18 / 1200),
    INSTRUMENT_TIMBRE_PROFILES.flute.harmonics,
    0.55
  );
  // Cello playing D3 (146.83 Hz) slightly flat by -14 cents
  injectInstrument(
    midiToFreq(50) * Math.pow(2, -14 / 1200),
    INSTRUMENT_TIMBRE_PROFILES.cello.harmonics,
    0.5
  );

  const results = analyzePolyphonicFrame(spectrum, sampleRate, fftSize, [
    {
      partId: 'vln',
      instrument: 'violin',
      activeNote: { id: 'n1', pitch: 'A4', midi: 69, startBeat: 0, durationBeats: 1 },
    },
    {
      partId: 'flt',
      instrument: 'flute',
      activeNote: { id: 'n2', pitch: 'E5', midi: 76, startBeat: 0, durationBeats: 1 },
    },
    {
      partId: 'cel',
      instrument: 'cello',
      activeNote: { id: 'n3', pitch: 'D3', midi: 50, startBeat: 0, durationBeats: 1 },
    },
  ]);

  assert.equal(results.length, 3);
  assert.equal(results[0].isActive, true);
  assert.ok(Math.abs(results[0].centsError) <= 8, `Violin cents error expected near 0, got ${results[0].centsError}`);
  assert.ok(results[0].timbreScore >= 70, `Violin timbre expected >= 70, got ${results[0].timbreScore}`);

  assert.equal(results[1].isActive, true);
  assert.ok(
    results[1].centsError >= 10 && results[1].centsError <= 26,
    `Flute cents expected ~+18, got ${results[1].centsError}`
  );

  assert.equal(results[2].isActive, true);
  assert.ok(
    results[2].centsError <= -6 && results[2].centsError >= -24,
    `Cello cents expected ~-14, got ${results[2].centsError}`
  );
});

test('Note hit evaluation grades timing, pitch, and timbre accurately', () => {
  const perf = evaluateNoteHit(12, -5, 92);
  assert.equal(perf.grade, 'PERFECT');
  assert.ok(perf.points > 300);
  assert.equal(perf.timingLabel, 'In Pocket');

  const great = evaluateNoteHit(-80, 25, 72);
  assert.equal(great.grade, 'GREAT');
  assert.match(great.timingLabel, /Early/);

  const good = evaluateNoteHit(150, -45, 50);
  assert.equal(good.grade, 'GOOD');

  const miss = evaluateNoteHit(240, 62, 15);
  assert.equal(miss.grade, 'MISS');
  assert.equal(miss.points, 0);
});

test('Ensemble synergy & staff engraving positions compute cleanly', () => {
  assert.deepEqual(computeEnsembleSynergy([0, 0, 0]), { multiplier: 1, lockPct: 0 });
  assert.deepEqual(computeEnsembleSynergy([5, 4, 6]), { multiplier: 3, lockPct: 100 });
  assert.deepEqual(computeEnsembleSynergy([10, 12, 8]), { multiplier: 4, lockPct: 100 });
  assert.equal(computePerformanceRank(95), 'S');
  assert.equal(computePerformanceRank(78), 'B');

  // Treble middle line is B4 (midi 71 -> step 0)
  assert.deepEqual(midiToStaffPosition(71, 'treble'), { step: 0, accidental: null });
  // Bass middle line is D3 (midi 50 -> step 0)
  assert.deepEqual(midiToStaffPosition(50, 'bass'), { step: 0, accidental: null });
  // F#4 on treble clef should have sharp accidental
  assert.equal(midiToStaffPosition(66, 'treble').accidental, '#');
});
