import React, { useState } from 'react';
import { Award, Loader2, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { INSTRUMENT_TIMBRE_PROFILES } from '../game/audioMath';
import type { ConductorCritique, PerformanceSummary } from '../game/types';
import { InstrumentIcon } from './Icons';

interface PerformanceReportModalProps {
  summary: PerformanceSummary;
  onPlayAgain: () => void;
  onOpenUpload: () => void;
  onReturnTitle: () => void;
}

export const PerformanceReportModal: React.FC<PerformanceReportModalProps> = ({
  summary,
  onPlayAgain,
  onOpenUpload,
  onReturnTitle,
}) => {
  const [critique, setCritique] = useState<ConductorCritique | null>(null);
  const [isLoadingCritique, setIsLoadingCritique] = useState(false);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);

  const handleRequestCritique = async () => {
    setIsLoadingCritique(true);
    setCritiqueError(null);
    try {
      const res = await fetch('/api/performance/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate conductor notes.');
      }
      setCritique(data.critique);
    } catch (err) {
      setCritiqueError(err instanceof Error ? err.message : 'Unable to reach conductor service.');
    } finally {
      setIsLoadingCritique(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="performance-report-heading"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="w-full max-w-3xl max-h-[90vh] bg-[#141821] border border-[#2D3445] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with Concert Rank */}
        <div className="px-6 py-5 border-b border-[#252B38] flex items-center justify-between gap-4 bg-[#11141C]">
          <div>
            <div className="text-xs text-[#D4A34A] font-medium">
              Ensemble Performance Report
            </div>
            <h2
              id="performance-report-heading"
              className="text-2xl font-display font-bold text-[#F6F1E6] mt-0.5"
            >
              {summary.scoreTitle}
            </h2>
            <p className="text-xs text-[#9A9284] mt-0.5">{summary.composer}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-[11px] text-[#9A9284]">Ensemble Score</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-[#F6F1E6]">
                {Math.round(summary.totalScore).toLocaleString()}
              </div>
            </div>
            <div
              className="w-14 h-14 rounded-lg border-2 border-[#D4A34A] bg-[#1B1F2A] flex items-center justify-center font-display text-3xl font-bold text-[#F0CF86]"
              aria-label={`Rank ${summary.gradeRank}`}
            >
              {summary.gradeRank}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top 3 Mastery Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-[#10131B] border border-[#252B38]">
              <div className="text-[11px] text-[#8E8779]">Timing Precision</div>
              <div className="text-xl font-mono font-semibold tabular-nums text-[#F3EFE6] mt-1">
                ±{Math.round(summary.avgTimingMs)}ms
              </div>
              <div className="text-[11px] text-[#A69F92] mt-0.5">
                {summary.accuracyPct}% hit accuracy
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-[#10131B] border border-[#252B38]">
              <div className="text-[11px] text-[#8E8779]">Pitch Intonation</div>
              <div className="text-xl font-mono font-semibold tabular-nums text-[#F3EFE6] mt-1">
                ±{Math.round(summary.avgPitchCents)}¢
              </div>
              <div className="text-[11px] text-[#A69F92] mt-0.5">
                Mean harmonic deviation
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-[#10131B] border border-[#252B38]">
              <div className="text-[11px] text-[#8E8779]">Timbre Fidelity</div>
              <div className="text-xl font-mono font-semibold tabular-nums text-[#F3EFE6] mt-1">
                {Math.round(summary.avgTimbrePct)}%
              </div>
              <div className="text-[11px] text-[#A69F92] mt-0.5">
                Peak synergy {summary.maxSynergyMultiplier}x
              </div>
            </div>
          </div>

          {/* Per-Musician Scorecard Table */}
          <div className="rounded-lg border border-[#252B38] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#10131B] text-[11px] text-[#8E8779] border-b border-[#252B38]">
                  <th className="py-2.5 px-3.5 font-medium">Musician</th>
                  <th className="py-2.5 px-3 font-medium text-right">Score</th>
                  <th className="py-2.5 px-3 font-medium text-right">Timing</th>
                  <th className="py-2.5 px-3 font-medium text-right">Pitch</th>
                  <th className="py-2.5 px-3 font-medium text-right">Timbre</th>
                  <th className="py-2.5 px-3.5 font-medium text-right">P / G / M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202634] text-xs">
                {summary.musicians.map((m) => (
                  <tr key={m.partId} className="bg-[#141821]">
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-2">
                        <InstrumentIcon
                          instrument={m.instrument}
                          color={m.accentColor}
                          className="w-4 h-4 shrink-0"
                        />
                        <div>
                          <div className="font-medium text-[#F3EFE6]">{m.musicianName}</div>
                          <div className="text-[11px] text-[#8E8779]">
                            {INSTRUMENT_TIMBRE_PROFILES[m.instrument].label}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#F3EFE6]">
                      {Math.round(m.score).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#D8D2C5]">
                      ±{Math.round(m.avgAbsTimingMs)}ms
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#D8D2C5]">
                      ±{Math.round(m.avgAbsCents)}¢
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#D8D2C5]">
                      {Math.round(m.avgTimbreScore)}%
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-[#A69F92]">
                      {m.perfectCount} / {m.greatCount + m.goodCount} / {m.missCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional Conductor Critique Section */}
          <div className="rounded-lg bg-[#10131B] border border-[#252B38] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#D4A34A]" />
                <span className="text-xs font-semibold text-[#F3EFE6]">
                  Conductor&apos;s Acoustic Notes
                </span>
              </div>
              {!critique && (
                <button
                  type="button"
                  onClick={handleRequestCritique}
                  disabled={isLoadingCritique}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#232A38] hover:bg-[#2E3749] disabled:opacity-60 text-xs font-medium text-[#E8D5AD] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isLoadingCritique ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Reviewing Telemetry...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate Coaching Notes
                    </>
                  )}
                </button>
              )}
            </div>

            {critiqueError && (
              <div className="text-xs text-[#F4B4B8]">{critiqueError}</div>
            )}

            {critique ? (
              <div className="space-y-2.5">
                <div className="text-sm font-display font-semibold text-[#F0CF86]">
                  {critique.headline}
                </div>
                <p className="text-xs leading-relaxed text-[#D8D1C4]">
                  {critique.ensembleSummary}
                </p>
                <div className="space-y-1.5 pt-2 border-t border-[#222836]">
                  {critique.musicianNotes.map((note, idx) => (
                    <div key={idx} className="text-xs text-[#C7C0B2]">
                      <span className="font-semibold text-[#F3EFE6]">
                        {note.musicianName} ({note.instrument}):
                      </span>{' '}
                      {note.feedback}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              !critiqueError && (
                <p className="text-xs text-[#8E8779]">
                  Generate tailored coaching notes based on each musician&apos;s measured timing offset, intonation cents, and harmonic timbre match.
                </p>
              )
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#252B38] bg-[#11141C] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReturnTitle}
            className="px-4 py-2 rounded-lg text-xs font-medium text-[#A69F92] hover:text-[#F3EFE6] hover:bg-[#222836] cursor-pointer"
          >
            Return to Title
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#222836] hover:bg-[#2B3345] text-xs font-medium text-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Change Score
            </button>
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#D4A34A] hover:bg-[#E0B35E] text-xs font-semibold text-[#111318] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Play Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
