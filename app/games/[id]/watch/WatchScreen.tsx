'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalEvent } from '@/lib/entryState'
import type { EventType } from '@/lib/pbpAggregate'
import { aggregateBox } from '@/lib/pbpAggregate'
import { parseYouTubeId } from '@/lib/youtube'

const BG = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD = '#ffffff'
const TEAL = '#307b92'
const SEC = '#374151'
const MUTED = '#6b7280'
const GREEN = '#059669'
const RED = '#dc2626'
const AMBER = '#d97706'

export interface WatchPlayer {
  id: string
  jersey_number: number
  first_name: string
  last_name: string
}

const fmtVt = (s: number | null | undefined) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

const PRETTY: Record<EventType, string> = {
  made_2pt: 'made 2', missed_2pt: 'missed 2', made_3pt: 'made 3', missed_3pt: 'missed 3',
  made_ft: 'made FT', missed_ft: 'missed FT', oreb: 'offensive rebound', dreb: 'defensive rebound',
  assist: 'assist', steal: 'steal', block: 'block', turnover: 'turnover',
  def_foul: 'defensive foul', off_foul: 'offensive foul', foul: 'foul', sub_in: 'sub in', sub_out: 'sub out',
}
const isPlay = (et: EventType) => et !== 'sub_in' && et !== 'sub_out'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

