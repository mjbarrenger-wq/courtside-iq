'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadEntryState, saveEntryState, type EntryState, type LocalEvent,
} from '@/lib/entryState'
import type { EventType, TeamSide } from '@/lib/pbpAggregate'
import { parseYouTubeId } from '@/lib/youtube'

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const GREEN  = '#059669'
const RED    = '#dc2626'
const AMBER  = '#d97706'

const PERIOD_SEC = 600 // 10:00 quarters

export interface EntryPlayer {
  id: string
  jersey_number: number
  first_name: string
  last_name: string
}

interface EventBtn { et: EventType; label: string; pts: number; tone: 'make' | 'miss' | 'reb' | 'play' | 'bad' | 'foul' }

const EVENT_BUTTONS: EventBtn[] = [
  { et: 'made_2pt',   label: '2PT ✓', pts: 2, tone: 'make' },
  { et: 'missed_2pt', label: '2PT ✗', pts: 0, tone: 'miss' },
  { et: 'made_3pt',   label: '3PT ✓', pts: 3, tone: 'make' },
  { et: 'missed_3pt', label: '3PT ✗', pts: 0, tone: 'miss' },
  { et: 'made_ft',    label: 'FT ✓',  pts: 1, tone: 'make' },
  { et: 'missed_ft',  label: 'FT ✗',  pts: 0, tone: 'miss' },
  { et: 'oreb',       label: 'OReb',  pts: 0, tone: 'reb' },
  { et: 'dreb',       label: 'DReb',  pts: 0, tone: 'reb' },
  { et: 'assist',     label: 'Ast',   pts: 0, tone: 'play' },
  { et: 'steal',      label: 'Stl',   pts: 0, tone: 'play' },
  { et: 'block',      label: 'Blk',   pts: 0, tone: 'play' },
  { et: 'turnover',   label: 'TO',    pts: 0, tone: 'bad' },
  { et: 'def_foul',   label: 'Def Foul', pts: 0, tone: 'foul' },
  { et: 'off_foul',   label: 'Off Foul', pts: 0, tone: 'foul' },
]

const TONE_BG: Record<EventBtn['tone'], string> = {
  make: '#e7f6ee', miss: '#fdecec', reb: '#eef2fb', play: '#eef7fa', bad: '#fdf2e6', foul: '#f3eefb',
}
const TONE_FG: Record<EventBtn['tone'], string> = {
  make: '#087f4b', miss: '#c0392b', reb: '#3a5bbf', play: '#2a7fa0', bad: '#b5651d', foul: '#6b4bbf',
}

const fmtVt = (s: number | null) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// A follow-up modal after a shot miss (assign the rebound) or a steal (assign the
// turnover to the team that lost the ball).
type Prompt =
  | { kind: 'rebound'; shooterSide: TeamSide }
  | { kind: 'turnover'; toSide: TeamSide }

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

