'use client';

import { useState } from 'react';
import { Play, VideoOff } from 'lucide-react';
import { youtubeId } from '@/lib/ingest/mediaLinks';
import type { MediaKind } from '@/types/db';

/**
 * YouTube embeds are heavy, and a grid can hold fifty of them. Only the poster
 * loads until the viewer actually asks to play.
 */
export function MediaThumb({
  url,
  kind,
  thumbnail,
  title,
  preview,
  autoPreview = false,
}: {
  url: string | null;
  kind: MediaKind;
  thumbnail: string | null;
  title: string;
  /** Meta's own iframe of the finished ad, if the sync captured one. */
  preview?: string | null;
  /** Renders the preview straight away. For a single creative, never a grid. */
  autoPreview?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(autoPreview && Boolean(preview));
  const id = youtubeId(url);

  // Meta's preview is the whole ad — page name, primary text, CTA button — so
  // it is the truest answer to "what did people actually see". It is also an
  // iframe, and a grid holds fifty tiles, so it loads on demand rather than on
  // render.
  if (preview && previewing) {
    return (
      <iframe
        className="absolute inset-0 size-full border-0 bg-white"
        src={preview}
        title={`Pratonton iklan ${title}`}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    );
  }

  if (id) {
    if (playing) {
      return (
        <iframe
          className="absolute inset-0 size-full border-0"
          src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group absolute inset-0 cursor-pointer overflow-hidden"
        aria-label={`Main video ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={(event) => {
            // Shorts and very new uploads sometimes lack hqdefault; mqdefault
            // always exists. Falling back once avoids an empty black tile.
            const image = event.currentTarget;
            const fallback = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
            if (!image.src.endsWith('mqdefault.jpg')) image.src = fallback;
          }}
        />
        <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/10">
          <span className="grid size-11 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm">
            <Play size={18} fill="currentColor" strokeWidth={0} />
          </span>
        </span>
      </button>
    );
  }

  const media =
    kind === 'video' && url ? (
      <video controls preload="metadata" playsInline className="absolute inset-0 size-full object-cover">
        <source src={url} />
      </video>
    ) : kind === 'image' && url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={title} loading="lazy" className="absolute inset-0 size-full object-cover" />
    ) : thumbnail ? (
      // A video whose signed URL has expired still has its still, and a poster
      // beats an empty tile.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbnail} alt={title} loading="lazy" className="absolute inset-0 size-full object-cover" />
    ) : (
      <div className="absolute inset-0 grid place-items-center gap-1.5 text-ink-muted">
        <VideoOff size={22} strokeWidth={1.5} className="mx-auto opacity-50" />
        <span className="text-[10px] opacity-70">Tiada media</span>
      </div>
    );

  if (!preview) return media;

  // Offered alongside the media rather than instead of it: the stored asset
  // answers "what does this look like", the preview answers "what did people
  // actually see". Both are worth having, and only one of them costs an iframe.
  return (
    <>
      {media}
      <button
        type="button"
        onClick={() => setPreviewing(true)}
        className={[
          // Below the status badges, above the video element's own controls —
          // both of which own the edges of this tile.
          'absolute left-2 top-10 z-10 rounded-full bg-black/70 px-2.5 py-1',
          'text-[11px] font-medium text-white backdrop-blur-sm transition-colors',
          'hover:bg-black/85',
        ].join(' ')}
      >
        Lihat iklan sebenar
      </button>
    </>
  );
}
