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
  // Substitution modal — shared by our team and the opponent. subTeam selects which
  // side is subbing; subOut holds the player_id (us) or jersey-as-string (opp) going
  // off; subNewOpp is the "bring on a new #" input in the opponent modal.
  const [subTeam, setSubTeam] = useState<'us' | 'opp' | null>(null)
  const [subOut, setSubOut] = useState<string | null>(null)
  const [subNewOpp, setSubNewOpp] = useState('')
  const [toast, setToast] = useState<{ pid: string; n: number } | null>(null)

  const [clockSec, setClockSec] = useState(PERIOD_SEC)
  // clockArmed = "the clock is following the video". Default ON — for a running-clock
  // league the clock tracks the video from the start; the coach hits Stop only to
  // freeze it during a stop-clock window (e.g. last minute of Q2 / last 3 of Q4).
  const [clockArmed, setClockArmed] = useState(true)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [clockUsed, setClockUsed] = useState(true)
  // Manual clock anchors: each pins a video position → a game-clock value for a
  // period. The tip-off "Start clock" adds one at 10:00; a re-align (when our clock
  // has drifted from the real scoreboard, e.g. dead-ball stoppages) adds one at the
  // value the coach reads off the stadium clock. clockForVideoTime picks the nearest
  // anchor at/before the video position, so a later re-align corrects everything after
  // it. Plays anchor too, so this mainly matters before/around clock corrections.
  const [manualAnchors, setManualAnchors] = useState<{ period: number; videoTime: number; clockSec: number }[]>([])
  const [adjusting, setAdjusting] = useState(false)
  const [adjustVal, setAdjustVal] = useState('')
  const clockSecRef = useRef(PERIOD_SEC)
  const clockUsedRef = useRef(false)
  const clockSetRef = useRef(false) // whether the clock has been anchored (see clockSet)
  const clockArmedRef = useRef(true)
  const syncRef = useRef<() => void>(() => {}) // always the latest clock+score sync (set below)
  useEffect(() => { clockSecRef.current = clockSec }, [clockSec])
  useEffect(() => { clockUsedRef.current = clockUsed }, [clockUsed])
  useEffect(() => { clockArmedRef.current = clockArmed }, [clockArmed])

  useEffect(() => {
    const src = loadEntryState(gameId) ?? resumeState
    if (src) {
      if (!loadEntryState(gameId) && resumeState) saveEntryState(resumeState)
      setState(src)
      // Don't set the clock here — it's now derived from the video position (see
      // clockForVideoTime); the sync loop sets it once the player is ready and seeked,
      // so the clock and video can't open out of sync.
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

  // Opponent on-court five — the mirror of `onCourt`: seeded with the opponent
  // starters and mutated by opponent sub_in / sub_out events. Drives opponent
  // minutes at finalize and the OPP ON COURT panel.
  const oppOnCourt = useMemo(() => {
    if (!state) return [] as number[]
    const set = [...(state.opponentStarters ?? [])]
    for (const e of state.events) {
      if (e.team_side !== 'opponent') continue
      if (e.event_type === 'sub_in' && e.jersey_number != null && !set.includes(e.jersey_number)) set.push(e.jersey_number)
      else if (e.event_type === 'sub_out' && e.jersey_number != null) {
        const i = set.indexOf(e.jersey_number)
        if (i >= 0) set.splice(i, 1)
      }
    }
    return set
  }, [state])
  const oppBench = useMemo(
    () => opponentJerseys.filter(j => !oppOnCourt.includes(j)),
    [opponentJerseys, oppOnCourt],
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
  // After any programmatic seek, nudge the clock+score to the new position. YouTube's
  // seekTo is async, so re-read a couple of times rather than trusting getCurrentTime
  // immediately (this is why the 10s skip buttons appeared not to move the clock).
  const syncAfterSeek = useCallback(() => {
    setTimeout(() => syncRef.current(), 80)
    setTimeout(() => syncRef.current(), 300)
  }, [])
  const seekBack = useCallback((sec: number | null) => {
    if (sec == null) return
    try { ytRef.current?.seekTo?.(Math.max(0, sec - SEEK_LEAD), true) } catch { /* noop */ }
    syncAfterSeek()
  }, [syncAfterSeek])
  const skip = useCallback((delta: number) => {
    try {
      const t = ytRef.current?.getCurrentTime?.()
      if (typeof t === 'number') ytRef.current?.seekTo?.(Math.max(0, t + delta), true)
    } catch { /* noop */ }
    syncAfterSeek()
  }, [syncAfterSeek])

  // Anchors that pin video position → game clock for the current period: the manual
  // tip-off anchor (video pos → 10:00) plus every logged play (its video_time → its
  // clock_sec). "Set" means at least one exists — until then the clock isn't started.
  const clockAnchors = useMemo(() => {
    const list: { vt: number; cs: number }[] = []
    for (const a of manualAnchors) if (a.period === period) list.push({ vt: a.videoTime, cs: a.clockSec })
    for (const e of events) {
      if (e.period === period && e.video_time != null && e.clock_sec != null) {
        list.push({ vt: e.video_time, cs: e.clock_sec })
      }
    }
    return list.sort((a, b) => a.vt - b.vt)
  }, [events, period, manualAnchors])

  const clockSet = clockAnchors.length > 0
  useEffect(() => { clockSetRef.current = clockSet }, [clockSet])

  // Game clock as a readout of the video position, anchored by the tip-off + logged
  // plays. Between anchors the clock counts down 1:1 with the video and snaps to each
  // anchor's exact time, so the clock and video are an extension of each other and
  // can't drift apart on open/seek/scrub.
  const clockForVideoTime = useCallback((vt: number | null): number => {
    if (vt == null || !clockAnchors.length) return PERIOD_SEC
    const clamp = (n: number) => Math.max(0, Math.min(PERIOD_SEC, n))
    let before: { vt: number; cs: number } | null = null
    for (const a of clockAnchors) { if (a.vt <= vt) before = a; else break }
    const a = before ?? clockAnchors[0]
    return clamp(a.cs - (vt - a.vt))
  }, [clockAnchors])

  // Running score AT the current video position — the last play at or before that
  // point in the footage. Scrub back and the scoreboard shows the score as it stood
  // then, matching the clock (an extension of the video, same as the clock).
  const scoreForVideoTime = useCallback((vt: number | null): { us: number; them: number } => {
    if (vt == null) return { us: teamScore, them: oppScore }
    let us = 0, them = 0
    for (const e of events) {
      if (e.video_time != null && e.video_time <= vt) { us = e.team_score; them = e.opp_score }
    }
    return { us, them }
  }, [events, teamScore, oppScore])
  const [videoScore, setVideoScore] = useState<{ us: number; them: number }>({ us: 0, them: 0 })

  // Single point that re-reads the video position and updates BOTH the score (always)
  // and the clock (when set + following). Held in a ref so seek helpers can nudge it.
  const syncToVideo = useCallback(() => {
    const vt = videoTime()
    setVideoScore(scoreForVideoTime(vt))
    if (clockArmedRef.current && clockSetRef.current) setClockSec(clockForVideoTime(vt))
  }, [videoTime, scoreForVideoTime, clockForVideoTime])
  syncRef.current = syncToVideo

  // Add a manual anchor at the current video position for a given clock value, and
  // resume following. Used by the tip-off Start (10:00) and by re-align (any value).
  function anchorClockAt(clockSec: number) {
    const vt = videoTime() ?? 0
    setManualAnchors(prev => [...prev.filter(a => !(a.period === period && a.videoTime === vt)), { period, videoTime: vt, clockSec }])
    setClockArmed(true)
    setTimeout(() => syncRef.current(), 0)
  }
  function startClock() { anchorClockAt(PERIOD_SEC) }

  // Re-align our clock to the real scoreboard: parse "M:SS" and anchor it to the
  // current video frame. Everything after this point counts down from there.
  function applyAdjust() {
    const m = adjustVal.trim().match(/^(\d{1,2}):(\d{1,2})$/)
    if (!m) return
    const sec = Math.max(0, Math.min(PERIOD_SEC, parseInt(m[1], 10) * 60 + parseInt(m[2], 10)))
    anchorClockAt(sec)
    setAdjusting(false)
  }

  const didSeekRef = useRef(false)
  useEffect(() => {
    if (!ytReady || didSeekRef.current || !state?.events.length) return
    const last = state.events[state.events.length - 1]
    if (last.video_time != null) seekBack(last.video_time)
    didSeekRef.current = true
  }, [ytReady, state, seekBack])

  // ── Clock + score follow the video ─────────────────────────────────────────
  // One 250ms poll while a video is attached: the SCORE always tracks the video
  // position (scrub back → see the score as it stood then); the CLOCK tracks it only
  // once set (tip-off anchored) and while following (Stop freezes it for a stop-clock
  // window while the video rolls). Gates read via refs so the loop isn't re-created.
  useEffect(() => {
    if (!activeVideoId) return
    const tick = () => syncRef.current()
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [activeVideoId])

  const togglePause = useCallback(() => {
    const p = ytRef.current
    if (p) {
      let playing = false
      try { playing = p.getPlayerState?.() === 1 } catch { /* noop */ }
      try { playing ? p.pauseVideo() : p.playVideo() } catch { /* noop */ }
    } else setClockArmed(a => !a)
  }, [])

  // Pause the video during any selection, resume when done.
  const subOpen = subTeam !== null
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
      // Stamp the derived game clock only once it's been started (anchored); a play
      // logged before tip-off shouldn't become a bogus 10:00 anchor.
      const cs = clockUsedRef.current && clockSetRef.current ? Math.round(clockSecRef.current) : null
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
        if (isMiss) { setArmed(null); scheduleRebound(t.team_side); return }
      } else if (btn.et === 'missed_ft') {
        // A missed free throw is live — prompt for the rebound too (no shot location
        // for FTs, so skip the chart and go straight to the rebound prompt).
        setArmed(null); scheduleRebound(t.team_side); return
      } else if (btn.et === 'steal') {
        setArmed(null); setPrompt({ kind: 'turnover', toSide: t.team_side === 'team' ? 'opponent' : 'team' }); return
      }
    }
    setArmed(null)
  }

  const tapStat = (btn: EventBtn) => setArmed({ kind: 'ev', btn })
  const tapReb  = () => setArmed({ kind: 'reb' })

  function openSub(team: 'us' | 'opp') { setClockArmed(false); setArmed(null); setSubOut(null); setSubNewOpp(''); setSubTeam(team) }
  function closeSub() { setSubTeam(null); setSubOut(null); setSubNewOpp('') }
  function subPickOff(key: string) { setSubOut(cur => (cur === key ? null : key)) }
  // Bring `key` on. With a `subOut` selected it's a swap (off ↔ on); with an open slot
  // (fewer than five on court) and nobody selected off, it's a straight add — this is
  // how you establish an opponent five mid-game or at the start of a period when the
  // floor is empty. For us, key is a player_id; for the opponent, jersey strings.
  function subPickOn(key: string) {
    const isOpp = subTeam === 'opp'
    const openSlot = (isOpp ? oppOnCourt.length : onCourt.length) < 5
    if (subOut == null && !openSlot) return
    if (isOpp) {
      const on = parseInt(key, 10)
      ensureOppJersey(on)
      append(subOut != null
        ? [
            { event_type: 'sub_out', team_side: 'opponent', points: 0, player_id: null, jersey_number: parseInt(subOut, 10) },
            { event_type: 'sub_in',  team_side: 'opponent', points: 0, player_id: null, jersey_number: on },
          ]
        : [{ event_type: 'sub_in', team_side: 'opponent', points: 0, player_id: null, jersey_number: on }])
    } else {
      append(subOut != null
        ? [
            { event_type: 'sub_out', team_side: 'team', points: 0, player_id: subOut },
            { event_type: 'sub_in',  team_side: 'team', points: 0, player_id: key },
          ]
        : [{ event_type: 'sub_in', team_side: 'team', points: 0, player_id: key }])
    }
    setSubOut(null)
  }
  // Add an opponent jersey to the known list (so it shows in pickers) if it's new.
  function ensureOppJersey(n: number) {
    setState(prev => {
      if (!prev) return prev
      const list = prev.opponentJerseys ?? []
      if (list.includes(n)) return prev
      return { ...prev, opponentJerseys: [...list, n].sort((a, b) => a - b), updatedAt: Date.now() }
    })
  }
  // Opponent modal: bring a brand-new jersey on — either swapping for the selected
  // player going off, or straight onto an open slot when the floor isn't full.
  function subOnNewOpp() {
    const n = parseInt(subNewOpp, 10)
    if (!Number.isFinite(n) || (subOut == null && oppOnCourt.length >= 5)) { setSubNewOpp(''); return }
    subPickOn(String(n))
    setSubNewOpp('')
  }

  // Open the rebound prompt ~1s later so the video plays on and the coach can see who
  // grabbed the board before the prompt pauses it. (Missed FTs never prompt.)
  function scheduleRebound(shooterSide: TeamSide) {
    setTimeout(() => setPrompt({ kind: 'rebound', shooterSide }), 1000)
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
    if (sp?.isMiss) scheduleRebound(sp.shooterSide)
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
    // New quarter → per-quarter footage restarts at 10:00; the sync loop re-locks to
    // the new video once it loads. Resume following.
    setClockSec(PERIOD_SEC); setClockArmed(true)
  }
  function endQuarter() { if (period < 4) setPeriod(period + 1) }
  // Stop/Start: freeze the clock (stop-clock window) or resume following the video.
  function toggleClock() { setClockArmed(a => !a) }
  // Re-lock the clock to the current video position (after a Stop, or if it drifted).
  function resetClock() { setClockArmed(true); syncToVideo() }
  // Jump the video to a play; the clock follows to that play's spot in the footage.
  function jumpToEvent(e: LocalEvent) {
    seekBack(e.video_time)
    setClockSec(clockForVideoTime(e.video_time == null ? null : e.video_time - SEEK_LEAD))
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
    // Arrow keys scrub the video ±10s (always available, even with a popup open).
    if (k === 'ArrowRight') { e.preventDefault(); skip(10); return }
    if (k === 'ArrowLeft') { e.preventDefault(); skip(-10); return }
    if (k === 'Escape') { setArmed(null); setPrompt(null); setShotPrompt(null); return }
    // Start the game clock at tip-off (only while it's unset, so it can't re-anchor by accident).
    if ((k === 'g' || k === 'G') && !clockSet) { e.preventDefault(); startClock(); return }
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
          <button onClick={() => openSub('us')} style={{ ...hdrBtn, fontWeight: 800 }}>⇄ Sub</button>
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
            {/* Top row: scoreboard bug + (when a stat is logged) the confirm toast beside it */}
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              background: 'rgba(15,23,42,0.82)', color: '#fff', borderRadius: 10, padding: '6px 10px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, background: TEAL, borderRadius: 6, padding: '2px 7px' }}>Q{period}</span>
              {adjusting ? (
                <>
                  <input
                    autoFocus value={adjustVal}
                    onChange={e => setAdjustVal(e.target.value.replace(/[^\d:]/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyAdjust() } else if (e.key === 'Escape') { e.preventDefault(); setAdjusting(false) } }}
                    placeholder="M:SS"
                    style={{ width: 66, fontSize: 20, fontWeight: 900, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderRadius: 6, border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(0,0,0,0.35)', color: '#fff', padding: '2px 4px' }} />
                  <button onClick={applyAdjust} title="Align our clock to this value at the current video frame" style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', border: 'none', color: '#fff', background: GREEN }}>Align</button>
                  <button onClick={() => setAdjusting(false)} title="Cancel" style={{ fontSize: 11, fontWeight: 700, padding: '4px 7px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', background: 'transparent' }}>✕</button>
                </>
              ) : (
                <>
                  <span title="Game clock — follows the video" style={{
                    fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                    color: clockSet && clockArmed ? '#fff' : '#fbbf24', minWidth: 66, textAlign: 'center', lineHeight: 1,
                  }}>{fmtVt(clockSec)}</span>
                  <button
                    onClick={clockSet ? toggleClock : startClock}
                    title={!clockSet ? 'Start the game clock at the tip-off' : clockArmed ? 'Stop the clock (stop-clock window)' : 'Resume following the video'}
                    style={{
                      fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', border: 'none',
                      color: '#fff', background: clockSet && clockArmed ? AMBER : GREEN,
                    }}>{clockSet && clockArmed ? 'Stop' : 'Start'}</button>
                  {clockSet && (
                    <button onClick={resetClock} title="Re-lock the clock to the video" style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 7px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.3)', color: '#fff', background: 'transparent',
                    }}>⟲</button>
                  )}
                  {clockSet && (
                    <button onClick={() => { setAdjustVal(fmtVt(clockSec)); setAdjusting(true) }} title="Adjust — align the clock to the real scoreboard" style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 7px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.3)', color: '#fff', background: 'transparent',
                    }}>✎</button>
                  )}
                </>
              )}
              <span title="Score at this point of the video" style={{ fontSize: 15, fontWeight: 900, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
                {activeVideoId ? videoScore.us : teamScore}<span style={{ color: '#94a3b8', margin: '0 5px', fontWeight: 700 }}>–</span>{activeVideoId ? videoScore.them : oppScore}
              </span>
            </div>
            {/* Confirm toast — the just-logged player's line, beside the clock (same top row) */}
            {toast && toastLine && (
              <div key={toast.n} style={{
                display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
                background: 'rgba(48,123,146,0.96)', color: '#fff', borderRadius: 10, padding: '6px 12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.28)', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{chipName(toast.pid)}</span>
                <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>
                  {toastLine.pts} PTS · {toastLine.reb} REB · {toastLine.ast} AST
                  {toastLine.stl > 0 && ` · ${toastLine.stl} STL`}{toastLine.blk > 0 && ` · ${toastLine.blk} BLK`}
                  {toastLine.pf > 0 && ` · ${toastLine.pf} PF`} · {toastLine.fgm}/{toastLine.fga} FG
                </span>
              </div>
            )}
            </div>

            {/* Tip-off callout — persists until the coach starts the clock. The video's
                start isn't the quarter's start, so the clock is set manually at the tip. */}
            {!clockSet && !!activeVideoId && (
              <div style={{
                position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
                display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(217,119,6,0.97)', color: '#fff',
                borderRadius: 999, padding: '9px 10px 9px 16px', fontSize: 13, fontWeight: 700,
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
              }}>
                <span>▶ At tip-off, start the game clock</span>
                <button onClick={startClock} style={{
                  fontSize: 13, fontWeight: 800, padding: '6px 14px', borderRadius: 999, border: 'none',
                  cursor: 'pointer', color: '#b45309', background: '#fff',
                }}>Start clock <span style={{ opacity: 0.6, fontWeight: 700 }}>(G)</span></button>
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
              <button onClick={() => openSub('us')} style={{ fontSize: 10, fontWeight: 700, color: TEAL, background: 'transparent', border: 'none', cursor: 'pointer' }}>⇄ Subs</button>
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

          {/* Opponent on-court reference — always available (opponent tracking is
              opt-in, but the entry point must exist even before anyone is placed on
              court). Its ⇄ Subs opens the opponent modal, where players can be added to
              open slots or swapped, so opponent minutes stay accurate. */}
          <div style={{ flexShrink: 0, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ ...sectionLabel, color: AMBER, marginBottom: 0 }}>OPP ON COURT · {oppShort.toUpperCase()}</span>
              <button onClick={() => openSub('opp')} style={{ fontSize: 10, fontWeight: 700, color: AMBER, background: 'transparent', border: 'none', cursor: 'pointer' }}>⇄ Subs</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {oppOnCourt.map(j => (
                <span key={j} style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, border: `1px solid ${BORDER}`, color: SEC, background: '#fff' }}>#{j}</span>
              ))}
              {oppOnCourt.length === 0
                ? <span style={{ fontSize: 10, color: MUTED, alignSelf: 'center' }}>None on court — ⇄ Subs to add</span>
                : oppOnCourt.length !== 5 && <span style={{ fontSize: 10, color: MUTED, alignSelf: 'center' }}>{oppOnCourt.length}/5</span>}
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
          <PopupHead kicker="SELECT THE PLAYER" title={`${armedLabel} — who did it?`} hint="Press 1–9 or tap. Video paused." />
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

      {/* Substitution modal (right-docked) — shared by our team and the opponent. */}
      {subOpen && (() => {
        const isOpp = subTeam === 'opp'
        // Off = who's on court; On = the bench. Keys are player_ids (us) or jersey
        // strings (opp) so subOut/subPickOn stay type-uniform across both sides.
        const offItems = isOpp
          ? oppOnCourt.map(j => ({ key: String(j), label: `#${j}` }))
          : onCourt.map(id => ({ key: id, label: chipName(id) }))
        const onItems = isOpp
          ? oppBench.map(j => ({ key: String(j), label: `#${j}` }))
          : bench.map(id => ({ key: id, label: chipName(id) }))
        const offLabel = subOut == null ? '' : isOpp ? `#${subOut}` : chipName(subOut)
        const onCount = isOpp ? oppOnCourt.length : onCourt.length
        const openSlot = onCount < 5
        // You can pick someone to come on when a player is selected to go off (a swap)
        // OR when the floor isn't full (a straight add — establishing/topping-up the five).
        const canPickOn = subOut != null || openSlot
        const onAccent = isOpp ? AMBER : GREEN
        return (
          <RightDock onClose={closeSub} width={440}>
            <PopupHead
              kicker={isOpp ? `SUBSTITUTION · ${opponentName.toUpperCase()}` : 'SUBSTITUTION · OUR TEAM'} color={isOpp ? AMBER : GREEN}
              title={subOut ? `Who comes ON for ${offLabel}?` : openSlot ? 'Add players on court' : 'Who is going off?'}
              hint={subOut
                ? 'Tap the bench player coming on. ⏸ video & clock stopped'
                : openSlot
                ? `${onCount}/5 on court — tap a name to add them, or tap someone off to swap. ⏸ video & clock stopped`
                : 'Tap who comes OFF, then who comes ON. ⏸ video & clock stopped'}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ ...sectionLabel, color: RED }}>ON COURT → OFF</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {offItems.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>Nobody on court{isOpp ? ' — add players →' : ''}.</div>}
                  {offItems.map(it => (
                    <button key={it.key} onClick={() => subPickOff(it.key)} style={{
                      padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${subOut === it.key ? RED : BORDER}`, color: subOut === it.key ? '#fff' : SEC, background: subOut === it.key ? RED : '#fff',
                    }}>{it.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ ...sectionLabel, color: onAccent }}>{subOut ? 'BENCH → ON' : openSlot ? 'ADD ON COURT' : 'BENCH → ON'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {onItems.length === 0 && !isOpp && <div style={{ fontSize: 12, color: MUTED }}>No bench players.</div>}
                  {onItems.map(it => (
                    <button key={it.key} onClick={() => subPickOn(it.key)} disabled={!canPickOn} style={{
                      padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: canPickOn ? 'pointer' : 'default', textAlign: 'left',
                      border: `2px solid ${BORDER}`, color: canPickOn ? onAccent : MUTED, background: '#fff', opacity: canPickOn ? 1 : 0.55,
                    }}>{it.label}</button>
                  ))}
                  {isOpp && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      <input inputMode="numeric" placeholder="+ #" value={subNewOpp}
                        onChange={e => setSubNewOpp(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); subOnNewOpp() } }}
                        disabled={!canPickOn}
                        style={{ width: 56, fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 9px', fontFamily: 'inherit', color: SEC, opacity: canPickOn ? 1 : 0.55 }} />
                      {subNewOpp && canPickOn && (
                        <button onClick={subOnNewOpp} style={promptBtn(AMBER)}>On #{subNewOpp}</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={closeSub} style={promptBtn(TEAL)}>Done</button>
            </div>
          </RightDock>
        )
      })()}

      {/* Shot-location picker (right-docked) */}
      {shotPrompt && (
        <RightDock onClose={() => resolveShot(null, null)}>
          <PopupHead kicker="SHOT LOCATION" title="Where was the shot?" hint="Tap the spot on the court, or skip." />
          <HalfCourt onPick={(x, y) => resolveShot(x, y)} maxHeight={360} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={() => resolveShot(null, null)} style={promptBtn(MUTED, true)}>Skip location</button>
          </div>
        </RightDock>
      )}

      {/* Rebound / turnover prompt (right-docked) */}
      {prompt && (
        <RightDock onClose={() => setPrompt(null)}>
          <PopupHead
            kicker={prompt.kind === 'rebound' ? 'REBOUND' : 'TURNOVER'}
            color={prompt.kind === 'rebound' ? TEAL : AMBER}
            title={prompt.kind === 'rebound' ? 'Who got the rebound?' : 'Turnover on whom?'}
            hint={prompt.kind === 'rebound' ? 'Offence / defence auto. Press 1–9 or tap.' : 'Press 1–9 or tap.'}
          />
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

// Right-docked popup panel — leaves the (paused) video visible on the left. Content
// is vertically centred (via margin-auto) so the heading + options sit in the coach's
// sightline rather than up in the top corner; it still scrolls from the top if a
// popup is taller than the screen.
function RightDock({ children, onClose, width = 380 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.22)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="w-full" style={{
        maxWidth: width, height: '100%', overflowY: 'auto', background: CARD,
        boxShadow: '-14px 0 44px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ margin: 'auto 0', padding: 18 }}>{children}</div>
      </div>
    </div>
  )
}

// Consistent popup header: an uppercase kicker (what the popup is FOR) + a big title
// (what to select), so the coach always knows what they're picking.
function PopupHead({ kicker, title, hint, color = TEAL }: { kicker: string; title: string; hint?: string; color?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: '0.09em', marginBottom: 3 }}>{kicker}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: SEC, lineHeight: 1.15 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{hint}</div>}
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
