import React, { useRef, useState } from 'react';
import { FileUp, Link2, Loader2, Music2, Plus, Trash2, X } from 'lucide-react';
import { INSTRUMENT_TIMBRE_PROFILES, extractYouTubeVideoId } from '../game/audioMath';
import type { EnsembleScore, InstrumentFamily } from '../game/types';

interface MusicianDraft {
  id: string;
  name: string;
  instrument: InstrumentFamily;
}

interface UploadScoreModalProps {
  isOpen: boolean;
  repertoire: EnsembleScore[];
  activeScoreId: string;
  onClose: () => void;
  onSelectScore: (score: EnsembleScore) => void;
}

const INSTRUMENT_OPTIONS = Object.keys(INSTRUMENT_TIMBRE_PROFILES) as InstrumentFamily[];

export const UploadScoreModal: React.FC<UploadScoreModalProps> = ({
  isOpen,
  repertoire,
  activeScoreId,
  onClose,
  onSelectScore,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [customBpm, setCustomBpm] = useState('');
  const [musicians, setMusicians] = useState<MusicianDraft[]>([
    { id: 'm1', name: 'Player 1', instrument: 'violin' },
    { id: 'm2', name: 'Player 2', instrument: 'flute' },
    { id: 'm3', name: 'Player 3', instrument: 'cello' },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!isOpen) return null;

  const detectedVideoId = youtubeUrl.trim() ? extractYouTubeVideoId(youtubeUrl) : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Please choose a valid PDF sheet music file (.pdf).');
      setPdfFile(null);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('PDF file exceeds the 15 MB upload limit.');
      setPdfFile(null);
      return;
    }
    setPdfFile(file);
  };

  const handleAddMusician = () => {
    if (musicians.length >= 4) return;
    const nextIdx = musicians.length + 1;
    const defaultInst: InstrumentFamily = nextIdx === 4 ? 'trumpet' : 'clarinet';
    setMusicians((prev) => [
      ...prev,
      { id: `m-${Date.now()}`, name: `Player ${nextIdx}`, instrument: defaultInst },
    ]);
  };

  const handleRemoveMusician = (id: string) => {
    if (musicians.length <= 1) return;
    setMusicians((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!pdfFile) {
      setErrorMsg('Upload a PDF of sheet music before analyzing.');
      return;
    }

    const vid = extractYouTubeVideoId(youtubeUrl);
    if (!vid) {
      setErrorMsg(
        'Enter a valid YouTube video URL (for example https://www.youtube.com/watch?v=... or https://youtu.be/...).'
      );
      return;
    }

    setIsAnalyzing(true);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const pdfBase64 = btoa(binary);
      const pdfBlobUrl = URL.createObjectURL(pdfFile);

      const res = await fetch('/api/score/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
          fileName: pdfFile.name,
          youtubeUrl: youtubeUrl.trim(),
          customBpm: customBpm ? Number(customBpm) : undefined,
          musicianOverrides: musicians.map((m) => ({
            name: m.name.trim() || 'Musician',
            instrument: m.instrument,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        URL.revokeObjectURL(pdfBlobUrl);
        throw new Error(data.error || 'Could not transcribe uploaded sheet music.');
      }

      const loadedScore: EnsembleScore = {
        ...data.score,
        pdfBlobUrl,
        pdfFileName: pdfFile.name,
      };
      onSelectScore(loadedScore);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process score.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-score-heading"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
    >
      <div className="w-full max-w-3xl max-h-[90vh] bg-[#141821] border border-[#2B3242] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#252B38]">
          <div>
            <h2
              id="upload-score-heading"
              className="text-xl font-display font-semibold text-[#F6F1E6]"
            >
              Score &amp; YouTube Studio
            </h2>
            <p className="text-xs text-[#A39B8D] mt-0.5">
              Upload a PDF of sheet music paired with a YouTube recording, or select a chamber piece.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close score studio"
            className="p-2 rounded-lg text-[#9A9284] hover:text-[#F6F1E6] hover:bg-[#222836] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload Form */}
          <form onSubmit={handleAnalyzeSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PDF Dropzone */}
              <div>
                <label
                  htmlFor="sheet-pdf-input"
                  className="block text-xs font-medium text-[#D8D1C4] mb-1.5"
                >
                  Sheet Music PDF
                </label>
                <div
                  className={`relative rounded-lg border border-dashed p-4 transition-colors ${
                    pdfFile
                      ? 'border-[#3CC98D]/60 bg-[#172221]'
                      : 'border-[#3A4356] bg-[#10131B] hover:border-[#D4A34A]/70'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    id="sheet-pdf-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileUp className="w-5 h-5 text-[#D4A34A] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F3EFE6] truncate">
                          {pdfFile ? pdfFile.name : 'Choose PDF score'}
                        </div>
                        <div className="text-[11px] text-[#8E8779]">
                          {pdfFile
                            ? `${(pdfFile.size / 1024).toFixed(0)} KB · Ready for transcription`
                            : 'Multi-staff ensemble or lead sheet (.pdf)'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded bg-[#232A38] hover:bg-[#2D3546] text-xs font-medium text-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {pdfFile ? 'Replace' : 'Browse'}
                    </button>
                  </div>
                </div>
              </div>

              {/* YouTube Video URL */}
              <div>
                <label
                  htmlFor="youtube-url-input"
                  className="block text-xs font-medium text-[#D8D1C4] mb-1.5"
                >
                  Matching YouTube Video URL
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 text-[#8E8779] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="youtube-url-input"
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#10131B] border border-[#343C4E] focus:border-[#D4A34A] focus:outline-none text-sm text-[#F3EFE6] placeholder:text-[#666C7A]"
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  {detectedVideoId ? (
                    <span className="text-[#3CC98D] font-mono">
                      Video ID linked: {detectedVideoId}
                    </span>
                  ) : (
                    <span className="text-[#8E8779]">
                      Supports youtube.com/watch, youtu.be, and shorts links
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ensemble Roster & Optional Tempo */}
            <div className="space-y-3 pt-2 border-t border-[#222836]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#D8D1C4]">
                    Ensemble Musicians (Single-Mic Polyphonic Tracking)
                  </div>
                  <div className="text-[11px] text-[#8E8779]">
                    Assign up to 4 players and instruments so the timbre model isolates each voice.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="custom-bpm-input" className="text-[11px] text-[#A39B8D]">
                    BPM Override
                  </label>
                  <input
                    id="custom-bpm-input"
                    type="number"
                    min={48}
                    max={200}
                    placeholder="Auto"
                    value={customBpm}
                    onChange={(e) => setCustomBpm(e.target.value)}
                    className="w-20 px-2.5 py-1 rounded bg-[#10131B] border border-[#343C4E] text-xs font-mono text-[#F3EFE6] placeholder:text-[#666C7A]"
                  />
                  {musicians.length < 4 && (
                    <button
                      type="button"
                      onClick={handleAddMusician}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#222836] hover:bg-[#2C3447] text-xs font-medium text-[#E8D5AD] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Musician
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {musicians.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[#10131B] border border-[#252B38]"
                  >
                    <span className="text-[11px] font-mono text-[#8E8779] w-4 text-center">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) =>
                        setMusicians((prev) =>
                          prev.map((item) =>
                            item.id === m.id ? { ...item, name: e.target.value } : item
                          )
                        )
                      }
                      aria-label={`Musician ${idx + 1} name`}
                      className="flex-1 min-w-0 px-2 py-1 rounded bg-[#161B26] border border-[#2B3242] text-xs text-[#F3EFE6]"
                    />
                    <select
                      value={m.instrument}
                      onChange={(e) =>
                        setMusicians((prev) =>
                          prev.map((item) =>
                            item.id === m.id
                              ? { ...item, instrument: e.target.value as InstrumentFamily }
                              : item
                          )
                        )
                      }
                      aria-label={`Musician ${idx + 1} instrument`}
                      className="px-2 py-1 rounded bg-[#161B26] border border-[#2B3242] text-xs text-[#E8D5AD]"
                    >
                      {INSTRUMENT_OPTIONS.map((inst) => (
                        <option key={inst} value={inst}>
                          {INSTRUMENT_TIMBRE_PROFILES[inst].label}
                        </option>
                      ))}
                    </select>
                    {musicians.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMusician(m.id)}
                        aria-label={`Remove ${m.name}`}
                        className="p-1 text-[#8E8779] hover:text-[#E05A5A] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-lg bg-[#2B171A] border border-[#8E353C] text-xs text-[#F4B4B8]"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#B8B0A0] hover:text-[#F3EFE6] hover:bg-[#222836] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAnalyzing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D4A34A] hover:bg-[#E0B35E] disabled:opacity-60 text-xs font-semibold text-[#111318] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Transcribing Sheet Music...
                  </>
                ) : (
                  <>
                    <Music2 className="w-4 h-4" />
                    Analyze Score &amp; Load Stage
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Curated Built-In Chamber Repertoire */}
          <div className="pt-5 border-t border-[#252B38] space-y-3">
            <div className="text-xs font-medium text-[#D8D1C4]">
              Or Load Curated Ensemble Repertoire
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {repertoire.map((item) => {
                const isSelected = item.id === activeScoreId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectScore(item);
                      onClose();
                    }}
                    className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#212734] border-[#D4A34A]'
                        : 'bg-[#10131B] border-[#252B38] hover:border-[#49536A]'
                    }`}
                  >
                    <div className="text-sm font-display font-semibold text-[#F6F1E6]">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-[#A39B8D] mt-1">{item.subtitle}</div>
                    <div className="text-[11px] font-mono text-[#D4A34A] mt-2 tabular-nums whitespace-nowrap truncate">
                      {item.bpm} BPM · {item.keySignature.replace(' minor', 'm').replace(' major', ' maj')} · {item.parts.length}p
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
