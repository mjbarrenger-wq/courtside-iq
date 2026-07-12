'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseYouTubeId } from '@/lib/youtube'
import { videoTimeFromClock, type ClockAnchor } from '@/lib/videoAlign'
import { alignGameVideoTiming } from '../actions'

const BG = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD = '#ffffff'
const TEAL = '#307b92'
const SEC = '#374151'
const MUTED = '#6b7280'
const GREEN = '#059669'
const RED = '#dc2626'
const AMBER = '#d97706'

export interface AlignPlayer {
  id: string
  jersey_number: number
  first_name: string
  last_name: string
}

export interface AlignEvent {
  event_order: number
  period: number
  event_type: string
  team_side: 'team' | 'opponent'
  points: number
  player_id: string | null
  jersey_number: number | null
  clockTime: number | null
  videoTime: number | null
}

const PRETTY: Record<string, string> = {
  made_2pt: 'made 2', missed_2pt: 'missed 2', made_3pt: 'made 3', missed_3pt: 'missed 3',
  made_ft: 'made FT', missed_ft: 'missed FT', oreb: 'off. rebound', dreb: 'def. rebound',
  assist: 'assist', steal: 'steal', block: 'block', turnover: 'turnover',
  def_foul: 'def. foul', off_foul: 'off. foul', foul: 'foul', sub_in: 'sub in', sub_out: 'sub out',
}

