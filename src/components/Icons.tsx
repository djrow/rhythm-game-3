import React from 'react';
import type { InstrumentFamily } from '../game/types';

export const PartituraEmblem: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`select-none ${className}`}>
    <svg
      viewBox="0 0 420 112"
      className="w-full max-w-[380px] h-auto overflow-visible"
      role="img"
      aria-label="Partitura — Ensemble Acoustic Rhythm Game"
    >
      <defs>
        <linearGradient id="brassStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0CF86" />
          <stop offset="50%" stopColor="#D4A34A" />
          <stop offset="100%" stopColor="#9A6E26" />
        </linearGradient>
      </defs>

      {/* Engraved staff lines behind emblem */}
      <g stroke="#D4A34A" strokeOpacity="0.28" strokeWidth="1">
        <line x1="0" y1="28" x2="410" y2="28" />
        <line x1="0" y1="38" x2="410" y2="38" />
        <line x1="0" y1="48" x2="410" y2="48" />
        <line x1="0" y1="58" x2="410" y2="58" />
        <line x1="0" y1="68" x2="410" y2="68" />
      </g>

      {/* Left brass tuning-fork & treble crest */}
      <g transform="translate(8, 12)">
        <rect
          x="2"
          y="2"
          width="54"
          height="74"
          rx="10"
          fill="#151922"
          stroke="url(#brassStroke)"
          strokeWidth="1.6"
        />
        {/* Tuning fork / clef monogram */}
        <path
          d="M22 18 V40 C22 46 27 50 29 50 C31 50 36 46 36 40 V18"
          fill="none"
          stroke="url(#brassStroke)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <line
          x1="29"
          y1="50"
          x2="29"
          y2="65"
          stroke="url(#brassStroke)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="29" cy="66" r="3" fill="#F0CF86" />
        {/* Acoustic wave arcs */}
        <path
          d="M14 24 C10 29 10 37 14 42"
          fill="none"
          stroke="#D4A34A"
          strokeOpacity="0.65"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M44 24 C48 29 48 37 44 42"
          fill="none"
          stroke="#D4A34A"
          strokeOpacity="0.65"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* Wordmark */}
      <text
        x="78"
        y="62"
        fill="#F6F1E6"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="50"
        fontWeight="700"
        letterSpacing="0.04em"
        style={{ paintOrder: 'stroke fill', stroke: '#0E1116', strokeWidth: '6px' }}
      >
        PARTITURA
      </text>

      {/* Engraved subtitle rule */}
      <line x1="80" y1="78" x2="120" y2="78" stroke="#D4A34A" strokeWidth="1.5" />
      <text
        x="130"
        y="82"
        fill="#C9B996"
        fontFamily="Plus Jakarta Sans, sans-serif"
        fontSize="12.5"
        fontWeight="500"
        letterSpacing="0.16em"
      >
        LIVE ENSEMBLE RHYTHM
      </text>
    </svg>
  </div>
);

export const InstrumentIcon: React.FC<{
  instrument: InstrumentFamily;
  color?: string;
  className?: string;
}> = ({ instrument, color = '#D4A34A', className = 'w-5 h-5' }) => {
  switch (instrument) {
    case 'violin':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M17.5 3.5l3 3-4.2 4.2c.9 1.6.5 3.7-.9 5.1l-2.4 2.4c-1.8 1.8-4.7 1.8-6.5 0s-1.8-4.7 0-6.5l2.4-2.4c1.4-1.4 3.5-1.8 5.1-.9l3.5-4.9z"
            fill={color}
            fillOpacity="0.24"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="7.5" y1="16.5" x2="18.5" y2="5.5" stroke="#F7F5EE" strokeWidth="1.3" />
        </svg>
      );
    case 'cello':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 2v6m-2-4h4M9.5 8.5c-2.2 1-3 3.2-1.8 5-1.6 1.8-1.4 4.8.7 6.3 1.1.8 2.4 1.2 3.6 1.2s2.5-.4 3.6-1.2c2.1-1.5 2.3-4.5.7-6.3 1.2-1.8.4-4-1.8-5h-5z"
            fill={color}
            fillOpacity="0.24"
            stroke={color}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="12" y1="21" x2="12" y2="23" stroke={color} strokeWidth="1.8" />
        </svg>
      );
    case 'flute':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <line x1="3" y1="19" x2="21" y2="5" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="8" cy="15" r="1.1" fill="#0E1116" />
          <circle cx="11.5" cy="12.3" r="1.1" fill="#0E1116" />
          <circle cx="15" cy="9.6" r="1.1" fill="#0E1116" />
        </svg>
      );
    case 'trumpet':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M3 13h11l6-4v10l-6-4H3v-2zm6-3v3m2.5-3v3m2.5-3v3"
            fill={color}
            fillOpacity="0.22"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'clarinet':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M15 3l2 1-8 14 2 2-5 1 1-5 2 1 6-14z"
            fill={color}
            fillOpacity="0.24"
            stroke={color}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="13" cy="8.5" r="0.9" fill="#F7F5EE" />
          <circle cx="11.2" cy="11.8" r="0.9" fill="#F7F5EE" />
        </svg>
      );
    case 'guitar':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M18 3l3 3-6.5 6.5c1.1 1.7.8 4.1-.8 5.7-1.9 1.9-5 1.9-6.9 0-1.9-1.9-1.9-5 0-6.9 1.6-1.6 4-1.9 5.7-.8L18 3z"
            fill={color}
            fillOpacity="0.22"
            stroke={color}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10.2" cy="14.8" r="1.6" fill="#0E1116" stroke={color} strokeWidth="1.2" />
        </svg>
      );
    case 'piano':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2"
            fill={color}
            fillOpacity="0.18"
            stroke={color}
            strokeWidth="1.7"
          />
          <line x1="7.5" y1="5" x2="7.5" y2="19" stroke={color} strokeWidth="1.2" />
          <line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth="1.2" />
          <line x1="16.5" y1="5" x2="16.5" y2="19" stroke={color} strokeWidth="1.2" />
          <rect x="6.2" y="5" width="2.6" height="8" fill={color} />
          <rect x="10.7" y="5" width="2.6" height="8" fill={color} />
          <rect x="15.2" y="5" width="2.6" height="8" fill={color} />
        </svg>
      );
    case 'saxophone':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M7 4h4l2 10c.3 2 1.8 3 3.2 2.5 1.4-.5 2-2 1.8-3.5l2.5-1c.5 3.6-1.2 7.2-4.6 8.1-3.3.9-6.6-1.2-7.3-4.8L6.5 6.5 5 5.5"
            fill={color}
            fillOpacity="0.22"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
};
