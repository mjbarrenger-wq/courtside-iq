// Retrofit video-timing alignment for already-imported games: derives play_by_play
// video_time from the already-stored clock_time (seconds remaining in the period),
// given a handful of coach-confirmed anchor points per period. See CLAUDE.md /
// project memory for the feature rationale — imported games carry a full,
// reconciled game clock but no video timestamps.

export interface ClockAnchor {
  videoTime: number // seconds elapsed in the period's video
  clockTime: number // seconds remaining in the period (matches play_by_play.clock_time)
}

/**
 * Piecewise-linear video_time for one clock_time value, given 2+ anchor points.
 * Anchors are sorted by clockTime descending (chronological video order, since the
 * game clock counts down). A value between two anchors is interpolated within that
 * segment; a value outside the whole anchor range is extrapolated using the nearest
 * segment's slope (bounded to a single segment, so one bad anchor can't skew the
 * whole period). Returns null with fewer than 2 anchors — nothing to interpolate.
 */
export function videoTimeFromClock(clockTime: number, anchors: ClockAnchor[]): number | null {
  if (anchors.length < 2) return null
  const sorted = [...anchors].sort((a, b) => b.clockTime - a.clockTime)

  let i = 0
  while (i < sorted.length - 2 && clockTime < sorted[i + 1].clockTime) i++
  const lo = sorted[i], hi = sorted[i + 1]

  if (lo.clockTime === hi.clockTime) return Math.max(0, lo.videoTime)
  const t = (lo.clockTime - clockTime) / (lo.clockTime - hi.clockTime)
  return Math.max(0, lo.videoTime + t * (hi.videoTime - lo.videoTime))
}
