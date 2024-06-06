import { useEffect, useMemo, useRef, useState } from 'react';
import { Plyr } from 'plyr-react';
import 'plyr-react/plyr.css';
import './VideoPlayer.css';
import { makeTranslator } from '../utils/i18n';

interface VideoPlayerProps {
  /** Self-hosted MP4 URL, e.g. /media/videos/interviews/ben-yehooda.mp4 */
  src: string;
  /** Poster image shown before playback starts. */
  poster?: string;
  /** Optional title surfaced to screen readers and the player chrome. */
  title?: string;
}

/**
 * Plyr-based HTML5 video player. Replaces the prior Wistia/Kinescope iframes
 * with a self-hosted MP4 surface served by nginx straight out of
 * /opt/discammer/media/. Cyberpunk accent comes from VideoPlayer.css
 * (--plyr-color-main → brand cyan #65def0).
 */
export default function VideoPlayer({ src, poster, title }: VideoPlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // Media `error` events don't bubble and Plyr owns the <video> element, so
  // listen on the wrapper in the capture phase. With <video><source> markup
  // (which Plyr builds from the sources array) a failed load fires `error`
  // on the <source> child, not the video — match both.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onError = (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLVideoElement || target instanceof HTMLSourceElement) {
        setFailed(true);
      }
    };
    wrap.addEventListener('error', onError, true);
    return () => wrap.removeEventListener('error', onError, true);
  }, []);

  // useMemo so the underlying <video> element doesn't get rebuilt on every
  // render — Plyr is sensitive to source-object identity for resume/state.
  const source = useMemo(
    () => ({
      type: 'video' as const,
      title,
      sources: [{ src, type: 'video/mp4' }],
      poster,
    }),
    [src, poster, title],
  );

  const tr = makeTranslator('video');

  // On failure the player is hidden, NOT unmounted: Plyr restructures the DOM
  // it owns, and letting React reconcile that subtree away throws
  // NotFoundError (removeChild). The notice fills the .video-embed 16:9 frame
  // (the markdown wrapper is position:relative with aspect-ratio).
  return (
    <>
      {failed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
          <div className="font-mono text-[13px] text-[#aab2c4]">{tr('offline')}</div>
          {title && <div className="font-mono text-[12px] text-[#6b7588]">{title}</div>}
        </div>
      )}
      <div ref={wrapRef} className="discammer-player" style={failed ? { display: 'none' } : undefined}>
      <Plyr
        source={source}
        options={{
          // Comfortable defaults: progressive-mp4 only, no ads, no third-party
          // analytics, captions off by default. Keyboard controls enabled.
          controls: [
            'play-large',
            'play',
            'progress',
            'current-time',
            'duration',
            'mute',
            'volume',
            'captions',
            'settings',
            'pip',
            'airplay',
            'fullscreen',
          ],
          settings: ['quality', 'speed', 'loop'],
          speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
          ratio: '16:9',
          keyboard: { focused: true, global: false },
          tooltips: { controls: true, seek: true },
          captions: { active: false, language: 'auto', update: false },
          fullscreen: { enabled: true, fallback: true, iosNative: true },
          // Self-host the icon sprite so we don't ping cdn.plyr.io. The
          // sprite is a manually committed file at backend/static/plyr.svg
          // (no build step copies it) — FastAPI serves it from
          // /static/plyr.svg. Without this (or
          // loadSprite: true falling back to the CDN), every control icon
          // including the big centre play triangle renders blank.
          iconUrl: '/static/plyr.svg',
          loadSprite: true,
          hideControls: true,
        }}
      />
      </div>
    </>
  );
}
