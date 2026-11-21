import React, { useState } from 'react';
import { Mic, Play, Upload } from 'lucide-react';
import type { EnsembleScore, InputSourceMode } from '../game/types';
import { PartituraEmblem } from './Icons';

interface TitleScreenProps {
  repertoire: EnsembleScore[];
  selectedScore: EnsembleScore;
  inputMode: InputSourceMode;
  onSelectScore: (score: EnsembleScore) => void;
  onSelectInputMode: (mode: InputSourceMode) => void;
  onStart: () => void;
  onOpenUpload: () => void;
}

const TITLE_BG_SRC = '/src/assets/images/title_bg_1795226389909.jpg';

export const TitleScreen: React.FC<TitleScreenProps> = ({
  repertoire,
  selectedScore,
  inputMode,
  onSelectScore,
  onSelectInputMode,
  onStart,
  onOpenUpload,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0E1116] select-none">
      {/* Illustrated Concert Hall Key-Art Backdrop */}
      {!imgFailed ? (
        <img
          src={TITLE_BG_SRC}
          alt="Warmly illuminated chamber concert hall with violin, French horn, cello, and wooden music stand"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 75% 45%, rgba(212,163,74,0.22), rgba(14,17,22,1) 62%)',
          }}
        />
      )}

      {/* Measured left-side contrast scrim leaving right instruments luminous & unobstructed */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(11,13,18,0.95) 0%, rgba(11,13,18,0.86) 38%, rgba(11,13,18,0.34) 64%, rgba(11,13,18,0.12) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
        style={{
          background: 'linear-gradient(0deg, rgba(11,13,18,0.9) 0%, rgba(11,13,18,0) 100%)',
        }}
      />

      {/* Left-Third Negative Space Content Column */}
      <div className="relative z-10 h-full flex flex-col justify-between px-8 md:px-14 py-9 max-w-[600px]">
        <div className="pt-2">
          <PartituraEmblem />
          <p className="mt-4 text-sm md:text-[15px] leading-relaxed text-[#CFC8BA] max-w-[46ch]">
            Score multiple live musicians through a single microphone. Upload any sheet music PDF with a matching YouTube video and track real-time timing, intonation, and harmonic timbre.
          </p>
        </div>

        {/* Middle: Compact Chamber Repertoire & Input Selection */}
        <div className="space-y-4 my-auto py-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#A8A092]">Select Ensemble Program</div>
            <div className="space-y-2">
              {repertoire.map((piece) => {
                const isActive = piece.id === selectedScore.id;
                return (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => onSelectScore(piece)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                      isActive
                        ? 'bg-[#1A1F2B]/95 border-[#D4A34A] text-[#F6F1E6]'
                        : 'bg-[#12161F]/80 border-[#282F3E] text-[#C9C2B5] hover:border-[#4B556B]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-display font-semibold truncate">
                        {piece.title}
                      </div>
                      <div className="text-xs text-[#9C9486] truncate mt-0.5">
                        {piece.subtitle}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px] tabular-nums text-[#D4A34A]">
                      <div>{piece.bpm} BPM</div>
                      <div className="text-[#8E8779]">{piece.keySignature}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Acoustic Input Mode Selector */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-[#A8A092] flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-[#D4A34A]" />
              Audio Input
            </span>
            <div
              role="group"
              aria-label="Audio input mode"
              className="flex items-center gap-1 p-1 rounded-lg bg-[#11151D] border border-[#252B38]"
            >
              {(
                [
                  { id: 'mic', label: 'Single Mic' },
                  { id: 'ensemble-demo', label: 'Ensemble Demo' },
                  { id: 'practice', label: 'Keys 1–4' },
                ] as Array<{ id: InputSourceMode; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectInputMode(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    inputMode === opt.id
                      ? 'bg-[#262D3D] text-[#F6F1E6]'
                      : 'text-[#938B7D] hover:text-[#DFD9CC]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Primary & Secondary CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#D4A34A] hover:bg-[#E1B45F] active:scale-[0.99] text-sm font-semibold text-[#111318] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Play Ensemble
            </button>
            <button
              type="button"
              onClick={onOpenUpload}
              className="flex items-center gap-2 px-5 py-3 rounded-lg bg-[#181D28]/90 hover:bg-[#222938] border border-[#323A4D] text-sm font-medium text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#D4A34A]" />
              Upload PDF &amp; YouTube
            </button>
          </div>
        </div>

        {/* Bottom Safe Margin Flat Control Hints */}
        <div className="text-xs text-[#918A7D] tracking-wide">
          Enter Start · 1–4 Strike Instruments · Space Play/Pause · M Mute · Esc Pause
        </div>
      </div>
    </main>
  );
};
