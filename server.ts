import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  INSTRUMENT_TIMBRE_PROFILES,
  extractYouTubeVideoId,
  pitchNameToMidi,
} from './src/game/audioMath';
import type { ClefType, EnsembleScore, InstrumentFamily } from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Configure it in Settings > Secrets to analyze uploaded PDF scores.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VALID_INSTRUMENTS: InstrumentFamily[] = [
  'violin',
  'cello',
  'flute',
  'trumpet',
  'clarinet',
  'guitar',
  'piano',
  'saxophone',
];

function normalizeInstrument(raw: string): InstrumentFamily {
  const lower = (raw || '').toLowerCase();
  for (const inst of VALID_INSTRUMENTS) {
    if (lower.includes(inst)) return inst;
  }
  if (lower.includes('sax')) return 'saxophone';
  if (lower.includes('horn') || lower.includes('brass')) return 'trumpet';
  if (lower.includes('bass') || lower.includes('viola')) return 'cello';
  if (lower.includes('woodwind') || lower.includes('oboe') || lower.includes('piccolo')) return 'flute';
  if (lower.includes('keys') || lower.includes('keyboard')) return 'piano';
  return 'violin';
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'partitura' });
  });

  // Analyze uploaded PDF sheet music + YouTube URL into a playable multi-musician scrolling score
  app.post('/api/score/analyze', async (req, res) => {
    try {
      const { pdfBase64, fileName, youtubeUrl, customBpm, musicianOverrides } = req.body ?? {};

      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        res.status(400).json({ error: 'Please upload a valid PDF sheet music file.' });
        return;
      }

      const videoId = typeof youtubeUrl === 'string' ? extractYouTubeVideoId(youtubeUrl) : null;
      if (!videoId) {
        res.status(400).json({
          error: 'Please enter a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...).',
        });
        return;
      }

      const ai = getGeminiClient();

      const rosterHint = Array.isArray(musicianOverrides) && musicianOverrides.length > 0
        ? `Preferred musician roster: ${musicianOverrides.map((m: { name?: string; instrument?: string }) => `${m.name || 'Player'} (${m.instrument || 'violin'})`).join(', ')}.`
        : 'Identify up to 4 distinct instrumental parts from the score (or arrange 2-3 ensemble voices if it is a piano/lead sheet).';

      const prompt = [
        'You are an expert optical music recognition (OMR) and ensemble transcription engine for a live acoustic rhythm game.',
        `Analyze the attached PDF sheet music ("${String(fileName || 'score.pdf')}") paired with YouTube video ID "${videoId}".`,
        rosterHint,
        customBpm ? `Target tempo override: ${Number(customBpm)} BPM.` : 'Estimate the accurate performance BPM from tempo markings.',
        'Extract the first 12 to 20 measures (starting at beat 4 to give musicians a 1-measure count-in) into structured playable notes per musician.',
        'Use standard scientific pitch notation (e.g., "C4", "F#5", "Bb3", "D3").',
        'Supported instrument categories: violin, cello, flute, trumpet, clarinet, guitar, piano, saxophone.',
        'Keep note startBeat monotonic per part, with realistic rhythms (0.5, 1, 1.5, 2, 3, or 4 beats).',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              composer: { type: Type.STRING },
              bpm: { type: Type.NUMBER },
              timeSignatureTop: { type: Type.INTEGER },
              timeSignatureBottom: { type: Type.INTEGER },
              keySignature: { type: Type.STRING },
              youtubeOffsetSec: { type: Type.NUMBER },
              parts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    musicianName: { type: Type.STRING },
                    instrument: { type: Type.STRING },
                    clef: { type: Type.STRING },
                    notes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          pitch: { type: Type.STRING },
                          startBeat: { type: Type.NUMBER },
                          durationBeats: { type: Type.NUMBER },
                          dynamics: { type: Type.STRING },
                        },
                        required: ['pitch', 'startBeat', 'durationBeats'],
                      },
                    },
                  },
                  required: ['musicianName', 'instrument', 'notes'],
                },
              },
            },
            required: ['title', 'composer', 'bpm', 'parts'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'The audio-score model returned an empty transcription.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      const rawParts = Array.isArray(parsed.parts) ? parsed.parts.slice(0, 4) : [];

      if (rawParts.length === 0) {
        res.status(422).json({
          error: 'No readable musical staves or notes were detected in this PDF. Try a clearer engraving.',
        });
        return;
      }

      let maxBeat = 32;
      const keyBindings = ['1', '2', '3', '4'];

      const parts = rawParts.map(
        (
          p: {
            musicianName?: string;
            instrument?: string;
            clef?: string;
            notes?: Array<{
              pitch: string;
              startBeat: number;
              durationBeats: number;
              dynamics?: string;
            }>;
          },
          idx: number
        ) => {
          const instrument = normalizeInstrument(p.instrument ?? 'violin');
          const profile = INSTRUMENT_TIMBRE_PROFILES[instrument];
          const clef: ClefType =
            p.clef?.toLowerCase() === 'bass' ? 'bass' : profile.defaultClef;

          const notes = (Array.isArray(p.notes) ? p.notes : [])
            .map((n, nIdx) => {
              const startBeat = Math.max(4, Number(n.startBeat) || 4);
              const durationBeats = Math.max(0.25, Math.min(8, Number(n.durationBeats) || 1));
              const endBeat = startBeat + durationBeats;
              if (endBeat > maxBeat) maxBeat = endBeat;
              const dyn =
                n.dynamics === 'p' || n.dynamics === 'mp' || n.dynamics === 'mf' || n.dynamics === 'f'
                  ? n.dynamics
                  : 'mf';
              return {
                id: `custom-${idx}-${nIdx}`,
                pitch: String(n.pitch || 'C4'),
                midi: pitchNameToMidi(String(n.pitch || 'C4')),
                startBeat,
                durationBeats,
                dynamics: dyn,
              };
            })
            .sort((a, b) => a.startBeat - b.startBeat);

          return {
            id: `custom-part-${idx}`,
            musicianName: String(p.musicianName || `Musician ${idx + 1}`),
            instrument,
            clef,
            accentColor: profile.defaultColor,
            keyBinding: keyBindings[idx] ?? String(idx + 1),
            notes,
          };
        }
      );

      const score: EnsembleScore = {
        id: `custom-${Date.now()}`,
        title: String(parsed.title || fileName || 'Uploaded Ensemble Score'),
        composer: String(parsed.composer || 'Uploaded Score Transcription'),
        subtitle: parts.map((p: { instrument: InstrumentFamily }) => INSTRUMENT_TIMBRE_PROFILES[p.instrument].label).join(' · '),
        bpm: Math.max(48, Math.min(200, Math.round(Number(customBpm) || Number(parsed.bpm) || 96))),
        timeSignature: [
          Math.max(2, Math.min(12, Number(parsed.timeSignatureTop) || 4)),
          Number(parsed.timeSignatureBottom) || 4,
        ],
        keySignature: String(parsed.keySignature || 'C major'),
        totalBeats: Math.ceil(maxBeat / 4) * 4 + 4,
        youtubeUrl: String(youtubeUrl),
        youtubeVideoId: videoId,
        youtubeOffsetSec: Number(parsed.youtubeOffsetSec) || 0,
        pdfFileName: String(fileName || 'score.pdf'),
        isCustomUploaded: true,
        parts,
      };

      res.json({ score });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze uploaded PDF score.';
      console.error('[score/analyze]', err);
      res.status(500).json({ error: message });
    }
  });

  // Generate post-performance ensemble conductor coaching notes from real measured telemetry
  app.post('/api/performance/critique', async (req, res) => {
    try {
      const { summary } = req.body ?? {};
      if (!summary || !Array.isArray(summary.musicians)) {
        res.status(400).json({ error: 'Missing performance summary payload.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = [
        'You are a warm, incisive chamber-music conductor reviewing an ensemble rhythm-game performance.',
        'Base every observation strictly on the measured acoustic telemetry below (timing in ms, pitch intonation in cents, harmonic timbre match %).',
        JSON.stringify(summary),
        'Return concise, musical, encouraging feedback: one 6-word headline, one 2-sentence ensemble summary, and one 1-sentence coaching tip per musician.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              ensembleSummary: { type: Type.STRING },
              musicianNotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    musicianName: { type: Type.STRING },
                    instrument: { type: Type.STRING },
                    feedback: { type: Type.STRING },
                  },
                  required: ['musicianName', 'instrument', 'feedback'],
                },
              },
            },
            required: ['headline', 'ensembleSummary', 'musicianNotes'],
          },
        },
      });

      const critique = JSON.parse((response.text ?? '{}').trim());
      res.json({ critique });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate conductor critique.';
      console.error('[performance/critique]', err);
      res.status(500).json({ error: message });
    }
  });

  if (IS_PROD) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Partitura server listening on http://localhost:${PORT}`);
  });
}

createServer();
