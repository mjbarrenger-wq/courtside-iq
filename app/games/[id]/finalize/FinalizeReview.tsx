'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadEntryState, type EntryState } from '@/lib/entryState'
import { aggregateBox, reconstructStints, rollupPlayerOnCourt } from '@/lib/pbpAggregate'
import { finalizeNativeGame } from '../actions'

const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const GREEN  = '#059669'
const RED    = '#dc2626'
const AMBER  = '#d97706'

export interface FinalizePlayer {
  id: string
  jersey_number: number
  first_name: string
  last_name: string
}

export default function FinalizeReview({
  gameId, players, opponentName, alreadyFinal,
}: {
  gameId: string
  players: FinalizePlayer[]
  opponentName: string
  alreadyFinal: boolean
}) {
  const router = useRouter()
  const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  const [state, setState] = useState<EntryState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [teamFinal, setTeamFinal] = useState('')
  const [oppFinal, setOppFinal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const s = loadEntryState(gameId)
    setState(s)
    setLoaded(true)
    if (s && s.events.length) {
      setTeamFinal(String(s.events[s.events.length - 1].team_score))
      setOppFinal(String(s.events[s.events.length - 1].opp_score))
    }
  }, [gameId])

  const tallied = useMemo(() => {
    if (!state || !state.events.length) return { team: 0, opp: 0 }
    const last = state.events[state.events.length - 1]
    return { team: last.team_score, opp: last.opp_score }
  }, [state])

  // Client-side preview of what will be written, from the same shared aggregator.
  const preview = useMemo(() => {
    if (!state) return null
    const agg = state.events.map(e => ({
      event_order: e.event_order, period: e.period, event_type: e.event_type,
      team_side: e.team_side, points: e.points, player_id: e.player_id,
      clock_sec: e.clock_sec, video_time: e.video_time,
    }))
    const box = aggregateBox(agg)
    const stints = reconstructStints(agg, state.starters, { timeSource: 'video' })
    const oc = rollupPlayerOnCourt(stints)
    const rows = [...box.players.keys()].map(pid => {
      const c = box.players.get(pid)!
      return { pid, c, pm: oc.get(pid)?.plus_minus ?? 0 }
    }).sort((a, b) => b.c.pts - a.c.pts)
    return { rows, stints: stints.length, opp: box.opponent }
  }, [state])

  const teamN = parseInt(teamFinal || '', 10)
  const oppN = parseInt(oppFinal || '', 10)
  const scoresEntered = Number.isFinite(teamN) && Number.isFinite(oppN)
  const matches = scoresEntered && teamN === tallied.team && oppN === tallied.opp
  const canCommit = !!state && state.events.length > 0 && matches && !saving

  async function commit() {
    if (!state) return
    setSaving(true)
    setError(null)
    const res = await finalizeNativeGame(gameId, {
      starters: state.starters,
      events: state.events,
      finalTeamScore: teamN,
      finalOppScore: oppN,
    })
    if (!res.success) {
      setSaving(false)
      setError(res.error ?? 'Finalize failed.')
      return
    }
    // Keep the local event log so the game can be reopened and edited; it can also
    // be rebuilt from the database if this browser's state is ever lost.
    router.push(`/games/${gameId}`)
  }

  if (!loaded) return <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>

  if (!state || state.events.length === 0) {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, fontSize: 13, color: SEC }}>
        No events have been logged for this game yet.{' '}
        <a href={`/games/${gameId}/enter`} style={{ color: TEAL, fontWeight: 700 }}>Go score it →</a>
      </div>
    )
  }

  const name = (id: string) => {
    const p = byId.get(id)
    return p ? `#${p.jersey_number} ${p.first_name}` : id.slice(-4)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {alreadyFinal && (
        <div style={{ background: '#fffbeb', border: `1px solid #fde68a`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: AMBER, fontWeight: 600 }}>
          This game already has a final score saved. Committing again will overwrite the stored box score,
          stints and play-by-play with the current tally.
        </div>
      )}

      {/* Score reconciliation */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em', marginBottom: 12 }}>SCORE CHECK</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>TALLIED FROM EVENTS</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: SEC }}>{tallied.team} – {tallied.opp}</div>
          </div>
          <div style={{ fontSize: 20, color: MUTED }}>vs</div>
          <div>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>ACTUAL FINAL (from the scoreboard)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input inputMode="numeric" value={teamFinal} onChange={e => setTeamFinal(e.target.value.replace(/\D/g, ''))}
                style={scoreInput} />
              <span style={{ fontSize: 20, color: MUTED }}>–</span>
              <input inputMode="numeric" value={oppFinal} onChange={e => setOppFinal(e.target.value.replace(/\D/g, ''))}
                style={scoreInput} />
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {scoresEntered ? (
              matches
                ? <span style={{ fontSize: 12, fontWeight: 800, color: GREEN }}>✓ Matches</span>
                : <span style={{ fontSize: 12, fontWeight: 800, color: RED }}>✗ Off by {Math.abs(teamN - tallied.team)}–{Math.abs(oppN - tallied.opp)}</span>
            ) : <span style={{ fontSize: 12, color: MUTED }}>Enter the final score</span>}
          </div>
        </div>
        {!matches && scoresEntered && (
          <div style={{ fontSize: 12, color: RED, marginTop: 10 }}>
            The tally doesn&rsquo;t match. <a href={`/games/${gameId}/enter`} style={{ color: TEAL, fontWeight: 700 }}>Go back and fix the events</a>, or correct the final score above.
          </div>
        )}
      </div>

      {/* Box preview */}
      {preview && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.06em' }}>
            WHAT WILL BE WRITTEN · {preview.rows.length} players · {preview.stints} stints
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 620 }}>
              <thead>
                <tr style={{ background: '#f0f2f7' }}>
                  {['Player', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-'].map((h, i) => (
                    <th key={i} style={{ ...th, textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(({ pid, c, pm }) => (
                  <tr key={pid} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: SEC }}>{name(pid)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{c.pts}</td>
                    <td style={td}>{c.reb}</td>
                    <td style={td}>{c.ast}</td>
                    <td style={td}>{c.stl}</td>
                    <td style={td}>{c.blk}</td>
                    <td style={td}>{c.turnovers}</td>
                    <td style={td}>{c.fouls}</td>
                    <td style={{ ...td, fontWeight: 700, color: pm > 0 ? GREEN : pm < 0 ? RED : MUTED }}>{pm > 0 ? `+${pm}` : pm}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8f9fb' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: AMBER }}>{opponentName}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{preview.opp.pts}</td>
                  <td style={td}>{preview.opp.oreb + preview.opp.dreb}</td>
                  <td style={td}>{preview.opp.ast}</td>
                  <td style={td}>{preview.opp.stl}</td>
                  <td style={td}>{preview.opp.blk}</td>
                  <td style={td}>{preview.opp.turnovers}</td>
                  <td style={td}>{preview.opp.off_fouls + preview.opp.def_fouls}</td>
                  <td style={td}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: `1px solid #fca5a5`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: RED, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={commit} disabled={!canCommit} style={{
          fontSize: 14, fontWeight: 800, color: canCommit ? '#fff' : MUTED,
          background: canCommit ? GREEN : '#eef1f6', border: 'none', borderRadius: 9, padding: '12px 24px',
          cursor: canCommit ? 'pointer' : 'default',
        }}>{saving ? 'Committing…' : 'Commit final →'}</button>
        <a href={`/games/${gameId}/enter`} style={{ fontSize: 12, color: MUTED, textDecoration: 'none' }}>← Back to scoring</a>
      </div>
    </div>
  )
}

const scoreInput: React.CSSProperties = {
  width: 58, fontSize: 22, fontWeight: 900, textAlign: 'center', color: SEC,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 6px', fontFamily: 'inherit',
}
const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 700, color: MUTED,
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '7px 10px', textAlign: 'center', color: SEC, whiteSpace: 'nowrap' }