const fmtClock = (s: number | null) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const fmtVt = (s: number) => {
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

// Retrofit alignment screen: for one period at a time, the coach scrubs the video
// to a handful of recognizable plays (already known from the imported play-by-play)
// and confirms "this is that play" — capturing (video_time, clock_time) anchor
// pairs. Saving interpolates video_time for every other play in that period from
// those anchors (lib/videoAlign.ts). No live scoring here — the box/pbp already
// exist; this only backfills where each play falls in the video.
export default function AlignScreen({
  gameId, players, opponentName, videoUrls, events,
}: {
  gameId: string
  players: AlignPlayer[]
  opponentName: string
  videoUrls: string[]
  events: AlignEvent[]
}) {
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const oppShort = opponentName.split(' ')[0]
  const eventName = (e: AlignEvent) => e.team_side === 'opponent'
    ? (e.jersey_number != null ? `${oppShort} #${e.jersey_number}` : oppShort)
    : (e.player_id ? (() => { const p = playerById.get(e.player_id!); return p ? `#${p.jersey_number} ${p.first_name}` : '—' })() : 'Team')

  const videoIds = useMemo(() => videoUrls.map(u => parseYouTubeId(u)).filter(Boolean) as string[], [videoUrls])
  const perQuarter = videoIds.length === 4

  const periods = useMemo(
    () => Array.from(new Set(events.map(e => e.period))).sort((a, b) => a - b),
    [events],
  )
  const [period, setPeriod] = useState(() => periods[0] ?? 1)
  const periodEvents = useMemo(
    () => events.filter(e => e.period === period).sort((a, b) => a.event_order - b.event_order),
    [events, period],
  )
  const alreadySynced = periodEvents.filter(e => e.videoTime != null).length

  // Anchors are kept per period so switching tabs mid-session doesn't lose work.
  const [anchorsByPeriod, setAnchorsByPeriod] = useState<Record<number, ClockAnchor[]>>({})
  const anchors = anchorsByPeriod[period] ?? []
  const setAnchors = (next: ClockAnchor[]) => setAnchorsByPeriod(prev => ({ ...prev, [period]: next }))

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  // ── YouTube IFrame player (same pattern as WatchScreen) ──────────────────
  const ytRef = useRef<any>(null)
  const [ytReady, setYtReady] = useState(false)
  const activeVideoId = perQuarter ? videoIds[Math.min(period, 4) - 1] : videoIds[0]

  useEffect(() => {
    if (!activeVideoId) return
    let cancelled = false
    const build = () => {
      if (cancelled || !window.YT?.Player) return
      ytRef.current = new window.YT.Player(`yta-${gameId}`, {
        videoId: activeVideoId,
        playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onReady: () => setYtReady(true) },
      })
    }
    if (window.YT?.Player) build()
    else {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); build() }
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script')
        s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(s)
      }
    }
    return () => {
      cancelled = true
      try { ytRef.current?.destroy?.() } catch { /* noop */ }
      ytRef.current = null; setYtReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, videoIds.length])

  useEffect(() => {
    if (!perQuarter || !ytReady || !activeVideoId) return
    try { ytRef.current?.loadVideoById?.(activeVideoId) } catch { /* noop */ }
  }, [activeVideoId, perQuarter, ytReady])

  function currentVideoTime(): number | null {
    try {
      const t = ytRef.current?.getCurrentTime?.()
      return typeof t === 'number' && !Number.isNaN(t) ? t : null
    } catch { return null }
  }
  function seekTo(sec: number) {
    try { ytRef.current?.seekTo?.(Math.max(0, sec), true) } catch { /* noop */ }
  }

  function setAnchorHere(e: AlignEvent) {
    if (e.clockTime == null) return
    const vt = currentVideoTime()
    if (vt == null) { setError('Video isn’t ready yet — press play once, then try again.'); return }
    setError(null)
    const withoutSameClock = anchors.filter(a => a.clockTime !== e.clockTime)
    setAnchors([...withoutSameClock, { videoTime: vt, clockTime: e.clockTime }])
  }
  function removeAnchor(clockTime: number) {
    setAnchors(anchors.filter(a => a.clockTime !== clockTime))
  }

  async function saveThisPeriod() {
    if (anchors.length < 2) { setError('Set at least 2 anchors for this period before saving.'); return }
    setSaving(true)
    setError(null)
    const res = await alignGameVideoTiming(gameId, { [period]: anchors })
    setSaving(false)
    if (!res.success) { setError(res.error ?? 'Could not save alignment.'); return }
    setSaveMsg(prev => ({ ...prev, [period]: `✓ Synced ${res.updated ?? 0} plays` }))
  }

  const preview = new Map<number, number>()
  if (anchors.length >= 2) {
    for (const e of periodEvents) {
      if (e.clockTime == null) continue
      const vt = videoTimeFromClock(e.clockTime, anchors)
      if (vt != null) preview.set(e.event_order, vt)
    }
  }

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased',
      padding: '10px 10px 40px',
    }}>
      {/* Header */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10,
      }}>
        <div style={{ fontSize: 11, color: MUTED }}>
          <a href={`/games/${gameId}`} style={{ color: MUTED, textDecoration: 'none' }}>Debrief</a>
          <span style={{ margin: '0 6px' }}>›</span>
          <span style={{ color: TEAL, fontWeight: 700 }}>Align Timing</span>
        </div>
        {periods.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
            {periods.map(p => {
              const synced = events.filter(e => e.period === p && e.videoTime != null).length
              const total = events.filter(e => e.period === p).length
              return (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${period === p ? TEAL : BORDER}`,
                  color: period === p ? '#fff' : MUTED, background: period === p ? TEAL : '#fff',
                }}>
                  Q{p}{synced > 0 && <span style={{ marginLeft: 5, color: period === p ? '#d1f0e6' : GREEN }}>✓{synced === total ? '' : ` ${synced}/${total}`}</span>}
                </button>
              )
            })}
          </div>
        )}
        <a href={`/games/${gameId}`} style={{
          marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#fff', background: TEAL,
          textDecoration: 'none', borderRadius: 7, padding: '6px 12px',
        }}>Done</a>
      </div>

      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>
        Scrub or play the video to a recognizable moment, then click the matching play in the list below to
        drop an anchor there. Set at least 2 anchors per quarter — ideally one near the start, one right
        before the last-minute stoppages, and one near the end — then Save.
        {alreadySynced > 0 && alreadySynced === periodEvents.length && (
          <span style={{ color: GREEN, fontWeight: 700 }}> This quarter is already fully synced — re-align to touch it up.</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]" style={{ gap: 10 }}>
        {/* Video */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxWidth: '100%', background: '#000', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {activeVideoId
              ? <div id={`yta-${gameId}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa4b2', fontSize: 12 }}>No video for this quarter.</div>}
          </div>
        </div>

        {/* Anchors + event list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {/* Anchor list */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em', marginBottom: 6 }}>
              ANCHORS — Q{period} <span style={{ fontWeight: 500, color: MUTED, textTransform: 'none', letterSpacing: 0 }}>({anchors.length} set, need 2+)</span>
            </div>
            {anchors.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED }}>None yet — click a play below while the video is at that moment.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...anchors].sort((a, b) => b.clockTime - a.clockTime).map(a => (
                  <div key={a.clockTime} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: SEC, fontWeight: 700, width: 46 }}>{fmtClock(a.clockTime)}</span>
                    <span style={{ color: MUTED }}>→ video {fmtVt(a.videoTime)}</span>
                    <button onClick={() => removeAnchor(a.clockTime)} style={{ marginLeft: 'auto', fontSize: 11, color: RED, background: 'transparent', border: 'none', cursor: 'pointer' }}>✕ remove</button>
                  </div>
                ))}
              </div>
            )}
            {error && <div style={{ fontSize: 12, color: RED, marginTop: 8, fontWeight: 600 }}>{error}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button
                onClick={saveThisPeriod} disabled={saving || anchors.length < 2}
                style={{
                  fontSize: 12, fontWeight: 700, color: '#fff',
                  background: anchors.length >= 2 ? TEAL : '#c7cdd6',
                  border: 'none', borderRadius: 7, padding: '7px 16px', cursor: anchors.length >= 2 ? 'pointer' : 'default',
                }}
              >{saving ? 'Saving…' : `Save Q${period} alignment`}</button>
              {saveMsg[period] && <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>{saveMsg[period]}</span>}
            </div>
          </div>

          {/* Event list */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em', marginBottom: 3 }}>
              PLAYS — Q{period} <span style={{ fontWeight: 500, color: MUTED, textTransform: 'none', letterSpacing: 0 }}>· click to anchor here</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 480 }}>
              {periodEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: MUTED }}>No plays in this quarter.</div>
              ) : (
                periodEvents.map(e => {
                  const isAnchor = e.clockTime != null && anchors.some(a => a.clockTime === e.clockTime)
                  const previewVt = preview.get(e.event_order)
                  return (
                    <div key={e.event_order}
                      onClick={() => setAnchorHere(e)}
                      title="Click while the video is at this play to drop an anchor"
                      style={{
                        display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: SEC,
                        padding: '4px 6px', borderRadius: 5, cursor: 'pointer',
                        background: isAnchor ? '#eaf3f6' : 'transparent',
                      }}
                      onMouseEnter={ev => { if (!isAnchor) ev.currentTarget.style.background = '#f1f5f9' }}
                      onMouseLeave={ev => { if (!isAnchor) ev.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ color: MUTED, width: 40 }}>{fmtClock(e.clockTime)}</span>
                      <span style={{ fontWeight: 700, color: e.team_side === 'opponent' ? AMBER : TEAL, minWidth: 84, whiteSpace: 'nowrap' }}>{eventName(e)}</span>
                      <span style={{ whiteSpace: 'nowrap', flex: 1 }}>{PRETTY[e.event_type] ?? e.event_type}{e.points > 0 && <span style={{ color: GREEN, fontWeight: 700 }}> +{e.points}</span>}</span>
                      {isAnchor
                        ? <span style={{ fontSize: 10, fontWeight: 800, color: TEAL }}>📍 anchor</span>
                        : e.videoTime != null
                        ? <button onClick={ev => { ev.stopPropagation(); seekTo(e.videoTime as number) }} style={{ fontSize: 10, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '1px 6px', cursor: 'pointer' }}>synced · jump</button>
                        : previewVt != null && <span style={{ fontSize: 10, color: MUTED }}>≈{fmtVt(previewVt)}</span>}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
