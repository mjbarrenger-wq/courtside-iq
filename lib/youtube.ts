// YouTube URL helpers for native stat entry (STAT_ENTRY.md §1a).
//
// A game's video is one or four YouTube links. The same handful of URL shapes
// resolve to one video id — parse them in one place so the /games/new validation
// and the /games/[id]/enter IFrame embed can never disagree on what a link means.

const ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * Extract the 11-character video id from any common YouTube URL shape, or return
 * null if the string doesn't resolve to one. Handles:
 *   youtu.be/<id>
 *   youtube.com/watch?v=<id>        (and any other query params)
 *   youtube.com/live/<id>           (streams)
 *   youtube.com/embed/<id>
 *   youtube.com/shorts/<id>
 *   a bare 11-char id
 */
export function parseYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null
  if (ID_RE.test(raw)) return raw

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }

  const host = u.hostname.replace(/^www\./, '').toLowerCase()

  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0]
    return id && ID_RE.test(id) ? id : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v')
    if (v && ID_RE.test(v)) return v
    const parts = u.pathname.split('/').filter(Boolean)
    // /live/<id>, /embed/<id>, /shorts/<id>, /v/<id>
    if (parts.length >= 2 && ['live', 'embed', 'shorts', 'v'].includes(parts[0])) {
      return ID_RE.test(parts[1]) ? parts[1] : null
    }
  }

  return null
}

// Privacy-friendly embed URL for the IFrame Player API. enablejsapi lets the
// entry screen read the current playback position for each event's video_time.
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1`
}
