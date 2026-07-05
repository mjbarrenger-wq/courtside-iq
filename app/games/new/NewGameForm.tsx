'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGame, createOpponent, type NewGameFields } from '../actions'
import { GAME_TYPE_CONFIG, type GameTypeKey } from '../../dashboard/filterConfig'
import type { OpponentOption } from '../GamesSetupTable'
import { parseYouTubeId } from '@/lib/youtube'

const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const RED    = '#dc2626'
const AMBER  = '#d97706'
const GREEN  = '#059669'

const TYPE_OPTIONS = GAME_TYPE_CONFIG.filter(t => t.key !== 'all_types')

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 13, fontFamily: 'inherit', color: SEC,
  background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '8px 10px',
}
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 5, display: 'block',
}

function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type VideoMode = 'whole' | 'quarter'

export default function NewGameForm({
  opponents: initialOpponents,
  defaultSeason,
}: {
  opponents: OpponentOption[]
  defaultSeason: string | null
}) {
  const router = useRouter()

  const [opponents, setOpponents] = useState<OpponentOption[]>(initialOpponents)
  const [gameDate, setGameDate] = useState(todayISO())
  const [opponentId, setOpponentId] = useState(initialOpponents[0]?.id ?? '')
  const [homeAway, setHomeAway] = useState<'home' | 'away' | 'neutral'>('home')
  const [round, setRound] = useState('')
  const [venue, setVenue] = useState('')
  const [gameType, setGameType] = useState<GameTypeKey>('regular_season')

  const [videoMode, setVideoMode] = useState<VideoMode>('whole')
  const [wholeUrl, setWholeUrl] = useState('')
  const [quarterUrls, setQuarterUrls] = useState(['', '', '', ''])

  // Inline "add opponent"
  const [addingOpp, setAddingOpp] = useState(false)
  const [newOppName, setNewOppName] = useState('')
  const [oppSaving, setOppSaving] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeUrls = videoMode === 'whole' ? [wholeUrl] : quarterUrls
  // Which entered links fail to parse to a YouTube id (soft warning, not a blocker).
  const badLinks = activeUrls
    .map((u, i) => ({ u: u.trim(), i }))
    .filter(x => x.u && !parseYouTubeId(x.u))

  const canSave = useMemo(
    () => !!gameDate && !!opponentId && !saving,
    [gameDate, opponentId, saving],
  )

  async function addOpponent() {
    const name = newOppName.trim()
    if (!name) return
    setOppSaving(true)
    setError(null)
    const res = await createOpponent(name)
    setOppSaving(false)
    if (!res.success || !res.id) {
      setError(res.error ?? 'Could not add opponent.')
      return
    }
    const added: OpponentOption = { id: res.id, full_name: res.full_name ?? name }
    setOpponents(prev =>
      [...prev, added].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setOpponentId(added.id)
    setNewOppName('')
    setAddingOpp(false)
  }

  function buildVideoUrls(): string[] | null {
    if (videoMode === 'whole') {
      const u = wholeUrl.trim()
      return u ? [u] : null
    }
    const cleaned = quarterUrls.map(u => u.trim())
    // Per-quarter only makes sense as a complete set of 4 (indexed to period).
    return cleaned.every(u => u) ? cleaned : null
  }

  async function save() {
    setError(null)
    if (videoMode === 'quarter') {
      const filled = quarterUrls.map(u => u.trim()).filter(Boolean).length
      if (filled > 0 && filled < 4) {
        setError('Per-quarter video needs all four links, or switch to a single whole-game link.')
        return
      }
    }
    setSaving(true)
    const fields: NewGameFields = {
      game_date: gameDate,
      opponent_id: opponentId,
      home_away: homeAway,
      round,
      venue,
      game_type: gameType,
      season: defaultSeason,
      video_urls: buildVideoUrls(),
    }
    const res = await createGame(fields)
    if (!res.success || !res.id) {
      setSaving(false)
      setError(res.error ?? 'Could not create the game.')
      return
    }
    router.push(`/games/${res.id}/roster`)
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Date */}
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Home/Away */}
        <div>
          <label style={labelStyle}>Home / Away</label>
          <select value={homeAway} onChange={e => setHomeAway(e.target.value as typeof homeAway)} style={inputStyle}>
            <option value="home">Home</option>
            <option value="away">Away</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>

        {/* Opponent (spans both columns) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Opponent</label>
          {!addingOpp ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={opponentId} onChange={e => setOpponentId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                {opponents.length === 0 && <option value="">No opponents yet</option>}
                {opponents.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => { setAddingOpp(true); setError(null) }}
                style={{
                  fontSize: 12, fontWeight: 700, color: TEAL, background: '#eaf3f6',
                  border: `1px solid ${BORDER}`, borderRadius: 7, padding: '0 14px', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >+ New</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                placeholder="New opponent name (e.g. Coburg 12.2)"
                value={newOppName}
                onChange={e => setNewOppName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOpponent() } }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button" onClick={addOpponent} disabled={oppSaving || !newOppName.trim()}
                style={{
                  fontSize: 12, fontWeight: 700, color: '#fff',
                  background: newOppName.trim() ? TEAL : '#c7cdd6',
                  border: 'none', borderRadius: 7, padding: '0 14px', cursor: newOppName.trim() ? 'pointer' : 'default',
                }}
              >{oppSaving ? 'Adding…' : 'Add'}</button>
              <button
                type="button" onClick={() => { setAddingOpp(false); setNewOppName('') }}
                style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >Cancel</button>
            </div>
          )}
        </div>

        {/* Type */}
        <div>
          <label style={labelStyle}>Type</label>
          <select value={gameType} onChange={e => setGameType(e.target.value as GameTypeKey)} style={inputStyle}>
            {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
          </select>
        </div>

        {/* Round */}
        <div>
          <label style={labelStyle}>Round <span style={{ color: MUTED, fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input value={round} onChange={e => setRound(e.target.value)} placeholder="e.g. 7" style={inputStyle} />
        </div>

        {/* Venue */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Venue <span style={{ color: MUTED, fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input value={venue} onChange={e => setVenue(e.target.value)} placeholder="e.g. Coburg Basketball Stadium" style={inputStyle} />
        </div>
      </div>

      {/* Video */}
      <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Game Video <span style={{ color: MUTED, fontWeight: 400, textTransform: 'none' }}>(YouTube — optional)</span></label>
          <div style={{ display: 'flex', gap: 4, background: '#f0f2f7', borderRadius: 7, padding: 3 }}>
            {(['whole', 'quarter'] as VideoMode[]).map(m => (
              <button
                key={m} type="button" onClick={() => setVideoMode(m)}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 5, border: 'none', cursor: 'pointer',
                  color: videoMode === m ? '#fff' : MUTED, background: videoMode === m ? TEAL : 'transparent',
                }}
              >{m === 'whole' ? 'Whole game' : 'Per quarter'}</button>
            ))}
          </div>
        </div>

        {videoMode === 'whole' ? (
          <input
            value={wholeUrl} onChange={e => setWholeUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=… (one link for the whole game)"
            style={inputStyle}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {quarterUrls.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: TEAL, width: 22 }}>Q{i + 1}</span>
                <input
                  value={u}
                  onChange={e => setQuarterUrls(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Quarter ${i + 1} link`}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        )}

        {badLinks.length > 0 && (
          <div style={{ fontSize: 11, color: AMBER, marginTop: 8, fontWeight: 600 }}>
            ⚠ {badLinks.length === 1 ? 'One link doesn’t' : `${badLinks.length} links don’t`} look like a YouTube URL — double-check before scoring, or the video won’t embed.
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: RED, marginTop: 16, fontWeight: 600 }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button
          type="button" onClick={save} disabled={!canSave}
          style={{
            fontSize: 13, fontWeight: 700, color: canSave ? '#fff' : MUTED,
            background: canSave ? TEAL : '#eef1f6', border: 'none', borderRadius: 8, padding: '10px 20px',
            cursor: canSave ? 'pointer' : 'default',
          }}
        >{saving ? 'Creating…' : 'Create game → Roster'}</button>
        <a href="/games" style={{ fontSize: 12, color: MUTED, textDecoration: 'none' }}>Cancel</a>
        <span style={{ fontSize: 11, color: GREEN, marginLeft: 'auto' }}>
          Score &amp; result are filled in when you finalize.
        </span>
      </div>
    </div>
  )
}
