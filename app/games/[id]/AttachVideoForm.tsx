'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateGame } from '../actions'
import { parseYouTubeId } from '@/lib/youtube'

const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const RED    = '#dc2626'
const AMBER  = '#d97706'

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 13, fontFamily: 'inherit', color: SEC,
  background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '8px 10px',
}

type VideoMode = 'whole' | 'quarter'

// Attaches video to an already-scored game (imported or finalized natively without
// video), ahead of clock-timing alignment. Same whole-game/per-quarter pattern as
// NewGameForm's video section, just writing via updateGame instead of createGame.
export default function AttachVideoForm({ gameId }: { gameId: string }) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [videoMode, setVideoMode] = useState<VideoMode>('whole')
  const [wholeUrl, setWholeUrl] = useState('')
  const [quarterUrls, setQuarterUrls] = useState(['', '', '', ''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeUrls = videoMode === 'whole' ? [wholeUrl] : quarterUrls
  const badLinks = activeUrls
    .map((u, i) => ({ u: u.trim(), i }))
    .filter(x => x.u && !parseYouTubeId(x.u))

  function buildVideoUrls(): string[] | null {
    if (videoMode === 'whole') {
      const u = wholeUrl.trim()
      return u ? [u] : null
    }
    const cleaned = quarterUrls.map(u => u.trim())
    return cleaned.every(u => u) ? cleaned : null
  }

  async function save() {
    setError(null)
    const videoUrls = buildVideoUrls()
    if (!videoUrls) {
      setError(videoMode === 'quarter'
        ? 'Per-quarter video needs all four links, or switch to a single whole-game link.'
        : 'Enter a video link first.')
      return
    }
    setSaving(true)
    const res = await updateGame(gameId, { video_urls: videoUrls })
    setSaving(false)
    if (!res.success) {
      setError(res.error ?? 'Could not save the video link(s).')
      return
    }
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{
          fontSize: 12, fontWeight: 800, color: TEAL, background: '#eaf3f6',
          border: `1px solid ${TEAL}`, textDecoration: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
        }}
      >+ Attach Video</button>
    )
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, minWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Attach Video (YouTube)
        </span>
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
          ⚠ {badLinks.length === 1 ? 'One link doesn’t' : `${badLinks.length} links don’t`} look like a YouTube URL — double-check before saving.
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: RED, marginTop: 8, fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button
          type="button" onClick={save} disabled={saving}
          style={{
            fontSize: 12, fontWeight: 700, color: '#fff', background: TEAL,
            border: 'none', borderRadius: 7, padding: '7px 16px', cursor: saving ? 'default' : 'pointer',
          }}
        >{saving ? 'Saving…' : 'Save video'}</button>
        <button
          type="button" onClick={() => setOpen(false)} disabled={saving}
          style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >Cancel</button>
      </div>
    </div>
  )
}
