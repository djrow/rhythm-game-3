import React from 'react';
import { INSTRUMENT_TIMBRE_PROFILES } from '../game/audioMath';
import type { MusicianStats } from '../game/types';
import { InstrumentIcon } from './Icons';

interface MusicianTelemetryStripProps {
  musicians: MusicianStats[];
  keyBindings: string[];
  onTriggerPracticeNote: (index: number) => void;
}

export const MusicianTelemetryStrip: React.FC<MusicianTelemetryStripProps> = ({
  musicians,
  keyBindings,
  onTriggerPracticeNote,
}) => {
  return (
    <div
      className="grid gap-3 w-full"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, musicians.length)}, minmax(0, 1fr))`,
      }}
      data-testid="musician-telemetry-strip"
    >
      {musicians.map((m, idx) => {
        const profile = INSTRUMENT_TIMBRE_PROFILES[m.instrument];
        const centsClamped = Math.max(-50, Math.min(50, m.liveCents));
        const needlePct = 50 + (centsClamped / 50) * 44;
        const absCents = Math.abs(m.liveCents);

        const pitchStatusColor =
          m.liveEnergy < 0.08
            ? 'text-[#8C8577]'
            : absCents <= 12
            ? 'text-[#3CC98D]'
            : absCents <= 30
            ? 'text-[#E5A93B]'
            : 'text-[#E05A5A]';

        const gradeTextColor =
          m.lastGrade === 'PERFECT'
            ? 'text-[#3CC98D]'
            : m.lastGrade === 'GREAT'
            ? 'text-[#E5A93B]'
            : m.lastGrade === 'GOOD'
            ? 'text-[#D4A34A]'
            : m.lastGrade === 'MISS'
            ? 'text-[#E05A5A]'
            : 'text-[#8C8577]';

        const timingReadout =
          m.perfectCount + m.greatCount + m.goodCount > 0
            ? `${m.avgTimingMs >= 0 ? '+' : ''}${Math.round(m.avgTimingMs)}ms`
            : '—';

        return (
          <div
            key={m.partId}
            className="bg-[#151922] border border-[#282E3C] rounded-lg px-3.5 py-2.5 flex flex-col gap-2"
          >
            {/* Row 1: Musician Identity, Live Score & Combo, Interactive Strike Key */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <InstrumentIcon
                  instrument={m.instrument}
                  color={m.accentColor}
                  className="w-4 h-4 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#F3EFE6] truncate">
                    {m.musicianName}
                  </div>
                  <div className="text-[11px] text-[#9A9284] truncate">
                    {profile.label} · {m.combo} streak
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-mono font-semibold tabular-nums text-[#F3EFE6] leading-tight">
                    {Math.round(m.score).toLocaleString()}
                  </div>
                  <div className={`text-[10px] font-medium leading-tight ${gradeTextColor}`}>
                    {m.lastGrade ?? 'READY'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onTriggerPracticeNote(idx)}
                  tabIndex={-1}
                  onMouseDown={(e) => e.currentTarget.blur()}
                  aria-label={`Play practice note for ${m.musicianName} (Key ${keyBindings[idx]})`}
                  className="h-8 px-2.5 rounded border border-[#343C4E] bg-[#1D222E] hover:bg-[#272E3D] active:scale-95 text-[11px] font-mono font-semibold text-[#E8D5AD] transition-transform whitespace-nowrap shrink-0 cursor-pointer"
                  title={`Play ${profile.label} note (Key ${keyBindings[idx]})`}
                >
                  [{keyBindings[idx]}]
                </button>
              </div>
            </div>

            {/* Row 2: Three Core Live Acoustic Axes — Timing, Pitch Accuracy, Timbre */}
            <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[#242A36]">
              {/* Timing Axis */}
              <div className="min-w-0">
                <div className="flex items-center justify-between text-[10px] text-[#8E8779]">
                  <span>Timing</span>
                  <span className="font-mono tabular-nums text-[#D8D2C5]">{timingReadout}</span>
                </div>
                <div className="mt-1 text-[11px] font-medium text-[#E5DFD3] truncate">
                  {m.lastFeedback || 'Awaiting beat'}
                </div>
              </div>

              {/* Pitch Accuracy Axis (Live Cents Tuner Bar) */}
              <div className="min-w-0">
                <div className="flex items-center justify-between text-[10px] text-[#8E8779]">
                  <span>Pitch</span>
                  <span className={`font-mono tabular-nums ${pitchStatusColor}`}>
                    {m.liveEnergy > 0.08
                      ? `${m.liveCents >= 0 ? '+' : ''}${Math.round(m.liveCents)}¢`
                      : '—'}
                  </span>
                </div>
                <div className="relative h-2 mt-1.5 rounded bg-[#0E1116] border border-[#262C3A] overflow-hidden">
                  {/* Center in-tune pocket marker */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#D4A34A]/60 -translate-x-1/2" />
                  <div
                    className="absolute top-0.5 bottom-0.5 w-1.5 rounded-sm transition-transform duration-75"
                    style={{
                      left: `${needlePct}%`,
                      transform: 'translateX(-50%)',
                      backgroundColor:
                        m.liveEnergy < 0.08
                          ? '#555B6A'
                          : absCents <= 12
                          ? '#3CC98D'
                          : absCents <= 30
                          ? '#E5A93B'
                          : '#E05A5A',
                    }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-[#A69F92] truncate">
                  {m.livePitchLabel}
                </div>
              </div>

              {/* Timbre Axis (Harmonic Profile Cosine Match) */}
              <div className="min-w-0">
                <div className="flex items-center justify-between text-[10px] text-[#8E8779]">
                  <span>Timbre</span>
                  <span className="font-mono tabular-nums text-[#D8D2C5]">
                    {m.liveEnergy > 0.08 ? `${Math.round(m.liveTimbre)}%` : `${Math.round(m.avgTimbreScore)}%`}
                  </span>
                </div>
                <div className="h-2 mt-1.5 rounded bg-[#0E1116] border border-[#262C3A] overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-100"
                    style={{
                      width: `${Math.max(4, Math.min(100, m.liveEnergy > 0.08 ? m.liveTimbre : m.avgTimbreScore))}%`,
                      backgroundColor: m.accentColor,
                    }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-[#A69F92] truncate">
                  {m.liveTimbreLabel}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
