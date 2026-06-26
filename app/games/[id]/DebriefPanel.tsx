'use client'

import { useState } from 'react'
import { regenerateGameDebrief } from './actions'

const BORDER = '#e2e5eb'
const TEAL = '#307b92'
const MUTED = '#6b7280'

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function DebriefPanel({
  gameId,
  initialText,
  initialGeneratedAt,
}: {
  gameId: string
  initialText: string | null
  initialGeneratedAt: string | null
}) {
  const [text, setText] = useState<string | null>(initialText)
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function regenerate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await regenerateGameDebrief(gameId)
      if (res.ok) {
        setText(res.text)
        setGeneratedAt(new Date().toISOString())
      } else {
        setError(res.error)
      }
    } catch {
      setError('Something went wrong generating the debrief.')
    } finally {
      setBusy(false)
    }
  }

  const paragraphs = (text ?? '').split('\n\n').map(p => p.trim()).filter(Boolean)

  return (
    <div style={{
      background: '#ffffff',
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{
        padding: '13px 20px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>AI COACHING DEBRIEF</span>
          {generatedAt && !busy && (
            <span style={{ fontSize: 10, color: MUTED }}>generated {fmtDate(generatedAt)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={regenerate}
            disabled={busy}
            className="min-h-[36px]"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: busy ? MUTED : TEAL,
              background: '#ffffff',
              border: `1px solid ${busy ? BORDER : '#c5d5e8'}`,
              borderRadius: 6,
              padding: '5px 12px',
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              whiteSpace: 'nowrap',
            }}
          >
            {busy && (
              <span className="ciq-spin" style={{
                width: 12, height: 12, border: `2px solid rgba(48,123,146,0.3)`,
                borderTopColor: TEAL, display: 'inline-block', flexShrink: 0,
              }} />
            )}
            {busy ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
          </button>
          <a
            href="/practice"
            className="min-h-[36px]"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#ffffff',
              background: TEAL,
              borderRadius: 6,
              padding: '6px 14px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Build Practice Plan →
          </a>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px' }}>
        {busy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: MUTED, fontSize: 13 }}>
            <span className="ciq-spin" style={{
              width: 16, height: 16, border: `2px solid rgba(48,123,146,0.3)`,
              borderTopColor: TEAL, display: 'inline-block', flexShrink: 0,
            }} />
            Generating the coaching debrief…
          </div>
        ) : error ? (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: '#fef3c7', border: '1px solid #f59e0b',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <span style={{ fontSize: 14, lineHeight: 1.5 }}>⚠️</span>
            <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{error}</span>
          </div>
        ) : paragraphs.length > 0 ? (
          paragraphs.map((para, i) => {
            // The model sometimes emits **bold** markdown headings — render those
            // as subheadings and strip stray ** elsewhere rather than show literal asterisks.
            const heading = para.match(/^\*\*(.+?)\*\*:?$/)
            if (heading) {
              return (
                <div key={i} style={{
                  fontSize: 11, fontWeight: 700, color: TEAL,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  margin: i === 0 ? '0 0 8px' : '4px 0 8px',
                }}>
                  {heading[1]}
                </div>
              )
            }
            return (
              <p key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.75, margin: '0 0 14px' }}>
                {para.replace(/\*\*/g, '')}
              </p>
            )
          })
        ) : (
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
            No debrief has been generated for this game yet. Click <strong style={{ color: TEAL }}>Generate</strong> to
            create one — it’s saved to the database, so it loads instantly next time.
          </div>
        )}
      </div>
    </div>
  )
}
