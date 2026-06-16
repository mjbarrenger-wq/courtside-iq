// Rotation Planner — Constraint Solver
// 1 slot per minute, stagger within periods only, locked restricted windows.

import type {
  RotationPlayer, PlayerConstraint, RotationSlot,
  OptimiserResult, ConstraintReport, GameConfig, Position,
} from './types'
import { DEFAULT_GAME_CONFIG, POSITION_GROUP } from './types'

const PER_SLOT    = 5
const MAX_STAGGER = 2

// ── Position helpers ──────────────────────────────────────────────────────────

function allPos(p: RotationPlayer): Position[] {
  return [...p.primaryPositions, ...p.secondaryPositions]
}
function isPerimeter(p: RotationPlayer) {
  return allPos(p).some(pos => POSITION_GROUP[pos] === 'perimeter')
}
function isInterior(p: RotationPlayer) {
  return allPos(p).some(pos => POSITION_GROUP[pos] === 'interior')
}
function hasPerimeter(ids: string[], byId: Map<string, RotationPlayer>) {
  return ids.some(id => { const p = byId.get(id); return p ? isPerimeter(p) : false })
}
function hasInterior(ids: string[], byId: Map<string, RotationPlayer>) {
  return ids.some(id => { const p = byId.get(id); return p ? isInterior(p) : false })
}
function posValid(ids: string[], byId: Map<string, RotationPlayer>) {
  const withPos = ids.filter(id => {
    const p = byId.get(id)
    return p && (p.primaryPositions.length > 0 || p.secondaryPositions.length > 0)
  })
  if (withPos.length === 0) return true
  return hasPerimeter(ids, byId) && hasInterior(ids, byId)
}
function changes(prev: string[], next: string[]) {
  const s = new Set(prev)
  return next.filter(id => !s.has(id)).length
}

// ── Slot helpers ──────────────────────────────────────────────────────────────

function buildSlotOrder(numPeriods: number, periodDuration: number) {
  const order: { quarter: number; window: number }[] = []
  for (let q = 1; q <= numPeriods; q++)
    for (let w = 1; w <= periodDuration; w++)
      order.push({ quarter: q, window: w })
  return order
}

// Is this slot a period boundary (first window of a period > 1)?
function isPeriodStart(i: number, periodDuration: number) {
  return i > 0 && i % periodDuration === 0
}

// Is this window within a restricted zone (no-sub zone)?
// window is 1-based. Returns true if lineup must carry over from previous window.
function isLockedWindow(
  window: number,
  noSubFirstMins: number,
  noSubLastMins: number,
  periodDuration: number,
): boolean {
  if (window === 1) return false  // first window of period = free start
  const inFirst = window <= noSubFirstMins
  const inLast  = window > periodDuration - noSubLastMins
  return inFirst || inLast
}

// ── Urgency ───────────────────────────────────────────────────────────────────

function urgency(
  id: string,
  slotsPlayed: Map<string, number>,
  minSlots: Map<string, number>,
  slotIndex: number,
  totalSlots: number,
): number {
  const played = slotsPlayed.get(id) ?? 0
  const needed = minSlots.get(id) ?? 0
  const still  = Math.max(0, needed - played)
  const left   = totalSlots - slotIndex
  return still === 0 ? 0 : still / left
}

// ── Lineup picker ─────────────────────────────────────────────────────────────

