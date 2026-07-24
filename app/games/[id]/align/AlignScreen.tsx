'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseYouTubeId } from '@/lib/youtube'
import { videoTimeFromClock, type ClockAnchor } from '@/lib/videoAlign'
import { aggregateBox, type EventType } from '@/lib/pbpAggregate'
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
  teamScore: number
  oppScore: number
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
// Parse a typed "M:SS" (or bare seconds) game clock into seconds-remaining. Returns
// null on anything unparseable so the caller can reject it.
const parseClock = (str: string): number | null => {
  const t = str.trim()
  if (!t) return null
  const m = t.match(/^(\d{1,2}):([0-5]?\d(?:\.\d+)?)$/)
  if (m) return parseInt(m[1], 10) * 60 + parseFloat(m[2])
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  return null
}
const PRETTY_FULL: Record<string, string> = {
  made_2pt: 'made 2', missed_2pt: 'missed 2', made_3pt: 'made 3', missed_3pt: 'missed 3',
  made_ft: 'made FT', missed_ft: 'missed FT', oreb: 'offensive rebound', dreb: 'defensive rebound',
  assist: 'assist', steal: 'steal', block: 'block', turnover: 'turnover',
  def_foul: 'defensive foul', off_foul: 'offensive foul', foul: 'foul', sub_in: 'sub in', sub_out: 'sub out',
}
const isPlay = (et: string) => et !== 'sub_in' && et !== 'sub_out'

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

  // Which play the on-video overlay reflects (score / clock / that player's stats,
  // all as of that play). Follows the row the coach points at; falls back to the
  // latest play in the period so the scoreboard is never blank.
  const [focusOrder, setFocusOrder] = useState<number | null>(null)
  // Manual anchor entry — lets the coach anchor a clock the play list doesn't carry,
  // most usefully the quarter tip at 10:00, and correct a time by hand.
  const [manualClock, setManualClock] = useState('10:00')

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
  function addManualAnchor() {
    const clk = parseClock(manualClock)
    if (clk == null || clk < 0 || clk > 600) { setError('Enter the game clock as M:SS between 0:00 and 10:00.'); return }
    const vt = currentVideoTime()
    if (vt == null) { setError('Video isn’t ready yet — press play once, then try again.'); return }
    setError(null)
    const withoutSameClock = anchors.filter(a => a.clockTime !== clk)
    setAnchors([...withoutSameClock, { videoTime: vt, clockTime: clk }])
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

  // ── Overlay state: game score / clock / stats as of the focused play ──────────
  const focusedOrder = focusOrder ?? (periodEvents.length ? periodEvents[periodEvents.length - 1].event_order : null)
  const focusEvent = focusedOrder != null ? events.find(e => e.event_order === focusedOrder) ?? null : null
  const focusBox = useMemo(() => {
    if (focusedOrder == null) return null
    return aggregateBox(events.filter(e => e.event_order <= focusedOrder).map(e => ({
      event_order: e.event_order, period: e.period, event_type: e.event_type as EventType,
      team_side: e.team_side, points: e.points, player_id: e.player_id,
    })))
  }, [events, focusedOrder])
  const focusName = focusEvent
    ? (focusEvent.team_side === 'opponent'
        ? (focusEvent.jersey_number != null ? `${oppShort} #${focusEvent.jersey_number}` : oppShort)
        : (focusEvent.player_id ? eventName(focusEvent) : 'Team'))
    : ''
  const focusCounts = focusEvent && focusEvent.team_side === 'team' && focusEvent.player_id
    ? focusBox?.players.get(focusEvent.player_id) : null

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
      {/* The YouTube API replaces the target div with a fixed-size iframe; force it
          to fill the responsive 16:9 box so the video scales with the window. */}
      <style>{`.ciq-video iframe{position:absolute;inset:0;width:100%!important;height:100%!important;border:0}
@keyframes ciqAlignCardIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
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
        before the last-minute stoppages, and one near the end — then Save. Hover any play to see the score,
        game clock and that player&rsquo;s stats at that point. To anchor the tip-off (which isn&rsquo;t a play),
        use the clock box below: leave it at 10:00 and click <b>= current video</b> at the moment the quarter starts.
        {alreadySynced > 0 && alreadySynced === periodEvents.length && (
          <span style={{ color: GREEN, fontWeight: 700 }}> This quarter is already fully synced — re-align to touch it up.</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]" style={{ gap: 10 }}>
        {/* Video */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="ciq-video" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxWidth: '100%', background: '#000', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {activeVideoId
              ? <div id={`yta-${gameId}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa4b2', fontSize: 12 }}>No video for this quarter.</div>}

            {/* Scoreboard bug — game state as of the focused play */}
            {focusEvent && (
              <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(15,23,42,0.82)', color: '#fff', borderRadius: 10, padding: '6px 12px', pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, background: TEAL, borderRadius: 6, padding: '2px 7px' }}>Q{focusEvent.period}</span>
                <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {focusEvent.teamScore}<span style={{ color: '#94a3b8', margin: '0 6px', fontWeight: 700 }}>–</span>{focusEvent.oppScore}
                </span>
                {focusEvent.clockTime != null && (
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{fmtClock(focusEvent.clockTime)}</span>
                )}
              </div>
            )}

            {/* Current-play card — who / what / that player's stats to date */}
            {focusEvent && isPlay(focusEvent.event_type) && (
              <div key={focusEvent.event_order} style={{
                position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
                minWidth: 220, maxWidth: '82%', animation: 'ciqAlignCardIn 200ms ease-out', pointerEvents: 'none',
                background: 'rgba(255,255,255,0.97)', borderRadius: 12, padding: '9px 15px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)', borderLeft: `4px solid ${focusEvent.team_side === 'opponent' ? AMBER : TEAL}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: focusEvent.team_side === 'opponent' ? AMBER : '#1a1f2e' }}>{focusName}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: SEC }}>{PRETTY_FULL[focusEvent.event_type] ?? focusEvent.event_type}</span>
                  {focusEvent.points > 0 && <span style={{ fontSize: 13.5, fontWeight: 900, color: GREEN }}>+{focusEvent.points}</span>}
                </div>
                {focusCounts && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 3, fontWeight: 600 }}>
                    {focusCounts.pts} PTS · {focusCounts.reb} REB · {focusCounts.ast} AST
                    {focusCounts.stl > 0 && ` · ${focusCounts.stl} STL`}{focusCounts.blk > 0 && ` · ${focusCounts.blk} BLK`}
                    {' · '}{focusCounts.twopt_made + focusCounts.threept_made}/{focusCounts.twopt_att + focusCounts.threept_att} FG
                  </div>
                )}
              </div>
            )}
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
            {/* Manual anchor — set a clock the play list doesn't carry (the quarter
                tip at 10:00) or hand-correct a time, mapped to the current video position. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Anchor clock</span>
              <input
                value={manualClock}
                onChange={ev => setManualClock(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter') addManualAnchor() }}
                placeholder="10:00" inputMode="numeric" aria-label="Game clock to anchor (M:SS)"
                style={{ width: 62, fontSize: 12, fontWeight: 700, color: SEC, textAlign: 'center', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}
              />
              <button onClick={addManualAnchor} title="Drop an anchor: this game clock = the video's current position" style={{
                fontSize: 11.5, fontWeight: 700, color: TEAL, background: '#eaf3f6', border: `1px solid ${TEAL}`,
                borderRadius: 6, padding: '4px 9px', cursor: 'pointer',
              }}>= current video</button>
              <button onClick={() => setManualClock('10:00')} title="Quarter start" style={{
                fontSize: 11, fontWeight: 600, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              }}>tip 10:00</button>
            </div>
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
                      onMouseEnter={ev => { setFocusOrder(e.event_order); if (!isAnchor) ev.currentTarget.style.background = '#f1f5f9' }}
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
