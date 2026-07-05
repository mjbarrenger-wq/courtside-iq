'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadEntryState, saveEntryState, type EntryState, type LocalEvent,
} from '@/lib/entryState'
import type { EventType, TeamSide } from '@/lib/pbpAggregate'
import { parseYouTubeId } from '@/lib/youtube'
import HalfCourt from '../HalfCourt'

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const GREEN  = '#059669'
const RED    = '#dc2626'
const AMBER  = '#d97706'

const PERIOD_SEC = 600
const SEEK_LEAD = 3

export interface EntryPlayer {
  id: string
  jersey_number: number
  first_name: string
  last_name: string
}

type Tone = 'make' | 'miss' | 'reb' | 'play' | 'bad' | 'foul'
interface EventBtn { et: EventType; label: string; pts: number; tone: Tone; sc: string }

// Keyboard: makes 1/2/3 (by point value FT/2/3), misses q/w/e, then mnemonics.
const EVENT_BUTTONS: EventBtn[] = [
  { et: 'made_ft',    label: 'FT ✓',  pts: 1, tone: 'make', sc: '1' },
  { et: 'made_2pt',   label: '2PT ✓', pts: 2, tone: 'make', sc: '2' },
  { et: 'made_3pt',   label: '3PT ✓', pts: 3, tone: 'make', sc: '3' },
  { et: 'missed_ft',  label: 'FT ✗',  pts: 0, tone: 'miss', sc: 'q' },
  { et: 'missed_2pt', label: '2PT ✗', pts: 0, tone: 'miss', sc: 'w' },
  { et: 'missed_3pt', label: '3PT ✗', pts: 0, tone: 'miss', sc: 'e' },
  { et: 'assist',     label: 'Ast',   pts: 0, tone: 'play', sc: 'a' },
  { et: 'steal',      label: 'Stl',   pts: 0, tone: 'play', sc: 's' },
  { et: 'block',      label: 'Blk',   pts: 0, tone: 'play', sc: 'b' },
  { et: 'turnover',   label: 'TO',    pts: 0, tone: 'bad',  sc: 't' },
  { et: 'def_foul',   label: 'D.Foul', pts: 0, tone: 'foul', sc: 'f' },
  { et: 'off_foul',   label: 'O.Foul', pts: 0, tone: 'foul', sc: 'o' },
]
const REB_SC = 'r'
const KEY_TO_BTN: Record<string, EventBtn> = Object.fromEntries(EVENT_BUTTONS.map(b => [b.sc, b]))
const isFG = (et: EventType) =>
  et === 'made_2pt' || et === 'missed_2pt' || et === 'made_3pt' || et === 'missed_3pt'

const TONE_BG: Record<Tone, string> = {
  make: '#e7f6ee', miss: '#fdecec', reb: '#eef2fb', play: '#eef7fa', bad: '#fdf2e6', foul: '#f3eefb',
}
const TONE_FG: Record<Tone, string> = {
  make: '#087f4b', miss: '#c0392b', reb: '#3a5bbf', play: '#2a7fa0', bad: '#b5651d', foul: '#6b4bbf',
}

const fmtVt = (s: number | null) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Running game line for a player, from the event log (for the confirm toast).
function statLine(pid: string, events: LocalEvent[]) {
  let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, pf = 0, fgm = 0, fga = 0
  for (const e of events) {
    if (e.player_id !== pid) continue
    switch (e.event_type) {
      case 'made_2pt': pts += 2; fgm++; fga++; break
      case 'made_3pt': pts += 3; fgm++; fga++; break
      case 'missed_2pt': case 'missed_3pt': fga++; break
      case 'made_ft': pts += 1; break
      case 'oreb': case 'dreb': reb++; break
      case 'assist': ast++; break
      case 'steal': stl++; break
      case 'block': blk++; break
      case 'def_foul': case 'off_foul': pf++; break
    }
  }
  return { pts, reb, ast, stl, blk, pf, fgm, fga }
}

type Actor = { t: 'us'; id: string } | { t: 'us-team' } | { t: 'opp'; jersey: number | null }
type Armed = { kind: 'ev'; btn: EventBtn } | { kind: 'reb' } | null
type Prompt =
  | { kind: 'rebound'; shooterSide: TeamSide }
  | { kind: 'turnover'; toSide: TeamSide }

