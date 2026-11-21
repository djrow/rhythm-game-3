import React, { useEffect, useRef } from 'react';
import { INSTRUMENT_TIMBRE_PROFILES, midiToStaffPosition } from '../game/audioMath';
import type { EnsembleScore, HitGrade, MusicianFrameInference, NoteHitResult } from '../game/types';

export interface CanvasParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface CanvasCallout {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  subtext: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface PitchTraceSample {
  beat: number;
  centsError: number;
  midi: number;
  timbreScore: number;
}

export interface SheetRenderState {
  score: EnsembleScore;
  currentBeat: number;
  isPlaying: boolean;
  hitResults: Map<string, NoteHitResult>;
  liveInference: Map<string, MusicianFrameInference>;
  pitchHistory: Map<string, PitchTraceSample[]>;
  particles: CanvasParticle[];
  callouts: CanvasCallout[];
  flashIntensity: Map<string, number>;
}

interface SheetMusicCanvasProps {
  renderStateRef: React.MutableRefObject<SheetRenderState>;
  onLaneClick: (partIndex: number) => void;
}

const GRADE_COLORS: Record<HitGrade, string> = {
  PERFECT: '#1B9A67',
  GREAT: '#C98A1B',
  GOOD: '#B57B2A',
  MISS: '#C93B3B',
};

function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, centerY: number, lineGap: number) {
  ctx.save();
  ctx.strokeStyle = '#1E1B16';
  ctx.fillStyle = '#1E1B16';
  ctx.lineWidth = Math.max(1.6, lineGap * 0.18);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const s = lineGap;
  // Stylized archival treble clef G-scroll
  ctx.beginPath();
  ctx.moveTo(x + s * 0.1, centerY + s * 2.5);
  ctx.bezierCurveTo(x - s * 0.7, centerY + s * 2.8, x - s * 0.9, centerY + s * 1.6, x + s * 0.15, centerY + s * 1.4);
  ctx.bezierCurveTo(x + s * 0.9, centerY + s * 1.2, x + s * 0.95, centerY + s * 0.1, x + s * 0.15, centerY - s * 0.2);
  ctx.bezierCurveTo(x - s * 0.85, centerY - s * 0.55, x - s * 0.9, centerY + s * 1.15, x + s * 0.15, centerY + s * 1.1);
  ctx.stroke();

  // Vertical spine & upper loop
  ctx.beginPath();
  ctx.moveTo(x + s * 0.25, centerY + s * 2.45);
  ctx.lineTo(x + s * 0.05, centerY - s * 2.65);
  ctx.bezierCurveTo(x + s * 0.85, centerY - s * 2.2, x + s * 0.7, centerY - s * 0.85, x - s * 0.45, centerY + s * 0.05);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x - s * 0.22, centerY + s * 2.38, s * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBassClef(ctx: CanvasRenderingContext2D, x: number, centerY: number, lineGap: number) {
  ctx.save();
  ctx.strokeStyle = '#1E1B16';
  ctx.fillStyle = '#1E1B16';
  ctx.lineWidth = Math.max(1.8, lineGap * 0.2);
  ctx.lineCap = 'round';

  const s = lineGap;
  // F-clef curve around 4th line (centerY - lineGap)
  ctx.beginPath();
  ctx.arc(x - s * 0.35, centerY - s * 0.85, s * 0.26, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, centerY - s * 0.95);
  ctx.bezierCurveTo(x + s * 0.75, centerY - s * 1.95, x + s * 1.05, centerY + s * 0.35, x - s * 0.55, centerY + s * 1.55);
  ctx.stroke();

  // Two F-line dots
  ctx.beginPath();
  ctx.arc(x + s * 1.1, centerY - s * 1.45, s * 0.18, 0, Math.PI * 2);
  ctx.arc(x + s * 1.1, centerY - s * 0.45, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const SheetMusicCanvas: React.FC<SheetMusicCanvasProps> = ({
  renderStateRef,
  onLaneClick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onLaneClickRef = useRef(onLaneClick);
  onLaneClickRef.current = onLaneClick;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = 1000;
    let height = 520;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(320, Math.floor(rect.width));
      height = Math.max(240, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    let rafId = 0;
    let lastTs = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const state = renderStateRef.current;
      const { score, currentBeat, hitResults, liveInference, pitchHistory, particles, callouts, flashIntensity } =
        state;

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Archival warm score parchment canvas
      ctx.fillStyle = '#F6F3EB';
      ctx.fillRect(0, 0, width, height);

      // Subtle archival top/bottom edge warmth
      const topShadow = ctx.createLinearGradient(0, 0, 0, 18);
      topShadow.addColorStop(0, 'rgba(30, 24, 16, 0.08)');
      topShadow.addColorStop(1, 'rgba(30, 24, 16, 0)');
      ctx.fillStyle = topShadow;
      ctx.fillRect(0, 0, width, 18);

      const parts = score.parts;
      const partCount = Math.max(1, parts.length);
      const headerStripH = 26;
      const usableH = height - headerStripH;
      const laneH = usableH / partCount;
      const lineGap = Math.max(6.5, Math.min(12, laneH * 0.082));
      const leftMargin = Math.min(196, Math.max(146, width * 0.155));
      const clefCorridorRight = leftMargin + 54;
      const playheadX = leftMargin + Math.min(148, Math.max(114, width * 0.115));
      const pixelsPerBeat = Math.max(78, Math.min(132, (width - playheadX) / 8.2));
      const beatsPerMeasure = score.timeSignature[0] || 4;

      // 2. Measure header strip at top of score sheet
      ctx.fillStyle = '#ECE6D8';
      ctx.fillRect(0, 0, width, headerStripH);
      ctx.strokeStyle = 'rgba(30, 27, 22, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, headerStripH);
      ctx.lineTo(width, headerStripH);
      ctx.stroke();

      // Measure label left
      ctx.fillStyle = '#574F43';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${score.keySignature}  ·  ${score.timeSignature[0]}/${score.timeSignature[1]}  ·  ${score.bpm} BPM`,
        14,
        headerStripH / 2
      );

      // Measure grid lines across entire sheet
      const firstVisibleBeat = Math.floor(currentBeat - (playheadX - leftMargin) / pixelsPerBeat) - 1;
      const lastVisibleBeat = Math.ceil(currentBeat + (width - playheadX) / pixelsPerBeat) + 2;

      for (let b = Math.max(0, firstVisibleBeat); b <= Math.min(score.totalBeats + 4, lastVisibleBeat); b++) {
        const x = playheadX + (b - currentBeat) * pixelsPerBeat;
        if (x < leftMargin || x > width + 20) continue;

        const isMeasureLine = b % beatsPerMeasure === 0;
        if (isMeasureLine) {
          const measureNum = Math.floor(b / beatsPerMeasure) + 1;
          ctx.strokeStyle = 'rgba(30, 27, 22, 0.28)';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(x, headerStripH);
          ctx.lineTo(x, height);
          ctx.stroke();

          ctx.fillStyle = '#574F43';
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`m.${measureNum}`, x + 5, headerStripH / 2);
        } else {
          // Subtle beat guide tick
          ctx.strokeStyle = 'rgba(30, 27, 22, 0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, headerStripH);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      }

      // 3. Render each musician's engraved staff lane
      parts.forEach((part, idx) => {
        const laneTop = headerStripH + idx * laneH;
        const staffCenterY = laneTop + laneH * 0.52;
        const inference = liveInference.get(part.id);
        const flash = flashIntensity.get(part.id) ?? 0;
        if (flash > 0) {
          flashIntensity.set(part.id, Math.max(0, flash - dt * 3.8));
        }

        // Subtle alternating lane tint
        if (idx % 2 === 1) {
          ctx.fillStyle = 'rgba(30, 24, 16, 0.025)';
          ctx.fillRect(leftMargin, laneTop, width - leftMargin, laneH);
        }

        // Hit flash pulse along playhead corridor
        if (flash > 0.02) {
          ctx.fillStyle = `rgba(212, 163, 74, ${flash * 0.14})`;
          ctx.fillRect(playheadX - 24, laneTop, 48, laneH);
        }

        // Horizontal lane divider
        if (idx > 0) {
          ctx.strokeStyle = 'rgba(30, 27, 22, 0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, laneTop);
          ctx.lineTo(width, laneTop);
          ctx.stroke();
        }

        // 5 Staff lines
        ctx.strokeStyle = 'rgba(30, 27, 22, 0.45)';
        ctx.lineWidth = 1;
        for (let l = -2; l <= 2; l++) {
          const ly = staffCenterY + l * lineGap;
          ctx.beginPath();
          ctx.moveTo(leftMargin, ly);
          ctx.lineTo(width, ly);
          ctx.stroke();
        }

        // Clef drawing just inside left margin
        if (part.clef === 'treble') {
          drawTrebleClef(ctx, leftMargin + 22, staffCenterY, lineGap);
        } else {
          drawBassClef(ctx, leftMargin + 22, staffCenterY, lineGap);
        }

        // 4. Live Pitch Contour Trace behind playhead
        const history = pitchHistory.get(part.id);
        if (history && history.length > 1) {
          ctx.save();
          ctx.lineWidth = 2.6;
          ctx.lineCap = 'round';
          for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1];
            const curr = history[i];
            if (curr.beat - prev.beat > 0.4) continue;
            const x1 = playheadX + (prev.beat - currentBeat) * pixelsPerBeat;
            const x2 = playheadX + (curr.beat - currentBeat) * pixelsPerBeat;
            if (x2 < leftMargin || x1 > playheadX + 6) continue;

            const pos1 = midiToStaffPosition(prev.midi, part.clef);
            const pos2 = midiToStaffPosition(curr.midi, part.clef);
            const y1 = staffCenterY - (pos1.step + prev.centsError / 100) * (lineGap / 2);
            const y2 = staffCenterY - (pos2.step + curr.centsError / 100) * (lineGap / 2);

            const absC = Math.abs(curr.centsError);
            ctx.strokeStyle =
              absC <= 18 ? 'rgba(27, 154, 103, 0.85)' : absC <= 38 ? 'rgba(201, 138, 27, 0.85)' : 'rgba(201, 59, 59, 0.85)';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // 5. Render visible notes on staff (clip cleanly to right of engraved clef corridor)
        ctx.save();
        ctx.beginPath();
        ctx.rect(clefCorridorRight, laneTop, width - clefCorridorRight, laneH);
        ctx.clip();

        for (let nIdx = 0; nIdx < part.notes.length; nIdx++) {
          const note = part.notes[nIdx];
          const x = playheadX + (note.startBeat - currentBeat) * pixelsPerBeat;
          const noteEndX = x + Math.max(0.25, note.durationBeats) * pixelsPerBeat;
          if (noteEndX < clefCorridorRight - 10 || x > width + 40) continue;

          // Fade passed notes gently as they approach the clef corridor
          const fadeAlpha =
            x < clefCorridorRight + 24
              ? Math.max(0.15, (x - clefCorridorRight) / 24)
              : 1;
          ctx.globalAlpha = fadeAlpha;

          const { step, accidental } = midiToStaffPosition(note.midi, part.clef);
          // Clamp display slightly only if extreme, while keeping ledger lines accurate
          const clampedStep = Math.max(-10, Math.min(10, step));
          const y = staffCenterY - clampedStep * (lineGap / 2);

          const result = hitResults.get(note.id);
          const isCurrentActive =
            currentBeat >= note.startBeat - 0.2 && currentBeat <= note.startBeat + note.durationBeats;

          const fillColor = result
            ? GRADE_COLORS[result.grade]
            : isCurrentActive
            ? part.accentColor
            : '#1C1915';

          // Ledger lines above (+6, +8, +10) or below (-6, -8, -10)
          ctx.strokeStyle = 'rgba(30, 27, 22, 0.55)';
          ctx.lineWidth = 1.1;
          if (clampedStep >= 6) {
            for (let ls = 6; ls <= clampedStep; ls += 2) {
              const ly = staffCenterY - ls * (lineGap / 2);
              ctx.beginPath();
              ctx.moveTo(x - lineGap * 1.05, ly);
              ctx.lineTo(x + lineGap * 1.05, ly);
              ctx.stroke();
            }
          } else if (clampedStep <= -6) {
            for (let ls = -6; ls >= clampedStep; ls -= 2) {
              const ly = staffCenterY - ls * (lineGap / 2);
              ctx.beginPath();
              ctx.moveTo(x - lineGap * 1.05, ly);
              ctx.lineTo(x + lineGap * 1.05, ly);
              ctx.stroke();
            }
          }

          // Sustain duration ribbon behind notehead
          const ribbonW = Math.max(10, note.durationBeats * pixelsPerBeat - lineGap * 0.7);
          const ribbonH = Math.max(5, lineGap * 0.56);
          ctx.fillStyle = result
            ? `${GRADE_COLORS[result.grade]}38`
            : isCurrentActive
            ? `${part.accentColor}44`
            : `${part.accentColor}22`;
          ctx.beginPath();
          ctx.roundRect(x + lineGap * 0.3, y - ribbonH / 2, ribbonW, ribbonH, ribbonH / 2);
          ctx.fill();

          // Active target halo on playhead
          if (isCurrentActive && !result) {
            ctx.save();
            ctx.strokeStyle = part.accentColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, lineGap * 0.95, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // Accidental symbol (# or b)
          if (accidental) {
            ctx.fillStyle = fillColor;
            ctx.font = `700 ${Math.round(lineGap * 1.25)}px Georgia, serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(accidental === '#' ? '♯' : '♭', x - lineGap * 0.75, y + 0.5);
          }

          // Engraved oval notehead (tilted slightly)
          const rx = lineGap * 0.62;
          const ry = lineGap * 0.44;
          const isHalfOrWhole = note.durationBeats >= 2;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-0.32);
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          if (isHalfOrWhole && !result) {
            ctx.fillStyle = '#F6F3EB';
            ctx.fill();
            ctx.strokeStyle = fillColor;
            ctx.lineWidth = Math.max(1.8, lineGap * 0.22);
            ctx.stroke();
          } else {
            ctx.fillStyle = fillColor;
            ctx.fill();
          }
          ctx.restore();

          // Stem (up if below middle line, down if on/above middle line)
          if (note.durationBeats < 4) {
            const stemUp = clampedStep < 0;
            const stemLen = lineGap * 3.1;
            const stemX = stemUp ? x + rx * 0.85 : x - rx * 0.85;
            const stemYEnd = stemUp ? y - stemLen : y + stemLen;

            ctx.strokeStyle = fillColor;
            ctx.lineWidth = Math.max(1.4, lineGap * 0.15);
            ctx.beginPath();
            ctx.moveTo(stemX, y);
            ctx.lineTo(stemX, stemYEnd);
            ctx.stroke();

            // Eighth-note flag for notes < 1 beat
            if (note.durationBeats < 1) {
              ctx.beginPath();
              ctx.moveTo(stemX, stemYEnd);
              ctx.quadraticCurveTo(
                stemX + lineGap * 0.9,
                stemUp ? stemYEnd + lineGap * 0.6 : stemYEnd - lineGap * 0.6,
                stemX + lineGap * 0.55,
                stemUp ? stemYEnd + lineGap * 1.45 : stemYEnd - lineGap * 1.45
              );
              ctx.stroke();
            }
          }

          // Pitch label subtle micro-caption for readability during play
          if (x > clefCorridorRight + 16 && x < width - 24) {
            ctx.fillStyle = 'rgba(40, 34, 26, 0.56)';
            ctx.font = '500 9.5px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(note.pitch, x, staffCenterY + lineGap * 2.55);
          }
        }
        ctx.restore();

        // 6. Left musician brass header plaque (drawn AFTER notes so scrolling notes tuck cleanly underneath!)
        ctx.fillStyle = '#181C24';
        ctx.fillRect(0, laneTop, leftMargin, laneH);
        // Subtle right shadow edge
        const edgeGrad = ctx.createLinearGradient(leftMargin, 0, leftMargin + 12, 0);
        edgeGrad.addColorStop(0, 'rgba(14, 17, 22, 0.24)');
        edgeGrad.addColorStop(1, 'rgba(14, 17, 22, 0)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(leftMargin, laneTop, 12, laneH);

        // Lane bottom hairline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, laneTop + laneH);
        ctx.lineTo(leftMargin, laneTop + laneH);
        ctx.stroke();

        // Musician color marker pip (strictly semantic accent bar inside plaque)
        ctx.fillStyle = part.accentColor;
        ctx.fillRect(10, laneTop + 14, 3.5, Math.max(18, laneH - 28));

        // Musician Name & Instrument label
        const profile = INSTRUMENT_TIMBRE_PROFILES[part.instrument];
        ctx.fillStyle = '#F3EFE6';
        ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const displayName = part.musicianName.length > 17
          ? `${part.musicianName.slice(0, 16)}…`
          : part.musicianName;
        ctx.fillText(displayName, 22, laneTop + Math.max(12, laneH * 0.16));

        ctx.fillStyle = '#A69F92';
        ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(
          `${profile.label} · Key [${part.keyBinding}]`,
          22,
          laneTop + Math.max(12, laneH * 0.16) + 18
        );

        // Live mini harmonic spectrum & cents indicator inside plaque
        const barBaseY = laneTop + laneH - 16;
        const barStartX = 22;
        const harmonics = inference?.harmonics ?? [0, 0, 0, 0, 0, 0, 0, 0];
        for (let h = 0; h < 8; h++) {
          const bh = Math.max(2, (harmonics[h] ?? 0) * 18);
          ctx.fillStyle = inference?.isActive ? part.accentColor : 'rgba(255,255,255,0.16)';
          ctx.fillRect(barStartX + h * 7, barBaseY - bh, 4.5, bh);
        }

        // Live tuning readout on right of mini bars
        ctx.fillStyle = inference?.isActive
          ? Math.abs(inference.centsError) <= 15
            ? '#3CC98D'
            : '#F0B44A'
          : '#777166';
        ctx.font = '600 10.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        const liveReadout = inference?.isActive
          ? `${inference.centsError >= 0 ? '+' : ''}${inference.centsError}¢`
          : 'Ready';
        ctx.fillText(liveReadout, leftMargin - 12, barBaseY);
      });

      // 7. Burnished Brass Playhead / Strike Line across all staves
      const beatFrac = currentBeat - Math.floor(currentBeat);
      const beatPulse = Math.max(0, 1 - beatFrac * 4.5);

      ctx.save();
      ctx.strokeStyle = '#B88428';
      ctx.lineWidth = 2.5 + beatPulse * 1.2;
      ctx.beginPath();
      ctx.moveTo(playheadX, headerStripH);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Top brass playhead diamond marker
      ctx.fillStyle = '#D4A34A';
      ctx.beginPath();
      ctx.moveTo(playheadX, headerStripH + 7);
      ctx.lineTo(playheadX - 6, headerStripH - 1);
      ctx.lineTo(playheadX + 6, headerStripH - 1);
      ctx.closePath();
      ctx.fill();

      // Measure 1 Count-In badge on playhead before notes enter at beat 4
      if (currentBeat < 3.95) {
        const countNum = Math.min(4, Math.floor(currentBeat) + 1);
        ctx.fillStyle = '#181C24';
        ctx.beginPath();
        ctx.roundRect(playheadX + 10, headerStripH + 10, 108, 26, 6);
        ctx.fill();
        ctx.strokeStyle = '#D4A34A';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#F0CF86';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`COUNT-IN  ${countNum}`, playheadX + 20, headerStripH + 23);
      }
      ctx.restore();

      // 8. Pooled particles (zero GC)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 120 * dt;
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 9. Pooled floating hit judgment callouts
      for (let i = 0; i < callouts.length; i++) {
        const c = callouts[i];
        if (!c.active) continue;
        c.life -= dt;
        if (c.life <= 0) {
          c.active = false;
          continue;
        }
        c.y += c.vy * dt;
        const alpha = Math.min(1, (c.life / c.maxLife) * 1.6);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, c.x, c.y);

        if (c.subtext) {
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#3B342A';
          ctx.fillText(c.subtext, c.x, c.y + 13);
        }
        ctx.restore();
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [renderStateRef]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const headerStripH = 26;
    const partCount = Math.max(1, renderStateRef.current.score.parts.length);
    const laneH = (rect.height - headerStripH) / partCount;
    const idx = Math.floor((y - headerStripH) / laneH);
    if (idx >= 0 && idx < partCount) {
      onLaneClickRef.current(idx);
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="sheet-music-stage"
      className="relative w-full h-full rounded-lg overflow-hidden border border-[#2B313F] shadow-xl bg-[#F6F3EB]"
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="block w-full h-full cursor-pointer"
        aria-label="Scrolling multi-musician engraved sheet music canvas"
      />
    </div>
  );
};