function pickLineup(params: {
  eligible:    RotationPlayer[]
  prevLineup:  string[]
  locked:      string[]
  byId:        Map<string, RotationPlayer>
  slotsPlayed: Map<string, number>
  minSlots:    Map<string, number>
  slotIndex:   number
  totalSlots:  number
  warnings:    string[]
}): string[] {
  const { eligible, prevLineup, locked, byId, slotsPlayed, minSlots, slotIndex, totalSlots, warnings } = params
  const eligSet = new Set(eligible.map(p => p.id))
  const validLocked = locked.filter(id => eligSet.has(id))
  const spotsLeft   = PER_SLOT - validLocked.length

  if (spotsLeft < 0) return validLocked.slice(0, PER_SLOT)

  const candidates = eligible.filter(p => !validLocked.includes(p.id))
  const urg = (id: string) => urgency(id, slotsPlayed, minSlots, slotIndex, totalSlots)

  let carryIds: string[] = []
  let newIds:   string[] = []

  if (prevLineup.length > 0) {
    // Within period: enforce stagger
    const carriable = prevLineup.filter(id => eligSet.has(id) && !validLocked.includes(id))
    const forced    = validLocked.filter(id => !prevLineup.includes(id)).length
    const free      = Math.max(0, MAX_STAGGER - forced)
    const mustCarry = Math.max(0, (PER_SLOT - validLocked.length) - free)

    carryIds = [...carriable]
      .sort((a, b) => urg(b) - urg(a))
      .slice(0, mustCarry)

    const rem     = spotsLeft - carryIds.length
    const others  = candidates.filter(p => !carryIds.includes(p.id))
    newIds = [...others]
      .sort((a, b) => {
        const d = urg(b.id) - urg(a.id)
        if (Math.abs(d) > 0.01) return d
        return (prevLineup.includes(a.id) ? 1 : 0) - (prevLineup.includes(b.id) ? 1 : 0)
      })
      .slice(0, rem)
      .map(p => p.id)
  } else {
    // Period start: free pick
    newIds = [...candidates]
      .sort((a, b) => urg(b.id) - urg(a.id))
      .slice(0, spotsLeft)
      .map(p => p.id)
  }

  let lineup = [...validLocked, ...carryIds, ...newIds]

  if (lineup.length < PER_SLOT) {
    lineup = [
      ...lineup,
      ...candidates
        .filter(p => !lineup.includes(p.id))
        .slice(0, PER_SLOT - lineup.length)
        .map(p => p.id),
    ]
  }
  lineup = lineup.slice(0, PER_SLOT)

  return fixBalance(lineup, eligible, byId, prevLineup, slotIndex, totalSlots, slotsPlayed, minSlots, warnings)
}

function fixBalance(
  lineup:      string[],
  eligible:    RotationPlayer[],
  byId:        Map<string, RotationPlayer>,
  prevLineup:  string[],
  slotIndex:   number,
  totalSlots:  number,
  slotsPlayed: Map<string, number>,
  minSlots:    Map<string, number>,
  warnings:    string[],
): string[] {
  if (posValid(lineup, byId)) return lineup

  const needPerim = !hasPerimeter(lineup, byId)
  const needInter = !hasInterior(lineup, byId)
  const subs = eligible.filter(p => !lineup.includes(p.id) && (
    (needPerim && isPerimeter(p)) || (needInter && isInterior(p))
  ))
  if (subs.length === 0) return lineup

  const removable = lineup.filter(id => {
    const p = byId.get(id)
    if (!p) return true
    if (needPerim && isPerimeter(p)) return false
    if (needInter && isInterior(p))  return false
    return true
  })
  if (removable.length === 0) return lineup

  const urg = (id: string) => urgency(id, slotsPlayed, minSlots, slotIndex, totalSlots)
  const toRemove = removable.sort((a, b) => urg(a) - urg(b))[0]
  const toAdd    = subs.sort((a, b) => urg(b.id) - urg(a.id))[0]

  return lineup.map(id => id === toRemove ? toAdd.id : id)
}

// ── Repairs ───────────────────────────────────────────────────────────────────

