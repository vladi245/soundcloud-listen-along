import { trackPageUrl } from './player';

export interface TrackLabel {
  title: string;
  artist: string;
}

// SoundCloud permalinks are readable slugs, which is enough for a label
// without asking SoundCloud for metadata.
export function describeTrack(url: string | undefined): TrackLabel | null {
  const canonical = url ? trackPageUrl(url) : null;
  if (!canonical) return null;
  const [artist, title] = new URL(canonical).pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).replaceAll('-', ' '));
  return { title, artist };
}
