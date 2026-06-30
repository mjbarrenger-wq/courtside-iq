// Lineup Performance — read-only panel on the Rotations page.
// Aggregates the lineup_stints analytics layer (derived from imported
// play-by-play) so the coach can see which 5-man units have ACTUALLY produced,
// alongside the prospective planner. Deliberately NOT fed into the optimiser —
// single-game samples are too noisy to drive lineup decisions. Once enough games
// are imported, weighting Net PPP into the solver is the natural next step.

export type LineupRow = {
  names: string[]
  minutes: number
  plusMinus: number
  offPpp: number
  defPpp: number
  netPpp: number
  offPoss: number
  defPoss: number
}

const BORDER = '#e2e5eb'

function netColor(n: number) {
  if (n > 0.05) return '#1f7a4d'
  if (n < -0.05) return '#b4313a'
  return '#4b5563'
}

export default function LineupPerformance({
  rows, gameCount, totalGames,
}: { rows: LineupRow[]; gameCount: number; totalGames: number }) {
  return (
    <section style={{
      background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: '20px 22px', marginTop: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1a1f2e', margin: 0 }}>
          Lineup Performance
        </h2>
        <div style={{ fontSize: 12, color: '#307b92', fontWeight: 700 }}>
          from play-by-play
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: '#4b5563', marginTop: 6, marginBottom: 16, lineHeight: 1.55, maxWidth: 640 }}>
        What each 5-man unit has actually produced when on court — offence, defence, and Net PPP.
        {gameCount > 0 ? (
          <>
            {' '}Based on <strong>{gameCount}</strong> of {totalGames} game{totalGames === 1 ? '' : 's'} with play-by-play imported.{' '}
            {gameCount < 4 && (
              <span style={{ color: '#9a6a00' }}>
                Small sample — read these as directional, not decisive. Plus/minus is the most reliable column at this stage.
              </span>
            )}
          </>
        ) : ' No play-by-play imported yet — run scripts/import_pbp.mjs to populate this.'}
      </p>

      {gameCount > 0 && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px 8px 0', fontWeight: 700 }}>Lineup</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Min</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>+/−</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Off</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Def</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Net</th>
                <th style={{ padding: '8px 0 8px 10px', fontWeight: 700, textAlign: 'right' }}>Poss</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '9px 10px 9px 0', color: '#1a1f2e', fontWeight: 600 }}>
                    {r.names.join(' · ')}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151' }}>{r.minutes.toFixed(1)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: netColor(r.plusMinus) }}>
                    {r.plusMinus > 0 ? '+' : ''}{r.plusMinus}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151' }}>{r.offPpp.toFixed(2)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#374151' }}>{r.defPpp.toFixed(2)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: netColor(r.netPpp) }}>
                    {r.netPpp > 0 ? '+' : ''}{r.netPpp.toFixed(2)}
                  </td>
                  <td style={{ padding: '9px 0 9px 10px', textAlign: 'right', color: '#9ca3af' }}>
                    {Math.round(r.offPoss + r.defPoss)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.5 }}>
            PPP = points per possession (possessions estimated as FGA + 0.44·FTA − OReb + TO). Net = Off − Def.
            Low possession counts mean a single basket moves the number a lot.
          </p>
        </div>
      )}
    </section>
  )
}