function repairMinutes(
  assignments:  string[][],
  slotOrder:    { quarter: number; window: number }[],
  available:    RotationPlayer[],
  byId:         Map<string, RotationPlayer>,
  minSlots:     Map<string, number>,
  maxSlots:     Map<string, number>,
  slotsPlayed:  Map<string, number>,
  cMap:         Map<string, PlayerConstraint>,
  periodDuration: number,
  noSubFirstMins: number,
  noSubLastMins:  number,
  warnings:     string[],
): void {
  const LAST = assignments.length - 1

  for (let iter = 0; iter < 200; iter++) {
    const under = available.find(p => (slotsPlayed.get(p.id) ?? 0) < (minSlots.get(p.id) ?? 0))
    if (!under) break

    let ok = false
    for (let s = 0; s < assignments.length; s++) {
      if (assignments[s].includes(under.id)) continue
      // Don't insert into locked windows (those must carry from prev)
      if (isLockedWindow(slotOrder[s].window, noSubFirstMins, noSubLastMins, periodDuration)) continue

      const swappable = assignments[s]
        .filter(id => {
          const c = cMap.get(id)
          if (s === 0    && c?.isStarter) return false
          if (s === LAST && c?.isCloser)  return false
          return id !== under.id
        })
        .sort((a, b) =>
          (slotsPlayed.get(a) ?? 0) / (maxSlots.get(a) ?? 1) -
          (slotsPlayed.get(b) ?? 0) / (maxSlots.get(b) ?? 1)
        )

      if (!swappable.length) continue
      const toRemove  = swappable[swappable.length - 1] // remove most-played
      const newLineup = assignments[s].map(id => id === toRemove ? under.id : id)

      const pStart = isPeriodStart(s, periodDuration)
      const nStart = s < LAST && isPeriodStart(s + 1, periodDuration)
      const prevOk = s === 0 || pStart || changes(assignments[s-1], newLineup) <= MAX_STAGGER
      const nextOk = s === LAST || nStart || changes(newLineup, assignments[s+1]) <= MAX_STAGGER

      if (!prevOk || !nextOk) continue
      if (!posValid(newLineup, byId)) continue

      assignments[s] = newLineup
      slotsPlayed.set(under.id, (slotsPlayed.get(under.id) ?? 0) + 1)
      slotsPlayed.set(toRemove, Math.max(0, (slotsPlayed.get(toRemove) ?? 0) - 1))
      ok = true
      break
    }

    if (!ok) {
      warnings.push(`${under.name} could not reach minimum minutes — constraints may be over-specified`)
      break
    }
  }
}

function repairEveryQuarter(
  assignments:    string[][],
  slotOrder:      { quarter: number; window: number }[],
  available:      RotationPlayer[],
  byId:           Map<string, RotationPlayer>,
  cMap:           Map<string, PlayerConstraint>,
  slotsPlayed:    Map<string, number>,
  minSlots:       Map<string, number>,
  numPeriods:     number,
  periodDuration: number,
  noSubFirstMins: number,
  noSubLastMins:  number,
  warnings:       string[],
): void {
  const LAST  = assignments.length - 1
  const everyQ = available.filter(p => cMap.get(p.id)?.mustPlayEveryQuarter)

  for (const player of everyQ) {
    for (let q = 1; q <= numPeriods; q++) {
      const qIdxs = slotOrder.map((s, i) => ({ ...s, i })).filter(s => s.quarter === q)
      if (qIdxs.some(s => assignments[s.i].includes(player.id))) continue

      // Try to insert into a non-locked window in this period
      let inserted = false
      for (const { i } of qIdxs) {
        if (isLockedWindow(slotOrder[i].window, noSubFirstMins, noSubLastMins, periodDuration)) continue

        const swappable = assignments[i]
          .filter(id => {
            const c = cMap.get(id)
            if (i === 0    && c?.isStarter) return false
            if (i === LAST && c?.isCloser)  return false
            return true
          })
          .sort((a, b) =>
            (slotsPlayed.get(a) ?? 0) - (slotsPlayed.get(b) ?? 0)
          )

        if (!swappable.length) continue
        const toRemove  = swappable[swappable.length - 1]
        const newLineup = assignments[i].map(id => id === toRemove ? player.id : id)

        const pStart = isPeriodStart(i, periodDuration)
        const nStart = i < LAST && isPeriodStart(i + 1, periodDuration)
        const prevOk = i === 0 || pStart || changes(assignments[i-1], newLineup) <= MAX_STAGGER
        const nextOk = i === LAST || nStart || changes(newLineup, assignments[i+1]) <= MAX_STAGGER

        if (!prevOk || !nextOk) continue
        if (!posValid(newLineup, byId)) continue

        assignments[i] = newLineup
        slotsPlayed.set(player.id, (slotsPlayed.get(player.id) ?? 0) + 1)
        slotsPlayed.set(toRemove, Math.max(0, (slotsPlayed.get(toRemove) ?? 0) - 1))
        inserted = true
        break
      }

      if (!inserted) {
        warnings.push(`${player.name} could not be placed in period ${q} — every-period constraint unmet`)
      }
    }
  }
}

