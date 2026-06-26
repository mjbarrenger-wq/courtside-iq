'use client'
import { useState, useMemo, useCallback } from 'react'
import type {
  RotationPlayer, PlayerConstraint, OptimiserResult, Position, GameConfig,
  RotationPlanSnapshot, RotationPlanRecord, GameOption,
} from './types'
import { DEFAULT_GAME_CONFIG } from './types'
import { solve } from './optimiser'
import RotationGrid from './RotationGrid'
import { savePlayerPositions, saveRotationPlan, listRotationPlans, deleteRotationPlan } from './actions'

interface Props {
  players: RotationPlayer[]
  teamId: string
  games?: GameOption[]
  initialPlans?: RotationPlanRecord[]
}

const CARD    = '#ffffff'
const BORDER  = '#e2e5eb'
const BG      = '#f4f5f7'
const HEADER  = '#ffffff'
const TEAL    = '#307b92'
const SEC     = '#374151'
const PRIMARY = '#1a1f2e'
const MUTED   = '#6b7280'
const GREEN   = '#059669'
const RED     = '#dc2626'
const AMBER   = '#d97706'

const ALL_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']

// ── Small UI components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.06em', marginBottom: 14 }}>
      {children}
    </div>
  )
}

function NumInput({ value, min, max, step = 1, onChange, disabled, width = 60 }: {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; disabled?: boolean; width?: number
}) {
  return (
    <input type="number" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      style={{
        width, background: disabled ? 'rgba(15,17,23,0.4)' : BG,
        border: `1px solid ${disabled ? BORDER : TEAL}`,
        borderRadius: 6, padding: '5px 8px', color: disabled ? MUTED : PRIMARY,
        fontSize: 13, fontVariantNumeric: 'tabular-nums', cursor: disabled ? 'not-allowed' : 'auto',
      }}
    />
  )
}

function Slider({ value, min, max, step = 1, onChange, disabled }: {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; disabled?: boolean
}) {
  return (
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: '100%', accentColor: TEAL, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
    />
  )
}

function Check({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <input type="checkbox" checked={checked} disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      style={{ accentColor: TEAL, width: 16, height: 16, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1 }}
    />
  )
}

function ToggleGroup<T extends string | number>({ options, value, onChange }: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onChange(opt.value)} style={{
          flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none',
          background: value === opt.value ? TEAL : BG,
          color: value === opt.value ? '#ffffff' : MUTED,
          cursor: 'pointer', transition: 'all 0.12s',
        }}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Position editor ───────────────────────────────────────────────────────────