interface Part {
  event_type: EventType; team_side: TeamSide; points: number; player_id: string | null
  jersey_number?: number | null; shot_x?: number | null; shot_y?: number | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

export default function EntryScreen({
  gameId, players, opponentName, videoUrls, resumeState,
}: {
  gameId: string
  players: EntryPlayer[]
  opponentName: string
  videoUrls: string[]
  resumeState: EntryState | null
}) {
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const oppShort = opponentName.split(' ')[0]

  const [state, setState] = useState<EntryState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [armed, setArmed] = useState<Armed>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [shotPrompt, setShotPrompt] = useState<null | { isMiss: boolean; shooterSide: TeamSide }>(null)
  const [chartMode, setChartMode] = useState(true)
  const [newOppJersey, setNewOppJersey] = useState('')
  const [subOpen, setSubOpen] = useState(false)
  const [subOut, setSubOut] = useState<string | null>(null)
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [toast, setToast] = useState<{ pid: string; n: number } | null>(null)

  const [clockSec, setClockSec] = useState(PERIOD_SEC)
  const [clockArmed, setClockArmed] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [clockUsed, setClockUsed] = useState(false)
  const clockSecRef = useRef(PERIOD_SEC)
  const clockUsedRef = useRef(false)
  useEffect(() => { clockSecRef.current = clockSec }, [clockSec])
  useEffect(() => { clockUsedRef.current = clockUsed }, [clockUsed])

  useEffect(() => {
    const src = loadEntryState(gameId) ?? resumeState
    if (src) {
      if (!loadEntryState(gameId) && resumeState) saveEntryState(resumeState)
      setState(src)
      // Resume the game clock at the last logged event's game time (matches the
      // video position we seek to), instead of resetting to 10:00.
      const last = src.events[src.events.length - 1]
      if (last && last.clock_sec != null) { setClockSec(Math.round(last.clock_sec)); setClockUsed(true) }
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])
  useEffect(() => { if (state) saveEntryState(state) }, [state])

  const events = state?.events ?? []
  const period = state?.period ?? 1
  const opponentJerseys = state?.opponentJerseys ?? []

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
        // disablekb: keep YouTube's own keyboard shortcuts (f = fullscreen, etc.) OFF
        // so our UI shortcuts win. A click-catcher over the video also stops the
        // iframe stealing keyboard focus (see below).
        playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0 },
        events: {
          onReady: () => setYtReady(true),
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
      return typeof t === 'number' && !Number.isNaN(t) ? Math.round(t) : null
    } catch { return null }
  }, [])
  const seekBack = useCallback((sec: number | null) => {
    if (sec == null) return
    try { ytRef.current?.seekTo?.(Math.max(0, sec - SEEK_LEAD), true) } catch { /* noop */ }
  }, [])
  const skip = useCallback((delta: number) => {
    try {
      const t = ytRef.current?.getCurrentTime?.()
      if (typeof t === 'number') ytRef.current?.seekTo?.(Math.max(0, t + delta), true)
    } catch { /* noop */ }
  }, [])

  const didSeekRef = useRef(false)
  useEffect(() => {
    if (!ytReady || didSeekRef.current || !state?.events.length) return
    const last = state.events[state.events.length - 1]
    if (last.video_time != null) seekBack(last.video_time)
    didSeekRef.current = true
  }, [ytReady, state, seekBack])

  // ── Game clock (wall-time accurate; the UI clock is the authority) ─────────
  const clockTicking = clockArmed && (activeVideoId ? videoPlaying : true)
  const anchorRef = useRef({ sec: PERIOD_SEC, at: 0 })
  useEffect(() => {
    if (!clockTicking) return
    anchorRef.current = { sec: clockSecRef.current, at: Date.now() }
    const id = setInterval(() => {
      const { sec, at } = anchorRef.current
      const remaining = Math.max(0, sec - (Date.now() - at) / 1000)
      setClockSec(Math.round(remaining))
      if (remaining <= 0) setClockArmed(false)
    }, 250)
    return () => clearInterval(id)
  }, [clockTicking])

  const togglePause = useCallback(() => {
    const p = ytRef.current
    if (p) {
      let playing = false
      try { playing = p.getPlayerState?.() === 1 } catch { /* noop */ }
      try { playing ? p.pauseVideo() : p.playVideo() } catch { /* noop */ }
    } else setClockArmed(a => !a)
  }, [])

  // Pause the video during any selection, resume when done.
  const interacting = armed != null || prompt != null || shotPrompt != null || subOpen
  const pausedByUsRef = useRef(false)
  useEffect(() => {
    const p = ytRef.current
    if (!p) return
    if (interacting) {
      let playing = false
      try { playing = p.getPlayerState?.() === 1 } catch { /* noop */ }
      if (playing) { try { p.pauseVideo() } catch { /* noop */ }; pausedByUsRef.current = true }
    } else if (pausedByUsRef.current) {
      try { p.playVideo() } catch { /* noop */ }
      pausedByUsRef.current = false
    }
  }, [interacting])

  // Toast auto-fade
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // ── Event logging ─────────────────────────────────────────────────────────
  const append = useCallback((parts: Part[]) => {
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
        const jersey = p.jersey_number != null
          ? p.jersey_number
          : (p.player_id ? playerById.get(p.player_id)?.jersey_number ?? null : null)
        return {
          event_order: order, period: prev.period, event_type: p.event_type,
          team_side: p.team_side, points: p.points, player_id: p.player_id,
          jersey_number: jersey, video_time: vt, clock_sec: cs,
          team_score: team, opp_score: opp, shot_x: p.shot_x ?? null, shot_y: p.shot_y ?? null,
        }
      })
      return { ...prev, events: [...prev.events, ...added], updatedAt: Date.now() }
    })
  }, [playerById, videoTime])

  const showToast = (pid: string | null) => { if (pid) setToast(t => ({ pid, n: (t?.n ?? 0) + 1 })) }
  const actorTriple = (a: Actor) => a.t === 'us'
    ? { team_side: 'team' as TeamSide, player_id: a.id, jersey_number: null }
    : a.t === 'us-team'
    ? { team_side: 'team' as TeamSide, player_id: null, jersey_number: null }
    : { team_side: 'opponent' as TeamSide, player_id: null, jersey_number: a.jersey }

  function assign(a: Actor) {
    if (!armed) return
    const t = actorTriple(a)
    if (a.t === 'us') showToast(a.id)
    if (armed.kind === 'reb') {
      let shooterSide: TeamSide = 'opponent'
      for (let i = events.length - 1; i >= 0; i--) {
        const et = events[i].event_type
        if (et === 'missed_2pt' || et === 'missed_3pt' || et === 'missed_ft') { shooterSide = events[i].team_side; break }
      }
      append([{ event_type: t.team_side === shooterSide ? 'oreb' : 'dreb', ...t, points: 0 }])
    } else {
      const btn = armed.btn
      append([{ event_type: btn.et, ...t, points: btn.pts }])
      if (isFG(btn.et)) {
        const isMiss = btn.et === 'missed_2pt' || btn.et === 'missed_3pt'
        if (chartMode) { setArmed(null); setShotPrompt({ isMiss, shooterSide: t.team_side }); return }
        if (isMiss) { setArmed(null); setPrompt({ kind: 'rebound', shooterSide: t.team_side }); return }
      } else if (btn.et === 'steal') {
        setArmed(null); setPrompt({ kind: 'turnover', toSide: t.team_side === 'team' ? 'opponent' : 'team' }); return
      }
    }
    setArmed(null)
  }

  const tapStat = (btn: EventBtn) => setArmed({ kind: 'ev', btn })
  const tapReb  = () => setArmed({ kind: 'reb' })

  function openSub() { setClockArmed(false); setArmed(null); setSubOut(null); setSubOpen(true) }
  function subPickOff(id: string) { setSubOut(cur => (cur === id ? null : id)) }
  function subPickOn(id: string) {
    if (!subOut) return
    append([
      { event_type: 'sub_out', team_side: 'team', points: 0, player_id: subOut },
      { event_type: 'sub_in',  team_side: 'team', points: 0, player_id: id },
    ])
    setSubOut(null)
  }

  function resolveShot(x: number | null, y: number | null) {
    const sp = shotPrompt
    if (x != null && y != null) {
      setState(prev => {
        if (!prev || !prev.events.length) return prev
        const evs = prev.events.slice()
        evs[evs.length - 1] = { ...evs[evs.length - 1], shot_x: x, shot_y: y }
        return { ...prev, events: evs, updatedAt: Date.now() }
      })
    }
    setShotPrompt(null)
    if (sp?.isMiss) setPrompt({ kind: 'rebound', shooterSide: sp.shooterSide })
  }

  // rebound/turnover option lists (used for both rendering and 1–9 keys)
  const reboundOptions = useMemo(() => {
    if (prompt?.kind !== 'rebound') return [] as { label: string; target: string }[]
    return [
      ...onCourt.map(id => ({ label: chipNameOf(id, playerById), target: id })),
      { label: 'Our team', target: 'TEAM' },
      { label: `${oppShort} (any)`, target: 'OPP' },
      ...opponentJerseys.map(j => ({ label: `${oppShort} #${j}`, target: `OPP#${j}` })),
    ]
  }, [prompt, onCourt, opponentJerseys, playerById, oppShort])
  const turnoverOptions = useMemo(() => {
    if (prompt?.kind !== 'turnover') return [] as { label: string; target: string }[]
    return prompt.toSide === 'team'
      ? [...onCourt.map(id => ({ label: chipNameOf(id, playerById), target: id })), { label: 'Team', target: 'TEAM' }]
      : [{ label: `${oppShort} (any)`, target: 'OPP' }, ...opponentJerseys.map(j => ({ label: `${oppShort} #${j}`, target: `OPP#${j}` }))]
  }, [prompt, onCourt, opponentJerseys, playerById, oppShort])

  function resolveRebound(target: string) {
    const p = prompt as Extract<Prompt, { kind: 'rebound' }>
    if (target !== 'SKIP') {
      if (!target.startsWith('OPP') && target !== 'TEAM') showToast(target)
      if (target === 'TEAM') {
        append([{ event_type: p.shooterSide === 'team' ? 'oreb' : 'dreb', team_side: 'team', points: 0, player_id: null }])
      } else if (target === 'OPP' || target.startsWith('OPP#')) {
        const jersey = target === 'OPP' ? null : parseInt(target.slice(4), 10)
        append([{ event_type: p.shooterSide === 'opponent' ? 'oreb' : 'dreb', team_side: 'opponent', points: 0, player_id: null, jersey_number: jersey }])
      } else {
        append([{ event_type: p.shooterSide === 'team' ? 'oreb' : 'dreb', team_side: 'team', points: 0, player_id: target }])
      }
    }
    setPrompt(null)
  }

  function resolveTurnover(target: string) {
    if (target !== 'SKIP') {
      if (!target.startsWith('OPP') && target !== 'TEAM') showToast(target)
      if (target === 'TEAM') {
        append([{ event_type: 'turnover', team_side: 'team', points: 0, player_id: null }])
      } else if (target === 'OPP' || target.startsWith('OPP#')) {
        const jersey = target === 'OPP' ? null : parseInt(target.slice(4), 10)
        append([{ event_type: 'turnover', team_side: 'opponent', points: 0, player_id: null, jersey_number: jersey }])
      } else {
        append([{ event_type: 'turnover', team_side: 'team', points: 0, player_id: target }])
      }
    }
    setPrompt(null)
  }

  function undo() {
    setState(prev => (prev && prev.events.length
      ? { ...prev, events: prev.events.slice(0, -1), updatedAt: Date.now() }
      : prev))
    setPrompt(null); setShotPrompt(null); setArmed(null)
  }

  function deleteEvent(order: number) {
    setState(prev => {
      if (!prev) return prev
      let team = 0, opp = 0
      const evs = prev.events.filter(e => e.event_order !== order).map((e, i) => {
        if (e.team_side === 'team') team += e.points; else opp += e.points
        return { ...e, event_order: i + 1, team_score: team, opp_score: opp }
      })
      return { ...prev, events: evs, updatedAt: Date.now() }
    })
  }

  function addOppJersey(): number | null {
    const n = parseInt(newOppJersey, 10)
    if (!Number.isFinite(n)) return null
    setState(prev => {
      if (!prev) return prev
      const list = prev.opponentJerseys ?? []
      if (list.includes(n)) return prev
      return { ...prev, opponentJerseys: [...list, n].sort((a, b) => a - b), updatedAt: Date.now() }
    })
    setNewOppJersey('')
    return n
  }

  function setPeriod(p: number) {
    setState(prev => (prev ? { ...prev, period: p, updatedAt: Date.now() } : prev))
    setClockSec(PERIOD_SEC); setClockArmed(false); setReminderDismissed(false)
  }
  function endQuarter() { if (period < 4) setPeriod(period + 1) }
  function toggleClock() { setClockUsed(true); setClockArmed(a => !a) }
  function resetClock() { setClockSec(PERIOD_SEC); setClockArmed(false) }
  // Jump the video to a play AND set the clock to that play's game time (connected).
  function jumpToEvent(e: LocalEvent) {
    seekBack(e.video_time)
    if (e.clock_sec != null) { setClockSec(Math.round(e.clock_sec)); setClockUsed(true); setClockArmed(false) }
  }

  // Popup actor list (for 1–9 keys + digit badges)
  const popupActors: { label: string; actor: Actor }[] = armed ? [
    ...onCourt.map(id => ({ label: chipNameOf(id, playerById), actor: { t: 'us', id } as Actor })),
    { label: 'Our team', actor: { t: 'us-team' } as Actor },
    { label: `${oppShort} Team`, actor: { t: 'opp', jersey: null } as Actor },
    ...opponentJerseys.map(j => ({ label: `#${j}`, actor: { t: 'opp', jersey: j } as Actor })),
  ] : []

  // ── Keyboard (bound once; always uses latest state via ref) ───────────────
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement | null
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
    const k = e.key
    if (k === ' ' || e.code === 'Space') { e.preventDefault(); togglePause(); return }
    if (k === 'Escape') { setArmed(null); setPrompt(null); setShotPrompt(null); return }
    const d = /^[1-9]$/.test(k) ? parseInt(k, 10) : 0
    if (armed) { if (d && d <= popupActors.length) { e.preventDefault(); assign(popupActors[d - 1].actor) } return }
    if (prompt?.kind === 'rebound') { if (d && d <= reboundOptions.length) { e.preventDefault(); resolveRebound(reboundOptions[d - 1].target) } return }
    if (prompt?.kind === 'turnover') { if (d && d <= turnoverOptions.length) { e.preventDefault(); resolveTurnover(turnoverOptions[d - 1].target) } return }
    if (shotPrompt || subOpen) return
    const kl = k.toLowerCase()
    if (kl === REB_SC) { e.preventDefault(); tapReb(); return }
    if (KEY_TO_BTN[k]) { e.preventDefault(); tapStat(KEY_TO_BTN[k]); return }        // digits for makes
    if (KEY_TO_BTN[kl]) { e.preventDefault(); tapStat(KEY_TO_BTN[kl]) }              // letters for the rest
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

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

  const chipName = (id: string) => chipNameOf(id, playerById)
  const armedLabel = armed == null ? null : armed.kind === 'reb' ? 'Rebound' : armed.btn.label
  const eventName = (e: LocalEvent) => e.team_side === 'opponent'
    ? (e.jersey_number != null ? `${oppShort} #${e.jersey_number}` : oppShort)
    : (e.player_id ? chipName(e.player_id) : 'Team')
  const showReminder = !!activeVideoId && videoPlaying && !clockArmed && !reminderDismissed && !interacting
  const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', marginBottom: 5 }
  const hdrBtn: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${BORDER}`, color: SEC, background: '#fff',
  }
  const toastLine = toast ? statLine(toast.pid, events) : null

  return (
    <main className="lg:h-screen lg:overflow-hidden" style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased',
      display: 'flex', flexDirection: 'column', padding: '0 10px 10px',
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0, paddingTop: 10 }}>
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                fontSize: 12, fontWeight: 800, width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${period === p ? TEAL : BORDER}`,
                color: period === p ? '#fff' : MUTED, background: period === p ? TEAL : '#fff',
              }}>Q{p}</button>
            ))}
          </div>
          {period < 4 && (
            <button onClick={endQuarter} style={{ ...hdrBtn, fontWeight: 800, color: TEAL, borderColor: TEAL }}>End Q{period} →</button>
          )}
          <button onClick={openSub} style={{ ...hdrBtn, fontWeight: 800 }}>⇄ Sub</button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
            <button onClick={() => setChartMode(m => !m)} title="Capture shot locations" style={{
              ...hdrBtn, border: `1px solid ${chartMode ? TEAL : BORDER}`, color: chartMode ? TEAL : MUTED,
              background: chartMode ? '#eaf3f6' : '#fff',
            }}>📍 {chartMode ? 'On' : 'Off'}</button>
            <button onClick={() => skip(-10)} title="Back 10s" style={hdrBtn}>« 10</button>
            <button onClick={togglePause} title="Pause / play (Space)" style={hdrBtn}>⏯ <span style={{ color: MUTED }}>Space</span></button>
            <button onClick={() => skip(10)} title="Forward 10s" style={hdrBtn}>10 »</button>
            <button onClick={undo} disabled={events.length === 0} style={{ ...hdrBtn, color: events.length ? RED : '#c7cdd6' }}>↶ Undo</button>
            <a href={`/games/${gameId}/finalize`} style={{ ...hdrBtn, color: '#fff', background: TEAL, border: 'none', textDecoration: 'none' }}>Finalize →</a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:flex-1 lg:min-h-0" style={{ gap: 10, marginTop: 10 }}>
        {/* Video + scoreboard bug + toast */}
        <div className="lg:h-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <div style={{ position: 'relative', height: '100%', aspectRatio: '16 / 9', maxWidth: '100%', background: '#000', borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {activeVideoId
              ? <div id={`yt-${gameId}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa4b2', fontSize: 12 }}>No video attached — you can still score.</div>}
            {/* Click-catcher: play/pause on click, and (crucially) stops the YouTube
                iframe stealing keyboard focus so our shortcuts always fire. */}
            {activeVideoId && (
              <div onClick={togglePause} title="Click to play / pause" style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }} />
            )}
            <div style={{
              position: 'absolute', top: 10, left: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(15,23,42,0.82)', color: '#fff', borderRadius: 10, padding: '6px 10px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, background: TEAL, borderRadius: 6, padding: '2px 7px' }}>Q{period}</span>
              <span title="Game clock" style={{
                fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                color: clockTicking ? '#fff' : '#fbbf24', minWidth: 66, textAlign: 'center', lineHeight: 1,
              }}>{fmtVt(clockSec)}</span>
              <button onClick={toggleClock} title="Start / stop the game clock" style={{
                fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', border: 'none',
                color: '#fff', background: clockArmed ? AMBER : GREEN,
              }}>{clockArmed ? 'Stop' : 'Start'}</button>
              <button onClick={resetClock} title="Reset clock to 10:00" style={{
                fontSize: 11, fontWeight: 700, padding: '4px 7px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.3)', color: '#fff', background: 'transparent',
              }}>⟲</button>
              <span style={{ fontSize: 15, fontWeight: 900, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
                {teamScore}<span style={{ color: '#94a3b8', margin: '0 5px', fontWeight: 700 }}>–</span>{oppScore}
              </span>
            </div>

            {/* Confirm toast — the just-logged player's running line */}
            {toast && toastLine && (
              <div key={toast.n} style={{
                position: 'absolute', top: 54, left: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(48,123,146,0.95)', color: '#fff', borderRadius: 9, padding: '5px 11px',
                fontSize: 12.5, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontWeight: 900 }}>{chipName(toast.pid)}</span>
                <span style={{ opacity: 0.85, fontWeight: 600 }}>
                  {toastLine.pts} PTS · {toastLine.reb} REB · {toastLine.ast} AST
                  {toastLine.stl > 0 && ` · ${toastLine.stl} STL`}{toastLine.blk > 0 && ` · ${toastLine.blk} BLK`}
                  {toastLine.pf > 0 && ` · ${toastLine.pf} PF`} · {toastLine.fgm}/{toastLine.fga} FG
                </span>
              </div>
            )}

            {showReminder && (
              <div style={{
                position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
                display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(217,119,6,0.96)', color: '#fff',
                borderRadius: 999, padding: '7px 8px 7px 14px', fontSize: 12, fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
              }}>
                <span>▶ Tip-off? Start the game clock</span>
                <button onClick={() => { setClockUsed(true); setClockArmed(true) }} style={{
                  fontSize: 12, fontWeight: 800, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', color: AMBER, background: '#fff',
                }}>Start</button>
                <button onClick={() => setReminderDismissed(true)} title="Dismiss" style={{
                  fontSize: 12, fontWeight: 800, padding: '5px 9px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', color: '#fff', background: 'transparent',
                }}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="lg:min-h-0" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ flexShrink: 0, borderRadius: 9, padding: '7px 10px', fontSize: 12, fontWeight: 700, textAlign: 'center', border: `1px solid ${BORDER}`, color: MUTED, background: '#fff' }}>
            Tap or press a key for the stat, then pick the player
          </div>

          {/* Stat buttons with shortcut badges */}
          <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {EVENT_BUTTONS.map(b => (
              <button key={b.et} onClick={() => tapStat(b)} style={{
                position: 'relative', padding: '9px 3px', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                border: '2px solid transparent', background: TONE_BG[b.tone], color: TONE_FG[b.tone],
              }}>{b.label}<KeyBadge sc={b.sc} /></button>
            ))}
            <button onClick={tapReb} style={{
              position: 'relative', gridColumn: '1 / -1', padding: '9px 3px', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: '2px solid transparent', background: TONE_BG.reb, color: TONE_FG.reb,
            }}>Rebound <span style={{ fontWeight: 600, opacity: 0.7 }}>(off/def auto)</span><KeyBadge sc={REB_SC} /></button>
          </div>

          {/* On-court reference */}
          <div style={{ flexShrink: 0, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ ...sectionLabel, color: TEAL, marginBottom: 0 }}>ON COURT</span>
              <button onClick={openSub} style={{ fontSize: 10, fontWeight: 700, color: TEAL, background: 'transparent', border: 'none', cursor: 'pointer' }}>⇄ Subs</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {onCourt.map((id, i) => (
                <span key={id} style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, border: `1px solid ${BORDER}`, color: SEC, background: '#f8fafc' }}>
                  <span style={{ color: MUTED, fontWeight: 800 }}>{i + 1} </span>{chipName(id)}
                </span>
              ))}
              {onCourt.length !== 5 && <span style={{ fontSize: 10, color: RED, alignSelf: 'center' }}>{onCourt.length}/5 — use ⇄ Subs</span>}
            </div>
          </div>

          {/* Play-by-play */}
          <div className="lg:min-h-0 lg:flex-1" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 100 }}>
            <div style={{ ...sectionLabel, color: TEAL, marginBottom: 3 }}>PLAY-BY-PLAY · {events.length} <span style={{ fontWeight: 500, color: MUTED, textTransform: 'none', letterSpacing: 0 }}>· tap to jump, ✕ to delete</span></div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 40 }}>
              {events.length === 0 ? (
                <div style={{ fontSize: 12, color: MUTED }}>Nothing logged yet.</div>
              ) : (
                [...events].reverse().map(e => (
                  <div key={e.event_order} onClick={() => jumpToEvent(e)} title="Jump the video + clock to this play"
                    style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: SEC, padding: '3px 2px 3px 4px', borderRadius: 5, cursor: 'pointer' }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
                    <span style={{ color: MUTED, width: 18 }}>Q{e.period}</span>
                    <span style={{ color: MUTED, width: 36 }}>{fmtVt(e.video_time)}</span>
                    <span style={{ fontWeight: 700, color: e.team_side === 'opponent' ? AMBER : TEAL, minWidth: 78, whiteSpace: 'nowrap' }}>{eventName(e)}</span>
                    <span style={{ whiteSpace: 'nowrap', flex: 1 }}>{prettyEvent(e.event_type)}{e.points > 0 && <span style={{ color: GREEN, fontWeight: 700 }}> +{e.points}</span>}{e.shot_x != null && <span style={{ color: MUTED }}> 📍</span>}</span>
                    <button onClick={ev => { ev.stopPropagation(); deleteEvent(e.event_order) }} title="Delete this line"
                      style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 3px' }}
                      onMouseEnter={ev => { ev.currentTarget.style.color = RED }}
                      onMouseLeave={ev => { ev.currentTarget.style.color = '#cbd5e1' }}>✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Player-assignment popup (right-docked; video stays visible) */}
      {armed && (
        <RightDock onClose={() => setArmed(null)}>
          <div style={{ fontSize: 15, fontWeight: 800, color: SEC, marginBottom: 2 }}>{armedLabel} — who?</div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Press 1–9 or tap. Video paused.</div>
          <div style={{ ...sectionLabel, color: TEAL }}>OUR TEAM</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
            {popupActors.slice(0, onCourt.length + 1).map((o, i) => (
              <button key={i} onClick={() => assign(o.actor)} style={promptBtn(i < onCourt.length ? TEAL : SEC)}><KeyNum n={i + 1} />{o.label}</button>
            ))}
          </div>
          <div style={{ ...sectionLabel, color: AMBER }}>{opponentName.toUpperCase()}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
            {popupActors.slice(onCourt.length + 1).map((o, i) => {
              const gi = onCourt.length + 1 + i
              return <button key={i} onClick={() => assign(o.actor)} style={promptBtn(AMBER)}>{gi < 9 && <KeyNum n={gi + 1} />}{o.label}</button>
            })}
            <input inputMode="numeric" placeholder="+#" value={newOppJersey}
              onChange={e => setNewOppJersey(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = addOppJersey(); if (n != null) assign({ t: 'opp', jersey: n }) } }}
              style={{ width: 54, fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 9px', fontFamily: 'inherit', color: SEC }} />
            {newOppJersey && (
              <button onClick={() => { const n = addOppJersey(); if (n != null) assign({ t: 'opp', jersey: n }) }} style={promptBtn(AMBER)}>Add #{newOppJersey}</button>
            )}
          </div>
        </RightDock>
      )}

      {/* Substitution modal (right-docked) */}
      {subOpen && (
        <RightDock onClose={() => { setSubOpen(false); setSubOut(null) }} width={440}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: SEC }}>Substitutions</div>
            <div style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>⏸ video &amp; clock stopped</div>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            {subOut ? <>Tap who comes <strong style={{ color: GREEN }}>ON</strong> for {chipName(subOut)}.</> : 'Tap who comes OFF, then who comes ON.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ ...sectionLabel, color: RED }}>ON COURT → OFF</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {onCourt.map(id => (
                  <button key={id} onClick={() => subPickOff(id)} style={{
                    padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${subOut === id ? RED : BORDER}`, color: subOut === id ? '#fff' : SEC, background: subOut === id ? RED : '#fff',
                  }}>{chipName(id)}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ ...sectionLabel, color: GREEN }}>BENCH → ON</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bench.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No bench players.</div>}
                {bench.map(id => (
                  <button key={id} onClick={() => subPickOn(id)} disabled={!subOut} style={{
                    padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: subOut ? 'pointer' : 'default', textAlign: 'left',
                    border: `2px solid ${BORDER}`, color: subOut ? GREEN : MUTED, background: '#fff', opacity: subOut ? 1 : 0.55,
                  }}>{chipName(id)}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => { setSubOpen(false); setSubOut(null) }} style={promptBtn(TEAL)}>Done</button>
          </div>
        </RightDock>
      )}

      {/* Shot-location picker (right-docked) */}
      {shotPrompt && (
        <RightDock onClose={() => resolveShot(null, null)}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SEC, marginBottom: 2 }}>Where was the shot?</div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Tap the spot, or skip.</div>
          <HalfCourt onPick={(x, y) => resolveShot(x, y)} maxHeight={360} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={() => resolveShot(null, null)} style={promptBtn(MUTED, true)}>Skip location</button>
          </div>
        </RightDock>
      )}

      {/* Rebound / turnover prompt (right-docked) */}
      {prompt && (
        <RightDock onClose={() => setPrompt(null)}>
          <div style={{ fontSize: 15, fontWeight: 800, color: SEC, marginBottom: 4 }}>
            {prompt.kind === 'rebound' ? 'Who rebounded?' : 'Turnover on…'}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            {prompt.kind === 'rebound' ? 'Offence/defence auto. Press 1–9 or tap.' : 'Press 1–9 or tap.'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {prompt.kind === 'rebound' ? (
              <>
                {reboundOptions.map((o, i) => (
                  <button key={o.target} onClick={() => resolveRebound(o.target)} style={promptBtn(o.target === 'TEAM' ? SEC : o.target.startsWith('OPP') ? AMBER : TEAL)}>{i < 9 && <KeyNum n={i + 1} />}{o.label}</button>
                ))}
                <button onClick={() => resolveRebound('SKIP')} style={promptBtn(MUTED, true)}>Skip</button>
              </>
            ) : (
              <>
                {turnoverOptions.map((o, i) => (
                  <button key={o.target} onClick={() => resolveTurnover(o.target)} style={promptBtn(o.target === 'TEAM' ? SEC : o.target.startsWith('OPP') ? AMBER : TEAL)}>{i < 9 && <KeyNum n={i + 1} />}{o.label}</button>
                ))}
                <button onClick={() => resolveTurnover('SKIP')} style={promptBtn(MUTED, true)}>Skip</button>
              </>
            )}
          </div>
        </RightDock>
      )}
    </main>
  )
}

// Right-docked popup panel — leaves the (paused) video visible on the left.
function RightDock({ children, onClose, width = 380 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.22)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="w-full" style={{
        maxWidth: width, height: '100%', overflowY: 'auto', background: CARD,
        boxShadow: '-14px 0 44px rgba(0,0,0,0.22)', padding: 18,
      }}>{children}</div>
    </div>
  )
}

function KeyBadge({ sc }: { sc: string }) {
  return <span style={{ position: 'absolute', top: 2, right: 5, fontSize: 8.5, fontWeight: 800, opacity: 0.5 }}>{sc.toUpperCase()}</span>
}
function KeyNum({ n }: { n: number }) {
  return <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 900, opacity: 0.7, marginRight: 5 }}>{n}</span>
}
function chipNameOf(id: string, byId: Map<string, EntryPlayer>) {
  const p = byId.get(id)
  return p ? `#${p.jersey_number} ${p.first_name}` : id.slice(-4)
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