// ── Sub call counter ──────────────────────────────────────────────────────────

export function countSubCalls(
  slots: RotationSlot[],
  numPeriods: number,
): { total: number; perQuarter: number[] } {
  const perQuarter = Array(numPeriods).fill(0)
  let total = 0
  for (let i = 1; i < slots.length; i++) {
    if (slots[i].quarter !== slots[i-1].quarter) continue
    const prevSet = new Set(slots[i-1].playerIds)
    const n = slots[i].playerIds.filter(id => !prevSet.has(id)).length
    if (n > 0) {
      total++
      perQuarter[slots[i].quarter - 1]++
    }
  }
  return { total, perQuarter }
}

// ── Main solver ───────────────────────────────────────────────────────────────

export function solve(
  players:     RotationPlayer[],
  constraints: PlayerConstraint[],
  config:      GameConfig = DEFAULT_GAME_CONFIG,
): OptimiserResult {
  const {
    numPeriods, periodDuration,
    noSubFirstMins, noSubLastMins,
    balanceMinutes,
  } = config

  const TOTAL_SLOTS = numPeriods * periodDuration
  const LAST = TOTAL_SLOTS - 1
  const warnings: string[] = []

  const byId  = new Map(players.map(p => [p.id, p]))
  const cMap  = new Map(constraints.map(c => [c.playerId, c]))
  const available = players.filter(p => !(cMap.get(p.id)?.unavailable ?? false))

  const slotOrder = buildSlotOrder(numPeriods, periodDuration)

  // ── Feasibility ─────────────────────────────────────────────────────────────

  if (available.length < 5) {
    return {
      feasible: false, plan: [], constraintReport: [],
      totalSubCalls: 0, subCallsPerQuarter: Array(numPeriods).fill(0),
      warnings: [`Only ${available.length} available — need at least 5`], config,
    }
  }

  // Balance minutes: compute equal-time target
  const totalPlayerMins = numPeriods * periodDuration * PER_SLOT
  const targetMins      = totalPlayerMins / available.length

  const minSlots = new Map(available.map(p => {
    const c    = cMap.get(p.id)
    const mins = balanceMinutes
      ? Math.max(0, Math.floor(targetMins))
      : (c?.minMinutes ?? 10)
    return [p.id, Math.ceil(mins)]
  }))

  const maxSlots = new Map(available.map(p => {
    const c    = cMap.get(p.id)
    const mins = balanceMinutes
      ? Math.min(numPeriods * periodDuration, Math.ceil(targetMins) + 2)
      : (c?.maxMinutes ?? numPeriods * periodDuration)
    return [p.id, Math.min(TOTAL_SLOTS, Math.floor(mins))]
  }))

  const totalReq = [...minSlots.values()].reduce((s, n) => s + n, 0)
  if (totalReq > TOTAL_SLOTS * PER_SLOT) {
    warnings.push(`Minimum minutes exceed capacity — some players will fall short`)
  }

  const noPosPlayers = available.filter(p =>
    p.primaryPositions.length === 0 && p.secondaryPositions.length === 0
  )
  if (noPosPlayers.length) {
    warnings.push(`${noPosPlayers.map(p => p.firstName).join(', ')} have no positions set — skipping position balance checks for them`)
  }

  // Restricted zone feedback
  const effectiveSubWindows = periodDuration - noSubFirstMins - noSubLastMins
  if (effectiveSubWindows < 1) {
    warnings.push(`No-sub zones cover the entire period — subs will only happen at period starts`)
  }

  // ── Locked players ───────────────────────────────────────────────────────────

  const starterIds = available.filter(p => cMap.get(p.id)?.isStarter).map(p => p.id)
  const closerIds  = available.filter(p => cMap.get(p.id)?.isCloser).map(p => p.id)

  // ── Greedy assignment ────────────────────────────────────────────────────────

  const assignments: string[][] = []
  const slotsPlayed = new Map(available.map(p => [p.id, 0]))

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const { quarter, window } = slotOrder[i]
    const periodStart = isPeriodStart(i, periodDuration)
    const locked_window = i > 0 && isLockedWindow(window, noSubFirstMins, noSubLastMins, periodDuration)

    if (locked_window) {
      // Carry over previous lineup unchanged (restricted zone)
      const prev = assignments[i - 1]
      assignments.push([...prev])
      prev.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1))
      continue
    }

    // At period start: free reset (no stagger from previous period)
    const prevLineup = periodStart ? [] : (i > 0 ? assignments[i - 1] : [])

    const eligible = available.filter(p => {
      const played = slotsPlayed.get(p.id) ?? 0
      const max    = maxSlots.get(p.id) ?? TOTAL_SLOTS
      return played < max
    })

    const locked: string[] = []
    if (i === 0)    locked.push(...starterIds.slice(0, PER_SLOT))
    if (i === LAST) locked.push(...closerIds.slice(0, PER_SLOT).filter(id => !locked.includes(id)))

    const lineup = pickLineup({
      eligible, prevLineup, locked, byId, slotsPlayed, minSlots,
      slotIndex: i, totalSlots: TOTAL_SLOTS, warnings,
    })

    lineup.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1))
    assignments.push(lineup)
  }

  // ── Repairs ──────────────────────────────────────────────────────────────────

  repairMinutes(
    assignments, slotOrder, available, byId, minSlots, maxSlots,
    slotsPlayed, cMap, periodDuration, noSubFirstMins, noSubLastMins, warnings,
  )

  repairEveryQuarter(
    assignments, slotOrder, available, byId, cMap, slotsPlayed, minSlots,
    numPeriods, periodDuration, noSubFirstMins, noSubLastMins, warnings,
  )

  // ── Output ───────────────────────────────────────────────────────────────────

  const plan: RotationSlot[] = slotOrder.map(({ quarter, window }, i) => ({
    quarter, window, playerIds: assignments[i] ?? [],
  }))

  const { total, perQuarter } = countSubCalls(plan, numPeriods)

  const constraintReport: ConstraintReport[] = available.map(p => {
    const c         = cMap.get(p.id)
    const played    = slotsPlayed.get(p.id) ?? 0
    const minsAssigned = played  // 1 slot = 1 minute
    const minMins   = c?.minMinutes ?? 0
    const qPlayed   = [...new Set(
      slotOrder.filter((_, i) => assignments[i]?.includes(p.id)).map(s => s.quarter)
    )].sort((a, b) => a - b)
    const starterMet = !c?.isStarter || (assignments[0]?.includes(p.id) ?? false)
    const closerMet  = !c?.isCloser  || (assignments[LAST]?.includes(p.id) ?? false)
    const everyQMet  = !c?.mustPlayEveryQuarter ||
      Array.from({ length: numPeriods }, (_, i) => i + 1).every(q => qPlayed.includes(q))

    return {
      playerId: p.id, name: p.name,
      minutesAssigned: minsAssigned,
      minMinutesMet: minsAssigned >= minMins,
      quartersPlayed: qPlayed,
      everyQuarterMet: everyQMet,
      starterMet, closerMet,
    }
  })

  const feasible = constraintReport.every(r =>
    r.minMinutesMet && r.starterMet && r.closerMet && r.everyQuarterMet
  )

  return { feasible, plan, constraintReport, totalSubCalls: total, subCallsPerQuarter: perQuarter, warnings, config }
}