function PositionEditor({ primary, secondary, onChange }: {
  primary: Position[]; secondary: Position[]
  onChange: (p: Position[], s: Position[]) => void
}) {
  function toggle(pos: Position, tier: 'primary' | 'secondary') {
    if (tier === 'primary') {
      const next = primary.includes(pos) ? primary.filter(p => p !== pos) : [...primary, pos]
      onChange(next, secondary.filter(p => !next.includes(p)))
    } else {
      const next = secondary.includes(pos) ? secondary.filter(p => p !== pos) : [...secondary, pos]
      onChange(primary.filter(p => !next.includes(p)), next)
    }
  }
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {ALL_POSITIONS.map(pos => {
        const isPri = primary.includes(pos), isSec = secondary.includes(pos)
        const bg  = isPri ? TEAL : isSec ? 'rgba(151,207,220,0.15)' : BG
        const col = isPri ? '#ffffff' : isSec ? TEAL : MUTED
        const bdr = isPri || isSec ? TEAL : BORDER
        return (
          <div key={pos} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <button onClick={() => toggle(pos, 'primary')} title="Primary"
              style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: '3px 3px 0 0',
                padding: '2px 6px', fontSize: 9, fontWeight: 700, color: col, cursor: 'pointer', minWidth: 28 }}>
              {pos}
            </button>
            <button onClick={() => toggle(pos, 'secondary')} title="Secondary"
              style={{ background: isSec ? 'rgba(151,207,220,0.1)' : BG,
                border: `1px solid ${isSec ? TEAL : BORDER}`, borderRadius: '0 0 3px 3px',
                padding: '1px 6px', fontSize: 7, color: isSec ? TEAL : MUTED, cursor: 'pointer', minWidth: 28 }}>
              2nd
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultConstraints(players: RotationPlayer[]): PlayerConstraint[] {
  return players.map(p => ({
    playerId: p.id, isStarter: false, isCloser: false,
    minMinutes: 10, maxMinutes: 40,
    mustPlayEveryQuarter: false, unavailable: false,
  }))
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RotationPlanner({ players: initialPlayers, teamId, games = [], initialPlans = [] }: Props) {
  const [players, setPlayers]         = useState<RotationPlayer[]>(initialPlayers)
  const [constraints, setConstraints] = useState<PlayerConstraint[]>(defaultConstraints(initialPlayers))
  const [result, setResult]           = useState<OptimiserResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showPositions, setShowPositions] = useState(false)

  // Track DB-committed positions (initialized from server-fetched data).
  // Used to detect unsaved changes per player.
  const [savedPositions, setSavedPositions] = useState<Record<string, { primary: Position[]; secondary: Position[] }>>(
    () => Object.fromEntries(initialPlayers.map(p => [p.id, { primary: p.primaryPositions, secondary: p.secondaryPositions }]))
  )
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})

  const isPositionDirty = useCallback((p: RotationPlayer): boolean => {
    const saved = savedPositions[p.id]
    if (!saved) return false
    const sameArr = (a: Position[], b: Position[]) =>
      a.length === b.length && a.every((v, i) => v === b[i])
    return !sameArr(p.primaryPositions, saved.primary) ||
           !sameArr(p.secondaryPositions, saved.secondary)
  }, [savedPositions])

  async function handleSavePositions(p: RotationPlayer) {
    setSaveStatus(s => ({ ...s, [p.id]: 'saving' }))
    const res = await savePlayerPositions(p.id, p.primaryPositions, p.secondaryPositions)
    if (res.success) {
      setSavedPositions(s => ({ ...s, [p.id]: { primary: p.primaryPositions, secondary: p.secondaryPositions } }))
      setSaveStatus(s => ({ ...s, [p.id]: 'saved' }))
      // Clear "saved" tick after 2s
      setTimeout(() => setSaveStatus(s => ({ ...s, [p.id]: 'idle' })), 2000)
    } else {
      setSaveStatus(s => ({ ...s, [p.id]: 'error' }))
    }
  }

  // Game config
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG)
  const updateConfig = (u: Partial<GameConfig>) => setConfig(c => ({ ...c, ...u }))
  const [minStintMins, setMinStintMins]       = useState(DEFAULT_GAME_CONFIG.minStintMins)
  const [maxQtrImbalance, setMaxQtrImbalance] = useState(DEFAULT_GAME_CONFIG.maxQtrImbalance)

  // Team-level defaults
  const [defaultMin, setDefaultMin] = useState(10)
  const [defaultMax, setDefaultMax] = useState(40)

  // Per-player overrides: set of player IDs that have custom min/max
  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set())

  // ── Plan management ──
  const [plans, setPlans]         = useState<RotationPlanRecord[]>(initialPlans)
  const [planId, setPlanId]       = useState<string | null>(null)
  const [planName, setPlanName]   = useState('')
  const [planGameId, setPlanGameId] = useState<string>('')
  const [planStatus, setPlanStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [planError, setPlanError]   = useState<string | null>(null)

  function buildSnapshot(): RotationPlanSnapshot {
    return {
      version: 1,
      config: { ...config, minStintMins, maxQtrImbalance },
      defaultMin,
      defaultMax,
      overrideIds: [...overrideIds],
      constraints,
      result,
    }
  }

  async function handleSavePlan() {
    setPlanStatus('saving'); setPlanError(null)
    const res = await saveRotationPlan({
      id: planId ?? undefined,
      teamId,
      name: planName,
      gameId: planGameId || null,
      state: buildSnapshot(),
    })
    if (!res.success) { setPlanStatus('error'); setPlanError(res.error ?? 'Save failed'); return }
    if (res.id) setPlanId(res.id)
    setPlanStatus('saved')
    setPlans(await listRotationPlans(teamId))
    setTimeout(() => setPlanStatus('idle'), 2000)
  }

  function loadPlan(rec: RotationPlanRecord) {
    const s = rec.state
    if (!s) return
    setPlanId(rec.id)
    setPlanName(rec.name)
    setPlanGameId(rec.gameId ?? '')
    setConfig(s.config)
    setMinStintMins(s.config.minStintMins)
    setMaxQtrImbalance(s.config.maxQtrImbalance)
    setDefaultMin(s.defaultMin)
    setDefaultMax(s.defaultMax)
    setOverrideIds(new Set(s.overrideIds))
    // Merge saved constraints onto the current roster (keyed by playerId)
    const byId = new Map(s.constraints.map(c => [c.playerId, c]))
    setConstraints(players.map(p => byId.get(p.id) ?? {
      playerId: p.id, isStarter: false, isCloser: false,
      minMinutes: 10, maxMinutes: 40, mustPlayEveryQuarter: false, unavailable: false,
    }))
    setResult(s.result)
    setPlanStatus('idle'); setPlanError(null)
  }

  function newPlan() {
    setPlanId(null)
    setPlanName('')
    setPlanGameId('')
    setConfig(DEFAULT_GAME_CONFIG)
    setMinStintMins(DEFAULT_GAME_CONFIG.minStintMins)
    setMaxQtrImbalance(DEFAULT_GAME_CONFIG.maxQtrImbalance)
    setDefaultMin(10); setDefaultMax(40)
    setOverrideIds(new Set())
    setConstraints(defaultConstraints(players))
    setResult(null)
    setPlanStatus('idle'); setPlanError(null)
  }

  async function handleDeletePlan() {
    if (!planId) return
    const res = await deleteRotationPlan(planId)
    if (res.success) { setPlans(await listRotationPlans(teamId)); newPlan() }
    else { setPlanError(res.error ?? 'Delete failed'); setPlanStatus('error') }
  }

  // Derived
  const totalGameMins     = config.numPeriods * config.periodDuration
  const availablePlayers  = useMemo(() => players.filter(p => !constraints.find(c => c.playerId === p.id)?.unavailable), [players, constraints])
  // Even-minutes target is computed for the players who actually SHARE the balance:
  // total court-minutes minus any minutes committed by per-player overrides, divided
  // by the available players who DON'T have an override. So if 2 of 10 are out and
  // 1 is fixed at 10 min via override, the remaining 7 split the rest evenly.
  const overrideCommittedMins = useMemo(
    () => constraints.filter(c => overrideIds.has(c.playerId) && !c.unavailable).reduce((s, c) => s + c.minMinutes, 0),
    [constraints, overrideIds],
  )
  const balanceShareCount = useMemo(
    () => availablePlayers.filter(p => !overrideIds.has(p.id)).length,
    [availablePlayers, overrideIds],
  )
  const targetMins = balanceShareCount > 0
    ? Math.max(0, (totalGameMins * 5 - overrideCommittedMins) / balanceShareCount)
    : 0
  const starterCount      = useMemo(() => constraints.filter(c => c.isStarter && !c.unavailable).length, [constraints])
  const closerCount       = useMemo(() => constraints.filter(c => c.isCloser  && !c.unavailable).length, [constraints])
  const everyQCount       = useMemo(() => constraints.filter(c => c.mustPlayEveryQuarter && !c.unavailable).length, [constraints])
  const allEveryQ         = availablePlayers.length > 0 && everyQCount === availablePlayers.length
  const effectiveSubs     = Math.max(0, config.periodDuration - config.noSubFirstMins - config.noSubLastMins)
  const canGenerate       = starterCount <= 5 && closerCount <= 5

  function updateConstraint(playerId: string, update: Partial<PlayerConstraint>) {
    setConstraints(prev => prev.map(c => c.playerId === playerId ? { ...c, ...update } : c))
  }
  function updatePlayer(playerId: string, update: Partial<RotationPlayer>) {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, ...update } : p))
  }
  function toggleOverride(playerId: string, on: boolean) {
    setOverrideIds(prev => {
      const next = new Set(prev)
      if (on) next.add(playerId); else next.delete(playerId)
      return next
    })
  }
  function toggleAllEveryQ() {
    const v = !allEveryQ
    setConstraints(prev => prev.map(c => c.unavailable ? c : { ...c, mustPlayEveryQuarter: v }))
  }
  // The solver runs synchronously on the main thread and can take a noticeable
  // moment, during which the UI would otherwise look frozen. We flip on a
  // "building" flag, then defer the heavy solve with a short timeout so React
  // paints the spinner/banner BEFORE the blocking computation starts.
  function runSolve(): OptimiserResult {
    const totalPlayerMins = config.numPeriods * config.periodDuration * 5

    // When balanceMinutes + overrides coexist: remove committed override mins from the
    // pool and redistribute the remainder evenly across non-override available players.
    if (config.balanceMinutes && overrideIds.size > 0) {
      const unavailIds  = new Set(constraints.filter(c => c.unavailable).map(c => c.playerId))
      const availC      = constraints.filter(c => !unavailIds.has(c.playerId))
      const overrideC   = availC.filter(c => overrideIds.has(c.playerId))
      const nonOvrC     = availC.filter(c => !overrideIds.has(c.playerId))
      const committed   = overrideC.reduce((s, c) => s + c.minMinutes, 0)
      const remaining   = Math.max(0, totalPlayerMins - committed)
      const perPlayer   = nonOvrC.length > 0 ? remaining / nonOvrC.length : 0

      const merged = constraints.map(c => overrideIds.has(c.playerId)
        ? { ...c }
        : {
            ...c,
            minMinutes: Math.floor(perPlayer),
            maxMinutes: Math.ceil(perPlayer) + 2,
          })
      // Values pre-computed — pass balanceMinutes:false so solver doesn't overwrite them
      return solve(players, merged, { ...config, minStintMins, maxQtrImbalance, balanceMinutes: false })
    }

    // Default path
    const merged = constraints.map(c => {
      const hasOverride = overrideIds.has(c.playerId)
      return {
        ...c,
        minMinutes: hasOverride ? c.minMinutes : defaultMin,
        maxMinutes: hasOverride ? c.maxMinutes : defaultMax,
      }
    })
    return solve(players, merged, { ...config, minStintMins, maxQtrImbalance })
  }

  function generate() {
    if (isGenerating) return
    setIsGenerating(true)
    // Defer so the "Building rotation…" state can paint before the blocking solve.
    setTimeout(() => {
      try {
        setResult(runSolve())
      } finally {
        setIsGenerating(false)
      }
    }, 30)
  }

  // Period label for Every Q / table header
  const periodLabel = config.numPeriods === 2 ? 'Every Half' : 'Every Q'

  const canSavePlan = planName.trim().length > 0 && planStatus !== 'saving'

  return (
    <div style={{ color: PRIMARY, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── PLANS ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>PLANS</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>

          {/* Load existing */}
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Saved plans</div>
            <select
              value={planId ?? ''}
              onChange={e => {
                const rec = plans.find(p => p.id === e.target.value)
                if (rec) loadPlan(rec)
              }}
              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: PRIMARY, minWidth: 200 }}
            >
              <option value="">{plans.length ? 'Load a plan…' : 'No saved plans yet'}</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Plan name */}
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Plan name</div>
            <input
              type="text" value={planName} placeholder="e.g. vs Keilor 12.5"
              onChange={e => setPlanName(e.target.value)}
              style={{ width: '100%', background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: PRIMARY }}
            />
          </div>

          {/* Link to game */}
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Link to game (optional)</div>
            <select
              value={planGameId}
              onChange={e => setPlanGameId(e.target.value)}
              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: PRIMARY, minWidth: 180 }}
            >
              <option value="">No game linked</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={handleSavePlan} disabled={!canSavePlan} style={{
              background: canSavePlan ? TEAL : MUTED, color: '#fff', border: 'none', borderRadius: 8,
              padding: '9px 18px', fontSize: 13, fontWeight: 700,
              cursor: canSavePlan ? 'pointer' : 'not-allowed', opacity: canSavePlan ? 1 : 0.5,
            }}>
              {planStatus === 'saving' ? 'Saving…' : planId ? 'Update plan' : 'Save plan'}
            </button>
            {planId && (
              <button onClick={newPlan} style={{
                background: BG, color: SEC, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>New</button>
            )}
            {planId && (
              <button onClick={handleDeletePlan} title="Delete this plan" style={{
                background: BG, color: RED, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Delete</button>
            )}
          </div>
        </div>

        {/* Status line */}
        <div style={{ marginTop: 10, fontSize: 11, minHeight: 16 }}>
          {planStatus === 'saved' && <span style={{ color: GREEN }}>✓ Saved</span>}
          {planStatus === 'error' && <span style={{ color: RED }}>✗ {planError ?? 'Error'}</span>}
          {planStatus === 'idle' && planId && <span style={{ color: MUTED }}>Editing saved plan — “Update plan” overwrites it, “New” starts fresh.</span>}
          {planStatus === 'idle' && !planId && !result && <span style={{ color: MUTED }}>Set constraints, generate a rotation, then save it as a named plan.</span>}
          {planStatus === 'idle' && !planId && result && <span style={{ color: MUTED }}>Name the plan and click Save to store this rotation.</span>}
        </div>
      </div>

      {/* ── GAME SETUP ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>GAME SETUP</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>

          {/* Periods */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Periods</div>
            <ToggleGroup
              options={[{ label: '2 Halves', value: 2 }, { label: '4 Quarters', value: 4 }]}
              value={config.numPeriods}
              onChange={v => updateConfig({ numPeriods: v as number })}
            />
          </div>

          {/* Duration */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Period duration</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ToggleGroup
                options={[{ label: '8 min', value: 8 }, { label: '10 min', value: 10 }, { label: '12 min', value: 12 }]}
                value={[8, 10, 12].includes(config.periodDuration) ? config.periodDuration : -1}
                onChange={v => updateConfig({ periodDuration: v as number })}
              />
              <NumInput value={config.periodDuration} min={4} max={20} width={58}
                onChange={v => updateConfig({ periodDuration: v })} />
              <span style={{ fontSize: 11, color: MUTED }}>min</span>
            </div>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Total game time</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: TEAL, fontVariantNumeric: 'tabular-nums' }}>
              {totalGameMins} min
            </div>
          </div>

          {/* No-sub zones */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>No-sub zones</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: SEC }}>First</span>
              <NumInput value={config.noSubFirstMins} min={0} max={Math.floor(config.periodDuration / 2)} width={52}
                onChange={v => updateConfig({ noSubFirstMins: v })} />
              <span style={{ fontSize: 12, color: SEC }}>· Last</span>
              <NumInput value={config.noSubLastMins} min={0} max={Math.floor(config.periodDuration / 2)} width={52}
                onChange={v => updateConfig({ noSubLastMins: v })} />
              <span style={{ fontSize: 12, color: SEC }}>mins per period</span>
              <span style={{
                fontSize: 10, color: effectiveSubs > 0 ? TEAL : AMBER,
                background: effectiveSubs > 0 ? 'rgba(151,207,220,0.1)' : 'rgba(251,191,36,0.1)',
                border: `1px solid ${effectiveSubs > 0 ? TEAL : AMBER}`,
                borderRadius: 12, padding: '2px 8px',
              }}>
                {effectiveSubs > 0 ? `${effectiveSubs} sub window${effectiveSubs !== 1 ? 's' : ''} per period` : 'No sub windows — subs at period starts only'}
              </span>
            </div>
          </div>

          {/* Min sub gap */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Min gap between subs</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <NumInput value={config.minSubGapMins} min={0} max={config.periodDuration} width={52}
                onChange={v => updateConfig({ minSubGapMins: v })} />
              <span style={{ fontSize: 12, color: SEC }}>mins</span>
              {config.minSubGapMins > 0 && effectiveSubs > 0 && (
                <span style={{
                  fontSize: 10, color: TEAL,
                  background: 'rgba(151,207,220,0.1)',
                  border: `1px solid rgba(151,207,220,0.3)`,
                  borderRadius: 12, padding: '2px 8px',
                }}>
                  max {Math.floor(effectiveSubs / config.minSubGapMins)} sub{Math.floor(effectiveSubs / config.minSubGapMins) !== 1 ? 's' : ''} per period
                </span>
              )}
              {config.minSubGapMins === 0 && (
                <span style={{ fontSize: 10, color: MUTED }}>No gap limit</span>
              )}
            </div>
          </div>

          {/* Min stint time */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Min stint time</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <NumInput value={minStintMins} min={0} max={8} step={1} width={52}
                onChange={v => setMinStintMins(v)} />
              <span style={{ fontSize: 12, color: SEC }}>mins</span>
              {minStintMins === 0 ? (
                <span style={{ fontSize: 10, color: MUTED }}>no limit</span>
              ) : (
                <span style={{ fontSize: 10, color: MUTED }}>{minStintMins} min minimum</span>
              )}
            </div>
          </div>

          {/* Max quarter imbalance — only meaningful with balanceByPeriod on */}
          {config.balanceByPeriod && (
            <div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Max quarter spread</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <NumInput value={maxQtrImbalance} min={0} max={5} step={1} width={52}
                  onChange={v => setMaxQtrImbalance(v)} />
                <span style={{ fontSize: 12, color: SEC }}>min difference</span>
                <span style={{ fontSize: 10, color: MUTED }}>
                  {maxQtrImbalance === 0
                    ? 'strict equal'
                    : maxQtrImbalance <= 2
                      ? `≤${maxQtrImbalance} min spread (rec.)`
                      : `≤${maxQtrImbalance} min spread`}
                </span>
              </div>
            </div>
          )}

          {/* Max players per sub */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Max players per sub</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NumInput value={config.maxStagger} min={1} max={4} width={52}
                onChange={v => updateConfig({ maxStagger: v })} />
              <span style={{ fontSize: 12, color: SEC }}>
                {config.maxStagger === 1 ? '(1 change — very stable)' :
                 config.maxStagger === 4 ? '(4 changes — max flex)' :
                 `(${5 - config.maxStagger} must carry over)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── PLAYING TIME DEFAULTS ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>PLAYING TIME DEFAULTS</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-end' }}>

          {/* Min slider */}
          <div style={{ minWidth: 180, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: MUTED }}>Default min minutes</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                {config.balanceMinutes ? Math.floor(targetMins) : defaultMin} min
              </span>
            </div>
            <Slider value={config.balanceMinutes ? Math.floor(targetMins) : defaultMin}
              min={0} max={totalGameMins} disabled={config.balanceMinutes}
              onChange={v => { setDefaultMin(v); if (v > defaultMax) setDefaultMax(v) }} />
          </div>

          {/* Max slider */}
          <div style={{ minWidth: 180, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: MUTED }}>Default max minutes</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
                {config.balanceMinutes ? Math.ceil(targetMins) + 2 : defaultMax} min
              </span>
            </div>
            <Slider value={config.balanceMinutes ? Math.ceil(targetMins) + 2 : defaultMax}
              min={defaultMin} max={totalGameMins} disabled={config.balanceMinutes}
              onChange={v => setDefaultMax(v)} />
          </div>

          {/* Balance across players toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', background: config.balanceMinutes ? 'rgba(151,207,220,0.08)' : BG,
            border: `1px solid ${config.balanceMinutes ? TEAL : BORDER}`,
            borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          }} onClick={() => updateConfig({ balanceMinutes: !config.balanceMinutes })}>
            <Check checked={config.balanceMinutes} onChange={v => updateConfig({ balanceMinutes: v })} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: config.balanceMinutes ? TEAL : SEC }}>
                Balance across players
              </div>
              {config.balanceMinutes && balanceShareCount > 0 && (
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                  Target: {targetMins.toFixed(1)} min ({balanceShareCount} player{balanceShareCount !== 1 ? 's' : ''} share the balance
                  {overrideCommittedMins > 0 ? `, after ${overrideCommittedMins} min set by overrides` : ''})
                </div>
              )}
            </div>
          </div>

          {/* Balance across periods toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', background: config.balanceByPeriod ? 'rgba(151,207,220,0.08)' : BG,
            border: `1px solid ${config.balanceByPeriod ? TEAL : BORDER}`,
            borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          }} onClick={() => updateConfig({ balanceByPeriod: !config.balanceByPeriod })}>
            <Check checked={config.balanceByPeriod} onChange={v => updateConfig({ balanceByPeriod: v })} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: config.balanceByPeriod ? TEAL : SEC }}>
                Balance by {config.numPeriods === 2 ? 'half' : 'quarter'}
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                Spread each player's mins evenly
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PLAYER CONSTRAINTS ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionLabel>PLAYER CONSTRAINTS</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {/* Position editor toggle */}
            <button onClick={() => setShowPositions(v => !v)} style={{
              background: showPositions ? TEAL : BG, border: `1px solid ${showPositions ? TEAL : BORDER}`,
              borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600,
              color: showPositions ? '#ffffff' : SEC, cursor: 'pointer',
            }}>
              {showPositions ? '✓ Positions' : 'Edit Positions'}
            </button>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: `${starterCount}/5 Starters`, ok: starterCount <= 5 },
            { label: `${closerCount}/5 Closers`,   ok: closerCount <= 5 },
            { label: `${everyQCount} ${periodLabel}`, ok: true, color: TEAL },
          ].map(({ label, ok, color }) => (
            <span key={label} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: `${color ?? (ok ? GREEN : RED)}1a`,
              border: `1px solid ${color ?? (ok ? GREEN : RED)}44`,
              color: color ?? (ok ? GREEN : RED),
            }}>{label}</span>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {[
                  '#', 'Player',
                  ...(showPositions ? ['Positions'] : []),
                  'Override',
                  'Starter', 'Closer',
                ].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
                {/* Every Q with select-all */}
                <th style={{ padding: '7px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {periodLabel}
                    <button onClick={toggleAllEveryQ} style={{
                      background: allEveryQ ? TEAL : BG, border: `1px solid ${allEveryQ ? TEAL : BORDER}`,
                      borderRadius: 4, padding: '1px 5px', fontSize: 8, fontWeight: 700,
                      color: allEveryQ ? '#ffffff' : MUTED, cursor: 'pointer',
                    }}>{allEveryQ ? 'All ✓' : 'All'}</button>
                  </span>
                </th>
                <th style={{ padding: '7px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>Out</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => {
                const c = constraints.find(c => c.playerId === p.id)!
                const hasOvr = overrideIds.has(p.id)
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}`, opacity: c.unavailable ? 0.35 : 1 }}>
                    <td style={{ padding: '9px 10px', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>#{p.jersey}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {p.name}
                      {!showPositions && p.primaryPositions.length > 0 && (
                        <span style={{ marginLeft: 5, fontSize: 10, color: MUTED, fontWeight: 400 }}>
                          {p.primaryPositions.join('/')}
                        </span>
                      )}
                    </td>

                    {showPositions && (() => {
                      const dirty  = isPositionDirty(p)
                      const status = saveStatus[p.id] ?? 'idle'
                      return (
                        <td style={{ padding: '6px 10px' }}>
                          <PositionEditor primary={p.primaryPositions} secondary={p.secondaryPositions}
                            onChange={(pri, sec) => updatePlayer(p.id, { primaryPositions: pri, secondaryPositions: sec })} />
                          {/* Save / status row */}
                          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
                            {status === 'saving' && (
                              <span style={{ fontSize: 9, color: MUTED }}>Saving…</span>
                            )}
                            {status === 'saved' && (
                              <span style={{ fontSize: 9, color: GREEN }}>✓ Saved</span>
                            )}
                            {status === 'error' && (
                              <span style={{ fontSize: 9, color: RED }}>✗ Error</span>
                            )}
                            {status === 'idle' && dirty && (
                              <button
                                onClick={() => handleSavePositions(p)}
                                style={{
                                  fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                  background: TEAL, color: '#ffffff',
                                  border: 'none', borderRadius: 4, cursor: 'pointer',
                                }}
                              >
                                Save
                              </button>
                            )}
                            {status === 'idle' && !dirty && (
                              <span style={{ fontSize: 9, color: MUTED }}>No changes</span>
                            )}
                          </div>
                        </td>
                      )
                    })()}

                    {/* Override column: checkbox + conditional min/max inputs */}
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Check checked={hasOvr} onChange={v => toggleOverride(p.id, v)} />
                        {hasOvr ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9, color: MUTED }}>min</span>
                            <NumInput value={c.minMinutes} min={0} max={c.maxMinutes} width={48}
                              onChange={v => updateConstraint(p.id, { minMinutes: v })} />
                            <span style={{ fontSize: 9, color: MUTED }}>–</span>
                            <NumInput value={c.maxMinutes} min={c.minMinutes} max={totalGameMins} width={48}
                              onChange={v => updateConstraint(p.id, { maxMinutes: v })} />
                            <span style={{ fontSize: 9, color: MUTED }}>max</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 10, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                            {config.balanceMinutes ? `~${Math.floor(targetMins)}` : defaultMin}–{config.balanceMinutes ? Math.ceil(targetMins) + 2 : defaultMax} min
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '9px 10px' }}>
                      <Check checked={c.isStarter} disabled={!c.isStarter && starterCount >= 5}
                        onChange={v => updateConstraint(p.id, { isStarter: v })} />
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <Check checked={c.isCloser} disabled={!c.isCloser && closerCount >= 5}
                        onChange={v => updateConstraint(p.id, { isCloser: v })} />
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <Check checked={c.mustPlayEveryQuarter}
                        onChange={v => updateConstraint(p.id, { mustPlayEveryQuarter: v })} />
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <Check checked={c.unavailable}
                        onChange={v => updateConstraint(p.id, { unavailable: v })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {showPositions && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 10, color: MUTED }}>
            Top chip = primary position. <strong style={{ color: SEC }}>2nd</strong> = secondary (can fill if needed).
            Click <strong style={{ color: TEAL }}>Save</strong> to write positions permanently to the database.
          </div>
        )}
      </div>

      {/* ── Lineup continuity note ── */}
      <div style={{ marginBottom: 16, padding: '9px 14px', background: 'rgba(151,207,220,0.05)', border: `1px solid rgba(151,207,220,0.18)`, borderRadius: 8, fontSize: 11, color: SEC }}>
        <strong style={{ color: TEAL }}>Lineup continuity:</strong> At most {config.maxStagger} player{config.maxStagger !== 1 ? 's' : ''} rotate out between any two consecutive sub windows — at least {5 - config.maxStagger} must carry over. Full lineup resets are allowed at period starts.
      </div>

      {/* ── Errors + generate ── */}
      {starterCount > 5 && <div style={{ marginBottom: 8, color: RED, fontSize: 12 }}>⚠ {starterCount} starters selected — max 5</div>}
      {closerCount  > 5 && <div style={{ marginBottom: 8, color: RED, fontSize: 12 }}>⚠ {closerCount} closers selected — max 5</div>}

      <button onClick={generate} disabled={!canGenerate || isGenerating} style={{
        background: (canGenerate && !isGenerating) ? '#307b92' : MUTED, color: '#fff',
        border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700,
        cursor: (canGenerate && !isGenerating) ? 'pointer' : 'not-allowed', marginBottom: 16,
        opacity: (canGenerate && !isGenerating) ? 1 : 0.5,
        display: 'inline-flex', alignItems: 'center', gap: 10,
      }}>
        {isGenerating && (
          <span className="ciq-spin" style={{
            width: 14, height: 14, border: '2px solid rgba(255,255,255,0.45)',
            borderTopColor: '#ffffff', display: 'inline-block', flexShrink: 0,
          }} />
        )}
        {isGenerating ? 'Building rotation…' : 'Generate Rotation'}
      </button>

      {/* Building banner — makes it clear the optimiser is working, not frozen */}
      {isGenerating && (
        <div style={{
          marginBottom: 28, display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 16px', background: 'rgba(151,207,220,0.1)',
          border: `1px solid ${TEAL}`, borderRadius: 8, fontSize: 12, color: SEC,
        }}>
          <span className="ciq-spin" style={{
            width: 16, height: 16, border: `2px solid rgba(48,123,146,0.3)`,
            borderTopColor: TEAL, display: 'inline-block', flexShrink: 0,
          }} />
          <span><strong style={{ color: TEAL }}>Building rotation…</strong> Optimising minutes, period balance, and sub windows. This can take a few seconds.</span>
        </div>
      )}

      {!isGenerating && result && <RotationGrid result={result} players={players} />}
    </div>
  )
}