export default function EntryScreen({
  gameId, players, opponentName, videoUrls, resumeState,
}: {
  gameId: string
  players: EntryPlayer[]
  opponentName: string
  videoUrls: string[]
  // Event log rebuilt from the database for an already-finalized game, so it can
  // be reopened and edited. Used only when there's no in-progress local state.
  resumeState: EntryState | null
}) {
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  const [state, setState] = useState<EntryState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<string | 'OPP' | null>(null)
  const [subIn, setSubIn] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)

  // ── Game clock ────────────────────────────────────────────────────────────
  // The coach "arms" the clock (Start/Stop); it actually ticks only while the
  // video is playing. So pausing the video always pauses the clock, and the only
  // way the clock stops while the video keeps rolling is the coach hitting Stop —
  // the stopped-clock-live-ball case (free throws, timeouts).
  const [clockSec, setClockSec] = useState(PERIOD_SEC)
  const [clockArmed, setClockArmed] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [clockUsed, setClockUsed] = useState(false)
  const clockSecRef = useRef(PERIOD_SEC)
  const clockUsedRef = useRef(false)
  useEffect(() => { clockSecRef.current = clockSec }, [clockSec])
  useEffect(() => { clockUsedRef.current = clockUsed }, [clockUsed])

  useEffect(() => {
    // Prefer in-progress local state; otherwise resume from the DB (finalized game).
    const ls = loadEntryState(gameId)
    if (ls) setState(ls)
    else if (resumeState) { setState(resumeState); saveEntryState(resumeState) }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])
  useEffect(() => { if (state) saveEntryState(state) }, [state])

  const events = state?.events ?? []
  const period = state?.period ?? 1

  const onCourt = useMemo(() => {
    if (!state) return [] as string[]
    const set = [...state.starters]
    for (const e of state.events) {
      if (e.event_type === 'sub_in' && e.player_id && !set.includes(e.player_id)) set.push(e.player_id)
      else if (e.event_type === 'sub_out' && e.player_id) {
        const i = set.indexOf(e.player_id)
        if (i >= 0) set.splice(i, 1)
      }
    }
    return set
  }, [state])

  const bench = useMemo(
    () => (state ? state.dressed.filter(id => !onCourt.includes(id)) : []),
    [state, onCourt],
  )

  const teamScore = events.length ? events[events.length - 1].team_score : 0
  const oppScore  = events.length ? events[events.length - 1].opp_score : 0

  // ── YouTube IFrame player ─────────────────────────────────────────────────
  const ytRef = useRef<any>(null)
  const [ytReady, setYtReady] = useState(false)
  const videoIds = useMemo(() => videoUrls.map(u => parseYouTubeId(u)).filter(Boolean) as string[], [videoUrls])
  const perQuarter = videoIds.length === 4
  const activeVideoId = perQuarter ? videoIds[Math.min(period, 4) - 1] : videoIds[0]

  useEffect(() => {
    if (!activeVideoId) return
    let cancelled = false
    const build = () => {
      if (cancelled || !window.YT?.Player) return
      ytRef.current = new window.YT.Player(`yt-${gameId}`, {
        videoId: activeVideoId,
        playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => setYtReady(true),
          // Track play state so the game clock can follow the video (YT state 1 = playing).
          onStateChange: (e: { data: number }) => setVideoPlaying(e?.data === 1),
        },
      })
    }
    if (window.YT?.Player) build()
    else {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); build() }
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script')
        s.id = 'yt-iframe-api'
        s.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(s)
      }
    }
    return () => {
      cancelled = true
      try { ytRef.current?.destroy?.() } catch { /* noop */ }
      ytRef.current = null
      setYtReady(false)
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
      return typeof t === 'number' && !Number.isNaN(t) ? Math.round(t) : null
    } catch { return null }
  }, [])

  // The clock ticks only when armed AND (there's no video, or the video is playing).
  const clockTicking = clockArmed && (activeVideoId ? videoPlaying : true)
  useEffect(() => {
    if (!clockTicking) return
    const id = setInterval(() => setClockSec(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [clockTicking])
  useEffect(() => { if (clockSec <= 0 && clockArmed) setClockArmed(false) }, [clockSec, clockArmed])

  // ── Pause: video + game clock together (button and spacebar) ──────────────
  const togglePause = useCallback(() => {
    const p = ytRef.current
    if (p) {
      // Pause/play the video; the clock follows via videoPlaying (onStateChange).
      let playing = false
      try { playing = p.getPlayerState?.() === 1 } catch { /* noop */ }
      try { playing ? p.pauseVideo() : p.playVideo() } catch { /* noop */ }
    } else {
      // No video attached — Space toggles the clock itself.
      setClockArmed(a => !a)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault() // stop page scroll + re-triggering a focused button
      togglePause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause])

  // ── Event logging ─────────────────────────────────────────────────────────
  const append = useCallback((
    parts: Array<{ event_type: EventType; team_side: TeamSide; points: number; player_id: string | null }>,
  ) => {
    setState(prev => {
      if (!prev) return prev
      const vt = videoTime()
      const cs = clockUsedRef.current ? Math.round(clockSecRef.current) : null
      let order = prev.events.length
      let team = prev.events.length ? prev.events[prev.events.length - 1].team_score : 0
      let opp  = prev.events.length ? prev.events[prev.events.length - 1].opp_score : 0
      const added: LocalEvent[] = parts.map(p => {
        order += 1
        if (p.team_side === 'team') team += p.points; else opp += p.points
        const jersey = p.player_id ? playerById.get(p.player_id)?.jersey_number ?? null : null
        return {
          event_order: order, period: prev.period, event_type: p.event_type,
          team_side: p.team_side, points: p.points, player_id: p.player_id,
          jersey_number: jersey, video_time: vt, clock_sec: cs,
          team_score: team, opp_score: opp,
        }
      })
      return { ...prev, events: [...prev.events, ...added], updatedAt: Date.now() }
    })
  }, [playerById, videoTime])

  function onEvent(btn: EventBtn) {
    if (selected == null) return
    const side: TeamSide = selected === 'OPP' ? 'opponent' : 'team'
    const pid = selected === 'OPP' ? null : selected
    append([{ event_type: btn.et, team_side: side, points: btn.pts, player_id: pid }])

    // Follow-up prompts. A missed field goal must be rebounded by someone; a steal
    // means the other team turned it over.
    if (btn.et === 'missed_2pt' || btn.et === 'missed_3pt') {
      setPrompt({ kind: 'rebound', shooterSide: side })
    } else if (btn.et === 'steal') {
      setPrompt({ kind: 'turnover', toSide: side === 'team' ? 'opponent' : 'team' })
    }
    setSelected(null) // reselect a player for every stat (avoids mis-allocation)
    setSubIn(null)
  }

  // Rebound target: an on-court player id, 'OPP' (their bucket), 'TEAM' (our team
  // rebound, no individual) or 'SKIP'. OReb vs DReb is decided by who shot.
  function resolveRebound(target: string) {
    const p = prompt as Extract<Prompt, { kind: 'rebound' }>
    if (target !== 'SKIP') {
      if (target === 'OPP') {
        append([{ event_type: p.shooterSide === 'opponent' ? 'oreb' : 'dreb', team_side: 'opponent', points: 0, player_id: null }])
      } else if (target === 'TEAM') {
        append([{ event_type: p.shooterSide === 'team' ? 'oreb' : 'dreb', team_side: 'team', points: 0, player_id: null }])
      } else {
        append([{ event_type: p.shooterSide === 'team' ? 'oreb' : 'dreb', team_side: 'team', points: 0, player_id: target }])
      }
    }
    setPrompt(null)
  }

  // Turnover target for a steal: 'OPP', an on-court player id, 'TEAM' or 'SKIP'.
  function resolveTurnover(target: string) {
    const p = prompt as Extract<Prompt, { kind: 'turnover' }>
    if (target !== 'SKIP') {
      if (p.toSide === 'opponent') {
        append([{ event_type: 'turnover', team_side: 'opponent', points: 0, player_id: null }])
      } else {
        append([{ event_type: 'turnover', team_side: 'team', points: 0, player_id: target === 'TEAM' ? null : target }])
      }
    }
    setPrompt(null)
  }

  function undo() {
    setState(prev => (prev && prev.events.length
      ? { ...prev, events: prev.events.slice(0, -1), updatedAt: Date.now() }
      : prev))
    setSubIn(null)
    setPrompt(null)
  }

  function tapOnCourt(id: string) {
    if (subIn) {
      append([
        { event_type: 'sub_out', team_side: 'team', points: 0, player_id: id },
        { event_type: 'sub_in',  team_side: 'team', points: 0, player_id: subIn },
      ])
      setSubIn(null)
      setSelected(null)
      return
    }
    setSelected(sel => (sel === id ? null : id))
  }

  function tapBench(id: string) {
    setSubIn(cur => (cur === id ? null : id))
    setSelected(null)
  }

  function setPeriod(p: number) {
    setState(prev => (prev ? { ...prev, period: p, updatedAt: Date.now() } : prev))
    // A new quarter resets the game clock to 10:00, disarmed.
    setClockSec(PERIOD_SEC)
    setClockArmed(false)
  }

  function toggleClock() {
    setClockUsed(true)
    setClockArmed(a => !a)
  }
  function resetClock() { setClockSec(PERIOD_SEC); setClockArmed(false) }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!loaded) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: MUTED, fontFamily: "'Inter', system-ui, sans-serif" }}>Loading…</div>
  }

  if (!state) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: "'Inter', system-ui, sans-serif", background: BG }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No roster set for this game yet</div>
          <a href={`/games/${gameId}/roster`} style={{ color: TEAL, fontSize: 13, fontWeight: 700 }}>Pick the dressed roster & starters →</a>
        </div>
      </main>
    )
  }

  const chipName = (id: string) => {
    const p = playerById.get(id)
    return p ? `#${p.jersey_number} ${p.first_name}` : id.slice(-4)
  }
  const eventsDisabled = selected == null

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased',
      padding: '0 12px 40px', width: '100%',
    }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: BG, paddingTop: 12 }}>
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                fontSize: 12, fontWeight: 800, width: 34, height: 32, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${period === p ? TEAL : BORDER}`,
                color: period === p ? '#fff' : MUTED, background: period === p ? TEAL : '#fff',
              }}>Q{p}</button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.05em' }}>US</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: SEC }}>{teamScore}</span>
            <span style={{ fontSize: 14, color: MUTED }}>–</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: SEC }}>{oppScore}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: MUTED, letterSpacing: '0.05em' }}>{opponentName.toUpperCase()}</span>
          </div>

          {/* Game clock — ticks only while the video plays; Stop holds it for FTs/timeouts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', background: '#f0f2f7', borderRadius: 8 }}>
            <span title="Game clock — runs with the video; Stop holds it for free throws / timeouts" style={{
              fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
              color: clockTicking ? SEC : MUTED, minWidth: 52, textAlign: 'center',
            }}>{fmtVt(clockSec)}</span>
            <button onClick={toggleClock} title="Arm / stop the game clock" style={{
              fontSize: 11, fontWeight: 800, padding: '5px 9px', borderRadius: 6, cursor: 'pointer', border: 'none',
              color: '#fff', background: clockArmed ? AMBER : GREEN,
            }}>{clockArmed ? 'Stop' : 'Start'}</button>
            <button onClick={resetClock} title="Reset clock to 10:00" style={{
              fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${BORDER}`, color: MUTED, background: '#fff',
            }}>⟲</button>
            {clockArmed && !!activeVideoId && !videoPlaying && (
              <span style={{ fontSize: 9, color: MUTED, fontWeight: 600, maxWidth: 64, lineHeight: 1.1 }}>waiting for video</span>
            )}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={togglePause} title="Pause / play video + clock (Spacebar)" style={{
              fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${BORDER}`, color: SEC, background: '#fff',
            }}>⏯ Pause <span style={{ color: MUTED, fontWeight: 600 }}>(Space)</span></button>
            <button onClick={undo} disabled={events.length === 0} style={{
              fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: events.length ? 'pointer' : 'default',
              border: `1px solid ${BORDER}`, color: events.length ? RED : '#c7cdd6', background: '#fff',
            }}>↶ Undo</button>
            <a href={`/games/${gameId}/finalize`} style={{
              fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 7, textDecoration: 'none',
              color: '#fff', background: TEAL,
            }}>Finalize →</a>
          </div>
        </div>
      </div>

      {/* Fluid two-column: big video on the left, controls on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]" style={{ gap: 12, marginTop: 12 }}>
        {/* Video */}
        <div>
          <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, width: '100%', maxWidth: 'calc(74vh * 16 / 9)', margin: '0 auto' }}>
            {activeVideoId ? (
              <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                <div id={`yt-${gameId}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              </div>
            ) : (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9aa4b2', fontSize: 12 }}>
                No video attached — you can still score. Event times won&rsquo;t be stamped.
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* On-court + bench */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em' }}>ON COURT</span>
              {subIn && <span style={{ fontSize: 11, color: AMBER, fontWeight: 700 }}>Tap who {chipName(subIn)} replaces →</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {onCourt.map(id => {
                const isSel = selected === id
                return (
                  <button key={id} onClick={() => tapOnCourt(id)} style={{
                    padding: '11px 8px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800,
                    border: `2px solid ${isSel ? TEAL : (subIn ? AMBER : BORDER)}`,
                    color: isSel ? '#fff' : SEC, background: isSel ? TEAL : '#fff',
                  }}>{chipName(id)}</button>
                )
              })}
              {onCourt.length !== 5 && (
                <span style={{ fontSize: 11, color: RED, alignSelf: 'center' }}>
                  {onCourt.length}/5 on court — fix subs before finalizing.
                </span>
              )}
            </div>

            {bench.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, letterSpacing: '0.06em', margin: '12px 0 8px' }}>BENCH — tap to sub in</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {bench.map(id => {
                    const arming = subIn === id
                    return (
                      <button key={id} onClick={() => tapBench(id)} style={{
                        padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        border: `2px solid ${arming ? AMBER : BORDER}`,
                        color: arming ? '#fff' : MUTED, background: arming ? AMBER : '#f8f9fb',
                      }}>{chipName(id)}</button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Actor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: MUTED }}>
              Logging for:{' '}
              <strong style={{ color: selected == null ? RED : (selected === 'OPP' ? AMBER : TEAL) }}>
                {selected == null ? 'pick a player or Opponent' : (selected === 'OPP' ? opponentName : chipName(selected))}
              </strong>
            </div>
            <button onClick={() => { setSelected(sel => (sel === 'OPP' ? null : 'OPP')); setSubIn(null) }} style={{
              marginLeft: 'auto', fontSize: 12, fontWeight: 800, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: `2px solid ${selected === 'OPP' ? AMBER : BORDER}`,
              color: selected === 'OPP' ? '#fff' : MUTED, background: selected === 'OPP' ? AMBER : '#fff',
            }}>{opponentName}</button>
          </div>

          {/* Event buttons */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, opacity: eventsDisabled ? 0.55 : 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 }}>
              {EVENT_BUTTONS.map(b => (
                <button key={b.et} onClick={() => onEvent(b)} disabled={eventsDisabled} style={{
                  padding: '13px 6px', borderRadius: 9, fontSize: 13, fontWeight: 800,
                  cursor: eventsDisabled ? 'not-allowed' : 'pointer', border: 'none',
                  background: TONE_BG[b.tone], color: TONE_FG[b.tone],
                }}>{b.label}</button>
              ))}
            </div>
            {eventsDisabled && (
              <div style={{ fontSize: 11, color: MUTED, marginTop: 10, textAlign: 'center' }}>
                Tap an on-court player (or {opponentName}) first, then tap the event.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent events */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, marginTop: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em', marginBottom: 8 }}>
          LAST EVENTS · {events.length} total
        </div>
        {events.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTED }}>Nothing logged yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {events.slice(-10).reverse().map(e => (
              <div key={e.event_order} style={{ fontSize: 12, color: SEC, display: 'flex', gap: 8 }}>
                <span style={{ color: MUTED, width: 28 }}>Q{e.period}</span>
                <span style={{ color: MUTED, width: 42 }}>{fmtVt(e.video_time)}</span>
                <span style={{ fontWeight: 700, color: e.team_side === 'opponent' ? AMBER : TEAL, minWidth: 92 }}>
                  {e.team_side === 'opponent' ? opponentName.split(' ')[0] : (e.player_id ? chipName(e.player_id) : 'Team')}
                </span>
                <span>{prettyEvent(e.event_type)}</span>
                {e.points > 0 && <span style={{ color: GREEN, fontWeight: 700 }}>+{e.points}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Follow-up prompt overlay */}
      {prompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.55)',
          display: 'grid', placeItems: 'center', padding: 16,
        }}>
          <div style={{ background: CARD, borderRadius: 14, padding: 20, width: '100%', maxWidth: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: SEC, marginBottom: 4 }}>
              {prompt.kind === 'rebound' ? 'Who rebounded?' : 'Turnover on…'}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
              {prompt.kind === 'rebound'
                ? (prompt.shooterSide === 'team' ? 'We missed — offensive or defensive rebound.' : `${opponentName} missed — offensive or defensive rebound.`)
                : (prompt.toSide === 'opponent' ? `Assign the turnover to ${opponentName}.` : 'Which of our players lost the ball?')}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {prompt.kind === 'rebound' ? (
                <>
                  {onCourt.map(id => (
                    <button key={id} onClick={() => resolveRebound(id)} style={promptBtn(TEAL)}>{chipName(id)}</button>
                  ))}
                  <button onClick={() => resolveRebound('TEAM')} style={promptBtn(SEC)}>Team rebound</button>
                  <button onClick={() => resolveRebound('OPP')} style={promptBtn(AMBER)}>{opponentName}</button>
                  <button onClick={() => resolveRebound('SKIP')} style={promptBtn(MUTED, true)}>Skip</button>
                </>
              ) : (
                <>
                  {prompt.toSide === 'team' ? (
                    <>
                      {onCourt.map(id => (
                        <button key={id} onClick={() => resolveTurnover(id)} style={promptBtn(TEAL)}>{chipName(id)}</button>
                      ))}
                      <button onClick={() => resolveTurnover('TEAM')} style={promptBtn(SEC)}>Team</button>
                    </>
                  ) : (
                    <button onClick={() => resolveTurnover('OPP')} style={promptBtn(AMBER)}>{opponentName} turnover</button>
                  )}
                  <button onClick={() => resolveTurnover('SKIP')} style={promptBtn(MUTED, true)}>Skip</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function promptBtn(color: string, ghost = false): React.CSSProperties {
  return {
    fontSize: 13, fontWeight: 800, padding: '10px 14px', borderRadius: 9, cursor: 'pointer',
    border: `2px solid ${ghost ? BORDER : color}`,
    color: ghost ? MUTED : '#fff', background: ghost ? '#fff' : color,
  }
}

function prettyEvent(et: EventType): string {
  const map: Record<EventType, string> = {
    made_2pt: 'made 2', missed_2pt: 'missed 2', made_3pt: 'made 3', missed_3pt: 'missed 3',
    made_ft: 'made FT', missed_ft: 'missed FT', oreb: 'off. rebound', dreb: 'def. rebound',
    assist: 'assist', steal: 'steal', block: 'block', turnover: 'turnover',
    def_foul: 'def. foul', off_foul: 'off. foul', foul: 'foul', sub_in: 'sub in', sub_out: 'sub out',
  }
  return map[et] ?? et
}
