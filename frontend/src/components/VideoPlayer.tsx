import { useMemo } from 'react';
import { Plyr } from 'plyr-react';
import 'plyr-react/plyr.css';
import './VideoPlayer.css';

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
 * (--plyr-color-main → site cyan #00F0FF).
 */
export default function VideoPlayer({ src, poster, title }: VideoPlayerProps) {
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

  return (
    <div className="discammer-player">
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
          // sprite is copied into backend/static/plyr.svg at build time —
          // FastAPI serves it from /static/plyr.svg. Without this (or
          // loadSprite: true falling back to the CDN), every control icon
          // including the big centre play triangle renders blank.
          iconUrl: '/static/plyr.svg',
          loadSprite: true,
          hideControls: true,
        }}
      />
    </div>
  );
}
