import React, { useEffect, useRef } from 'react';
import { FileText, Film, Minus, Plus, X } from 'lucide-react';

interface YouTubeSyncPlayerProps {
  videoId: string | null;
  pdfBlobUrl?: string;
  pdfFileName?: string;
  isPlaying: boolean;
  currentSec: number;
  offsetSec: number;
  playbackRate: number;
  isOpen: boolean;
  activeTab: 'video' | 'pdf';
  onTabChange: (tab: 'video' | 'pdf') => void;
  onOffsetChange: (newOffset: number) => void;
  onClose: () => void;
}

export const YouTubeSyncPlayer: React.FC<YouTubeSyncPlayerProps> = ({
  videoId,
  pdfBlobUrl,
  pdfFileName,
  isPlaying,
  currentSec,
  offsetSec,
  playbackRate,
  isOpen,
  activeTab,
  onTabChange,
  onOffsetChange,
  onClose,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSyncStateRef = useRef<{ playing: boolean; rate: number }>({
    playing: false,
    rate: 1,
  });

  const postYouTubeCommand = (func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args,
        }),
        '*'
      );
    } catch {
      // ignore cross-origin restrictions before iframe init
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'video' || !videoId) return;

    if (isPlaying !== lastSyncStateRef.current.playing) {
      if (isPlaying) {
        const targetTime = Math.max(0, currentSec + offsetSec);
        postYouTubeCommand('seekTo', [targetTime, true]);
        postYouTubeCommand('playVideo');
      } else {
        postYouTubeCommand('pauseVideo');
      }
      lastSyncStateRef.current.playing = isPlaying;
    }

    if (playbackRate !== lastSyncStateRef.current.rate) {
      postYouTubeCommand('setPlaybackRate', [playbackRate]);
      lastSyncStateRef.current.rate = playbackRate;
    }
  }, [isPlaying, playbackRate, isOpen, activeTab, videoId, currentSec, offsetSec]);

  if (!isOpen) return null;

  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`
    : null;

  return (
    <aside
      aria-label="Synchronized reference stage monitor"
      className="w-[330px] shrink-0 h-full bg-[#151922] border border-[#282E3C] rounded-lg flex flex-col overflow-hidden"
    >
      {/* Monitor Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#252B38] bg-[#12161E]">
        <div className="flex items-center gap-1 p-0.5 rounded bg-[#0E1116]">
          <button
            type="button"
            onClick={() => onTabChange('video')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'video'
                ? 'bg-[#252C3B] text-[#F3EFE6]'
                : 'text-[#8F887A] hover:text-[#D9D3C7]'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            YouTube Sync
          </button>
          {pdfBlobUrl && (
            <button
              type="button"
              onClick={() => onTabChange('pdf')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'pdf'
                  ? 'bg-[#252C3B] text-[#F3EFE6]'
                  : 'text-[#8F887A] hover:text-[#D9D3C7]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Original PDF
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reference monitor"
          className="p-1.5 rounded text-[#9A9284] hover:text-[#F3EFE6] hover:bg-[#232936] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Monitor Body */}
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
        {activeTab === 'video' ? (
          <>
            <div className="relative w-full aspect-video rounded overflow-hidden bg-[#0A0C10] border border-[#262C3A]">
              {embedSrc ? (
                <iframe
                  ref={iframeRef}
                  src={embedSrc}
                  title="Synchronized YouTube performance video"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-xs text-[#8E8779]">
                  <Film className="w-6 h-6 mb-2 text-[#5E6575]" />
                  No YouTube URL attached to this score.
                </div>
              )}
            </div>

            {/* Alignment Controls */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[#B7B0A2]">
                <span>Video Sync Offset</span>
                <span className="font-mono tabular-nums text-[#E8D5AD]">
                  {offsetSec >= 0 ? '+' : ''}
                  {offsetSec.toFixed(1)}s
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOffsetChange(Math.max(-10, Number((offsetSec - 0.5).toFixed(1))))}
                  aria-label="Shift video earlier by 0.5 seconds"
                  className="p-1.5 rounded bg-[#1E2430] hover:bg-[#293142] border border-[#303748] text-[#E5DFD3] cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={-10}
                  max={15}
                  step={0.1}
                  value={offsetSec}
                  onChange={(e) => onOffsetChange(Number(e.target.value))}
                  aria-label="YouTube video start offset in seconds"
                  className="flex-1 accent-[#D4A34A] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => onOffsetChange(Math.min(15, Number((offsetSec + 0.5).toFixed(1))))}
                  aria-label="Shift video later by 0.5 seconds"
                  className="p-1.5 rounded bg-[#1E2430] hover:bg-[#293142] border border-[#303748] text-[#E5DFD3] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const target = Math.max(0, currentSec + offsetSec);
                  postYouTubeCommand('seekTo', [target, true]);
                  if (isPlaying) postYouTubeCommand('playVideo');
                }}
                className="w-full py-2 px-3 rounded bg-[#222836] hover:bg-[#2B3345] border border-[#323A4D] text-xs font-medium text-[#F3EFE6] transition-colors cursor-pointer"
              >
                Re-sync Video to Playhead ({Math.max(0, currentSec + offsetSec).toFixed(1)}s)
              </button>
              <p className="text-[11px] leading-relaxed text-[#8E8779]">
                Align the scrolling score with any intro silence or pickup measure in your YouTube recording.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <div className="text-[11px] text-[#A69F92] truncate">
              {pdfFileName || 'Uploaded Sheet Music PDF'}
            </div>
            {pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title="Uploaded PDF sheet music preview"
                className="flex-1 w-full rounded border border-[#262C3A] bg-white"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#8E8779]">
                No PDF uploaded for this piece.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