// Review / watch mode: the captured play-by-play replays in sync with the game video.
// As the video reaches each event's timestamp a card surfaces the play + that player's
// stats-to-date, and the box score beside the video reflects the game AS OF that point.
export default function WatchScreen({
  gameId, players, opponentName, videoUrls, events,
}: {
  gameId: string
  players: WatchPlayer[]
  opponentName: string
  videoUrls: string[]
  events: LocalEvent[]
}) {
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const oppShort = opponentName.split(' ')[0]
  const chipName = (id: string) => {
    const p = playerById.get(id)
    return p ? `#${p.jersey_number} ${p.first_name}` : id.slice(-4)
  }

  const videoIds = useMemo(() => videoUrls.map(u => parseYouTubeId(u)).filter(Boolean) as string[], [videoUrls])
  const perQuarter = videoIds.length === 4

  const [period, setPeriod] = useState(() => events[0]?.period ?? 1)
  const [curOrder, setCurOrder] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  // Events for the currently-loaded video, ordered, that carry a playback timestamp.
  const periodEvents = useMemo(() =>
    events.filter(e => (perQuarter ? e.period === period : true) && e.video_time != null)
          .sort((a, b) => a.event_order - b.event_order),
  [events, period, perQuarter])

  // Max event_order completed in prior periods (per-quarter footage only), so the box
  // "to date" includes earlier quarters even before the current one has a passed event.
  const priorMax = useMemo(() => {
    if (!perQuarter) return 0
    let m = 0
    for (const e of events) if (e.period < period && e.event_order > m) m = e.event_order
    return m
  }, [events, period, perQuarter])

  const cutoff = curOrder ?? priorMax
  // Box score as of the current video position (cumulative through the passed event).
  const box = useMemo(() => aggregateBox(events.filter(e => e.event_order <= cutoff)), [events, cutoff])
  const curEvent = useMemo(
    () => (curOrder != null ? events.find(e => e.event_order === curOrder) ?? null : null),
    [events, curOrder],
  )

  // ── YouTube IFrame player ──────────────────────────────────────────────────
  const ytRef = useRef<any>(null)
  const [ytReady, setYtReady] = useState(false)
  const activeVideoId = perQuarter ? videoIds[Math.min(period, 4) - 1] : videoIds[0]

  useEffect(() => {
    if (!activeVideoId) return
    let cancelled = false
    const build = () => {
      if (cancelled || !window.YT?.Player) return
      ytRef.current = new window.YT.Player(`ytw-${gameId}`, {
        videoId: activeVideoId,
        playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => setYtReady(true),
          onStateChange: (e: { data: number }) => setPlaying(e?.data === 1),
        },
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

  const videoTime = useCallback((): number | null => {
    try {
      const t = ytRef.current?.getCurrentTime?.()
      return typeof t === 'number' && !Number.isNaN(t) ? t : null
    } catch { return null }
  }, [])
  const seekTo = useCallback((sec: number | null) => {
    if (sec == null) return
    try { ytRef.current?.seekTo?.(Math.max(0, sec), true) } catch { /* noop */ }
  }, [])
  const skip = useCallback((d: number) => {
    try { const t = ytRef.current?.getCurrentTime?.(); if (typeof t === 'number') ytRef.current?.seekTo?.(Math.max(0, t + d), true) } catch { /* noop */ }
  }, [])
  const togglePlay = useCallback(() => {
    const p = ytRef.current
    if (!p) return
    try { p.getPlayerState?.() === 1 ? p.pauseVideo() : p.playVideo() } catch { /* noop */ }
  }, [])

  // ── Replay cursor: follow the video position (250ms) ────────────────────────
  const tickRef = useRef<() => void>(() => {})
  tickRef.current = () => {
    const pos = videoTime()
    if (pos == null) return
    let found: number | null = null
    for (const e of periodEvents) { if ((e.video_time as number) <= pos) found = e.event_order; else break }
    if (found !== curOrder) setCurOrder(found)
  }
  useEffect(() => {
    if (!activeVideoId) return
    const id = setInterval(() => tickRef.current(), 250)
    return () => clearInterval(id)
  }, [activeVideoId])

  // Keyboard: space play/pause, arrows scrub ±10s.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); skip(10) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [togglePlay, skip])

  const usScore = box.team.pts
  const themScore = box.opponent.pts
  const dispPeriod = perQuarter ? period : (curEvent?.period ?? events[events.length - 1]?.period ?? 1)

  // Current-play card: who + what + (our players) their stats to date.
  const cardName = curEvent
    ? (curEvent.team_side === 'opponent'
        ? (curEvent.jersey_number != null ? `${oppShort} #${curEvent.jersey_number}` : oppShort)
        : (curEvent.player_id ? chipName(curEvent.player_id) : 'Team'))
    : ''
  const cardCounts = curEvent && curEvent.team_side === 'team' && curEvent.player_id
    ? box.players.get(curEvent.player_id) : null
  const showCard = !!curEvent && isPlay(curEvent.event_type)

  // Box rows — every player, cumulative to the current point, sorted by points.
  const boxRows = players.map(p => {
    const c = box.players.get(p.id)
    return {
      p,
      pts: c?.pts ?? 0, reb: c?.reb ?? 0, ast: c?.ast ?? 0, stl: c?.stl ?? 0, blk: c?.blk ?? 0,
      pf: c?.fouls ?? 0, fgm: (c?.twopt_made ?? 0) + (c?.threept_made ?? 0), fga: (c?.twopt_att ?? 0) + (c?.threept_att ?? 0),
    }
  }).sort((a, b) => b.pts - a.pts || b.fga - a.fga)

  const hdrBtn: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${BORDER}`, color: SEC, background: '#fff',
  }
  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: MUTED, textAlign: 'right', padding: '5px 7px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 12.5, color: SEC, textAlign: 'right', padding: '5px 7px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const eventName = (e: LocalEvent) => e.team_side === 'opponent'
    ? (e.jersey_number != null ? `${oppShort} #${e.jersey_number}` : oppShort)
    : (e.player_id ? chipName(e.player_id) : 'Team')

  return (
    <main className="lg:h-[calc(100vh_-_2.75rem)] lg:overflow-hidden" style={{
      // 2.75rem = the 44px global NavBar (sticky, h-11); fit below it (see EntryScreen).
      background: BG, minHeight: 'calc(100vh - 2.75rem)', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased',
      display: 'flex', flexDirection: 'column', padding: '0 10px 10px',
    }}>
      <style>{'@keyframes ciqCardIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}'}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, paddingTop: 10 }}>
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 11, color: MUTED }}>
            <a href={`/games/${gameId}`} style={{ color: MUTED, textDecoration: 'none' }}>Debrief</a>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: TEAL, fontWeight: 700 }}>Watch / Review</span>
          </div>
          {perQuarter && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
              {[1, 2, 3, 4].map(p => (
                <button key={p} onClick={() => { setPeriod(p); setCurOrder(null) }} style={{
                  fontSize: 12, fontWeight: 800, width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${period === p ? TEAL : BORDER}`,
                  color: period === p ? '#fff' : MUTED, background: period === p ? TEAL : '#fff',
                }}>Q{p}</button>
              ))}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
            <button onClick={() => skip(-10)} title="Back 10s" style={hdrBtn}>« 10</button>
            <button onClick={togglePlay} title="Play / pause (Space)" style={hdrBtn}>{playing ? '❚❚ Pause' : '▶ Play'} <span style={{ color: MUTED }}>Space</span></button>
            <button onClick={() => skip(10)} title="Forward 10s" style={hdrBtn}>10 »</button>
            <a href={`/games/${gameId}`} style={{ ...hdrBtn, color: '#fff', background: TEAL, border: 'none', textDecoration: 'none' }}>Done</a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] lg:flex-1 lg:min-h-0" style={{ gap: 10, marginTop: 10 }}>
        {/* Video + scoreboard bug + current-play card */}
        <div className="lg:h-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {/* Mobile: width-driven; desktop: height fills the row (see EntryScreen note). */}
          <div className="w-full lg:h-full lg:w-auto" style={{ position: 'relative', aspectRatio: '16 / 9', maxWidth: '100%', maxHeight: '100%', background: '#000', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {activeVideoId
              ? <div id={`ytw-${gameId}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa4b2', fontSize: 12 }}>No video.</div>}

            {/* Scoreboard bug */}
            <div style={{
              position: 'absolute', top: 10, left: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(15,23,42,0.82)', color: '#fff', borderRadius: 10, padding: '6px 12px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, background: TEAL, borderRadius: 6, padding: '2px 7px' }}>Q{dispPeriod}</span>
              <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                {usScore}<span style={{ color: '#94a3b8', margin: '0 6px', fontWeight: 700 }}>–</span>{themScore}
              </span>
              {curEvent?.clock_sec != null && (
                <span style={{ fontSize: 12, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{fmtVt(curEvent.clock_sec)}</span>
              )}
            </div>

            {/* Current-play card */}
            {showCard && curEvent && (
              <div key={curEvent.event_order} style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
                minWidth: 240, maxWidth: '80%', animation: 'ciqCardIn 220ms ease-out',
                background: 'rgba(255,255,255,0.97)', borderRadius: 12, padding: '10px 16px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)', borderLeft: `4px solid ${curEvent.team_side === 'opponent' ? AMBER : TEAL}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: curEvent.team_side === 'opponent' ? AMBER : '#1a1f2e' }}>{cardName}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: SEC }}>{PRETTY[curEvent.event_type]}</span>
                  {curEvent.points > 0 && <span style={{ fontSize: 14, fontWeight: 900, color: GREEN }}>+{curEvent.points}</span>}
                </div>
                {cardCounts && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 3, fontWeight: 600 }}>
                    {cardCounts.pts} PTS · {cardCounts.reb} REB · {cardCounts.ast} AST
                    {cardCounts.stl > 0 && ` · ${cardCounts.stl} STL`}{cardCounts.blk > 0 && ` · ${cardCounts.blk} BLK`}
                    {' · '}{cardCounts.twopt_made + cardCounts.threept_made}/{cardCounts.twopt_att + cardCounts.threept_att} FG
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: live box score + play-by-play */}
        <div className="lg:min-h-0" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {/* Live box */}
          <div style={{ flexShrink: 0, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '7px 10px', borderBottom: `1px solid ${BORDER}`, fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em' }}>
              LIVE BOX SCORE <span style={{ fontWeight: 500, color: MUTED, textTransform: 'none', letterSpacing: 0 }}>· as of this point</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <th style={{ ...th, textAlign: 'left' }}>PLAYER</th>
                    <th style={th}>PTS</th><th style={th}>REB</th><th style={th}>AST</th>
                    <th style={th}>STL</th><th style={th}>BLK</th><th style={th}>PF</th><th style={th}>FG</th>
                  </tr>
                </thead>
                <tbody>
                  {boxRows.map(r => {
                    const active = curEvent?.player_id === r.p.id
                    return (
                      <tr key={r.p.id} style={{ borderBottom: `1px solid ${BORDER}`, background: active ? '#eaf3f6' : 'transparent' }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: active ? TEAL : '#1a1f2e' }}>#{r.p.jersey_number} {r.p.first_name}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{r.pts}</td>
                        <td style={td}>{r.reb}</td><td style={td}>{r.ast}</td>
                        <td style={td}>{r.stl}</td><td style={td}>{r.blk}</td><td style={td}>{r.pf}</td>
                        <td style={td}>{r.fgm}/{r.fga}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#fbf7ef', fontWeight: 800 }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: AMBER }}>{opponentName}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{box.opponent.pts}</td>
                    <td style={td}>{box.opponent.oreb + box.opponent.dreb}</td>
                    <td style={td}>{box.opponent.ast}</td>
                    <td style={td}>{box.opponent.stl}</td>
                    <td style={td}>{box.opponent.blk}</td>
                    <td style={td}>{box.opponent.off_fouls + box.opponent.def_fouls}</td>
                    <td style={td}>{box.opponent.twopt_made + box.opponent.threept_made}/{box.opponent.twopt_att + box.opponent.threept_att}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Play-by-play — click to jump the video there. Highlights the current play. */}
          <div className="lg:min-h-0 lg:flex-1" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em', marginBottom: 3 }}>
              PLAY-BY-PLAY {perQuarter && <span style={{ color: MUTED }}>· Q{period}</span>} <span style={{ fontWeight: 500, color: MUTED, textTransform: 'none', letterSpacing: 0 }}>· tap to jump</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 40 }}>
              {periodEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: MUTED }}>No plays in this period.</div>
              ) : (
                [...periodEvents].reverse().map(e => {
                  const active = e.event_order === curOrder
                  return (
                    <div key={e.event_order} onClick={() => seekTo(e.video_time)} title="Jump the video to this play"
                      style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: SEC, padding: '3px 4px', borderRadius: 5, cursor: 'pointer', background: active ? '#eaf3f6' : 'transparent' }}
                      onMouseEnter={ev => { if (!active) ev.currentTarget.style.background = '#f1f5f9' }}
                      onMouseLeave={ev => { if (!active) ev.currentTarget.style.background = 'transparent' }}>
                      <span style={{ color: MUTED, width: 36 }}>{fmtVt(e.video_time)}</span>
                      <span style={{ fontWeight: 700, color: e.team_side === 'opponent' ? AMBER : TEAL, minWidth: 84, whiteSpace: 'nowrap' }}>{eventName(e)}</span>
                      <span style={{ whiteSpace: 'nowrap', flex: 1 }}>{PRETTY[e.event_type]}{e.points > 0 && <span style={{ color: GREEN, fontWeight: 700 }}> +{e.points}</span>}</span>
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
