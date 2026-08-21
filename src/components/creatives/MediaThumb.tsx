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
}: {
  url: string | null;
  kind: MediaKind;
  thumbnail: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(url);

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

  if (kind === 'video' && url) {
    return (
      <video controls preload="metadata" playsInline className="absolute inset-0 size-full object-cover">
        <source src={url} />
      </video>
    );
  }

  if (kind === 'image' && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={title} loading="lazy" className="absolute inset-0 size-full object-cover" />;
  }

  return (
    <div className="absolute inset-0 grid place-items-center gap-1.5 text-ink-muted">
      <VideoOff size={22} strokeWidth={1.5} className="mx-auto opacity-50" />
      <span className="text-[10px] opacity-70">Tiada video</span>
    </div>
  );
}
