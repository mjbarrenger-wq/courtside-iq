// Rotation Planner — Multi-start Constraint Solver
// Architecture: multi-start randomised greedy → score → local search → best result

import type {
  RotationPlayer, PlayerConstraint, RotationSlot,
  OptimiserResult, ConstraintReport, GameConfig, Position,
} from './types'
import { DEFAULT_GAME_CONFIG, POSITION_GROUP } from './types'

const PER_SLOT    = 5
const MAX_STAGGER = 2
const NUM_STARTS  = 80   // random restarts
const LOCAL_ITERS = 30   // hill-climbing passes per start (each pass = one accepted improvement)

// ── Score weights ─────────────────────────────────────────────────────────────

const W = {
  minMinutes:    120,  // per missing minute (hard)
  maxMinutes:    15,   // per excess minute (soft)
  starterMiss:   600,  // flat per player (hard)
  closerMiss:    600,  // flat per player (hard)
  everyPeriod:   250,  // per period missed (hard)
  posBalance:    40,   // per slot with invalid position mix (hard)
  subCall:       3,    // per sub call to ref (soft — minimise)
  timeVariance:  6,    // per minute deviation from target across players (balanceMinutes)
  periodBalance: 50,   // per minute deviation from per-period target per player (balanceByPeriod)
}

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

function isPeriodStart(i: number, periodDuration: number) {
  return i > 0 && i % periodDuration === 0
}

function isLockedWindow(
  window: number,
  noSubFirstMins: number,
  noSubLastMins: number,
  periodDuration: number,
): boolean {
  if (window === 1) return false
  const inFirst = window <= noSubFirstMins
  const inLast  = window > periodDuration - noSubLastMins
  return inFirst || inLast
}

function isGapLocked(window: number, lastSubWindow: number, minSubGapMins: number): boolean {
  if (minSubGapMins <= 0 || lastSubWindow === 0) return false
  return window < lastSubWindow + minSubGapMins
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

// ── Lineup picker (with optional random jitter for multi-start) ───────────────

function pickLineup(params: {
  eligible:            RotationPlayer[]
  prevLineup:          string[]
  locked:              string[]
  byId:                Map<string, RotationPlayer>
  slotsPlayed:         Map<string, number>
  minSlots:            Map<string, number>
  slotIndex:           number
  totalSlots:          number
  jitter:              number
  // Period balance (optional — only passed when balanceByPeriod is on)
  periodPlayed?:       Map<string, number>   // slots played so far in current period
  periodMinTarget?:    Map<string, number>   // target slots per period per player
  windowsLeftInPeriod?: number
  warnings:            string[]
}): string[] {
  const {
    eligible, prevLineup, locked, byId, slotsPlayed, minSlots,
    slotIndex, totalSlots, jitter,
    periodPlayed, periodMinTarget, windowsLeftInPeriod,
    warnings,
  } = params
  const eligSet = new Set(eligible.map(p => p.id))
  const validLocked = locked.filter(id => eligSet.has(id))
  const spotsLeft   = PER_SLOT - validLocked.length

  if (spotsLeft < 0) return validLocked.slice(0, PER_SLOT)

  const candidates = eligible.filter(p => !validLocked.includes(p.id))

  // Blended urgency: global urgency + bidirectional period signal (when balanceByPeriod on)
  // "Behind period target" → positive boost; "Ahead of period target" → negative penalty.
  // Bidirectional means the algorithm actively rotates over-period players off, not just
  // pulls under-period players on.
  const urg = (id: string) => {
    const base = urgency(id, slotsPlayed, minSlots, slotIndex, totalSlots)
    let periodScore = 0
    if (periodPlayed && periodMinTarget && windowsLeftInPeriod && windowsLeftInPeriod > 0) {
      const inPeriod = periodPlayed.get(id) ?? 0
      const target   = periodMinTarget.get(id) ?? 0
      const diff     = inPeriod - target   // positive = ahead of target, negative = behind
      // Bidirectional: behind → positive boost; ahead → negative penalty.
      // Strength 2.5 ensures period balance dominates sub-call-minimisation noise.
      periodScore = Math.max(-1.5, -(diff / Math.max(1, windowsLeftInPeriod))) * 2.5
    }
    return base + periodScore + (jitter > 0 ? Math.random() * jitter : 0)
  }

  let carryIds: string[] = []
  let newIds:   string[] = []

  if (prevLineup.length > 0) {
    const carriable  = prevLineup.filter(id => eligSet.has(id) && !validLocked.includes(id))
    const forced     = validLocked.filter(id => !prevLineup.includes(id)).length
    const free       = Math.max(0, MAX_STAGGER - forced)
    const mustCarry  = Math.max(0, (PER_SLOT - validLocked.length) - free)

    carryIds = [...carriable].sort((a, b) => urg(b) - urg(a)).slice(0, mustCarry)

    // Position-aware sub selection:
    // Primary position match → strong bonus (0.4). Secondary position match → small bonus (0.15).
    // Secondary is only a fallback — primary holders are strongly preferred.
    // Soft bonus only — doesn't hard-block players who urgently need minutes.
    const outgoing = prevLineup.filter(id => !carryIds.includes(id) && !validLocked.includes(id))
    const vacatedGroups = new Set<string>()
    outgoing.forEach(id => {
      const p = byId.get(id)
      if (p) allPos(p).forEach(pos => vacatedGroups.add(POSITION_GROUP[pos]))
    })
    const posBonus = (id: string): number => {
      if (vacatedGroups.size === 0) return 0
      const p = byId.get(id)
      if (!p) return 0
      const primaryMatch   = p.primaryPositions.some(pos => vacatedGroups.has(POSITION_GROUP[pos]))
      const secondaryMatch = p.secondaryPositions.some(pos => vacatedGroups.has(POSITION_GROUP[pos]))
      return primaryMatch ? 0.4 : secondaryMatch ? 0.15 : 0
    }

    const rem    = spotsLeft - carryIds.length
    const others = candidates.filter(p => !carryIds.includes(p.id))
    newIds = [...others]
      .sort((a, b) => (urg(b.id) + posBonus(b.id)) - (urg(a.id) + posBonus(a.id)))
      .slice(0, rem)
      .map(p => p.id)
  } else {
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

  return fixBalance(lineup.slice(0, PER_SLOT), eligible, byId, prevLineup, slotIndex, totalSlots, slotsPlayed, minSlots, warnings)
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
  assignments:    string[][],
  slotOrder:      { quarter: number; window: number }[],
  available:      RotationPlayer[],
  byId:           Map<string, RotationPlayer>,
  minSlots:       Map<string, number>,
  maxSlots:       Map<string, number>,
  slotsPlayed:    Map<string, number>,
  cMap:           Map<string, PlayerConstraint>,
  periodDuration: number,
  noSubFirstMins: number,
  noSubLastMins:  number,
  warnings:       string[],
): void {
  const LAST = assignments.length - 1
  for (let iter = 0; iter < 300; iter++) {
    const under = available.find(p => (slotsPlayed.get(p.id) ?? 0) < (minSlots.get(p.id) ?? 0))
    if (!under) break

    let ok = false
    for (let s = 0; s < assignments.length; s++) {
      if (assignments[s].includes(under.id)) continue
      if (isLockedWindow(slotOrder[s].window, noSubFirstMins, noSubLastMins, periodDuration)) continue

      const swappable = assignments[s]
        .filter(id => {
          const c = cMap.get(id)
          if (s === 0    && c?.isStarter) return false
          if (s === LAST && c?.isCloser)  return false
          return true
        })
        .sort((a, b) =>
          (slotsPlayed.get(b) ?? 0) / (maxSlots.get(b) ?? 1) -
          (slotsPlayed.get(a) ?? 0) / (maxSlots.get(a) ?? 1)
        )

      if (!swappable.length) continue
      const toRemove  = swappable[0]
      const newLineup = assignments[s].map(id => id === toRemove ? under.id : id)

      const pStart = isPeriodStart(s, periodDuration)
      const nStart = s < LAST && isPeriodStart(s + 1, periodDuration)
      const prevOk = s === 0 || pStart || changes(assignments[s-1], newLineup) <= MAX_STAGGER
      const nextOk = s === LAST || nStart || changes(newLineup, assignments[s+1]) <= MAX_STAGGER
      if (!prevOk || !nextOk || !posValid(newLineup, byId)) continue

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
          .sort((a, b) => (slotsPlayed.get(a) ?? 0) - (slotsPlayed.get(b) ?? 0))

        if (!swappable.length) continue
        const toRemove  = swappable[swappable.length - 1]
        const newLineup = assignments[i].map(id => id === toRemove ? player.id : id)

        const pStart = isPeriodStart(i, periodDuration)
        const nStart = i < LAST && isPeriodStart(i + 1, periodDuration)
        const prevOk = i === 0 || pStart || changes(assignments[i-1], newLineup) <= MAX_STAGGER
        const nextOk = i === LAST || nStart || changes(newLineup, assignments[i+1]) <= MAX_STAGGER
        if (!prevOk || !nextOk || !posValid(newLineup, byId)) continue

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

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreAssignments(
  assignments:  string[][],
  slotOrder:    { quarter: number; window: number }[],
  available:    RotationPlayer[],
  byId:         Map<string, RotationPlayer>,
  cMap:         Map<string, PlayerConstraint>,
  minSlots:     Map<string, number>,
  maxSlots:     Map<string, number>,
  config:       GameConfig,
): number {
  let score = 0
  const LAST = assignments.length - 1

  // Accumulate slots played per player
  const played = new Map(available.map(p => [p.id, 0]))
  assignments.forEach(lineup => lineup.forEach(id => played.set(id, (played.get(id) ?? 0) + 1)))

  for (const p of available) {
    const c   = cMap.get(p.id)
    const got = played.get(p.id) ?? 0
    const min = minSlots.get(p.id) ?? 0
    const max = maxSlots.get(p.id) ?? 9999

    // Min minutes (hard)
    if (got < min) score -= (min - got) * W.minMinutes
    // Max minutes (soft)
    if (got > max) score -= (got - max) * W.maxMinutes

    // Starter / closer (hard)
    if (c?.isStarter && !(assignments[0]?.includes(p.id)))    score -= W.starterMiss
    if (c?.isCloser  && !(assignments[LAST]?.includes(p.id))) score -= W.closerMiss

    // Every period (hard)
    if (c?.mustPlayEveryQuarter) {
      for (let q = 1; q <= config.numPeriods; q++) {
        const inQ = slotOrder.some((s, i) => s.quarter === q && assignments[i]?.includes(p.id))
        if (!inQ) score -= W.everyPeriod
      }
    }
  }

  // Position balance per slot (hard)
  for (const lineup of assignments) {
    if (!posValid(lineup, byId)) score -= W.posBalance
  }

  // Sub count (soft — minimise)
  for (let i = 1; i < assignments.length; i++) {
    if (slotOrder[i].quarter !== slotOrder[i-1].quarter) continue
    const prevSet = new Set(assignments[i-1])
    const n = assignments[i].filter(id => !prevSet.has(id)).length
    if (n > 0) score -= W.subCall
  }

  // Playing time variance across players (soft — balanceMinutes)
  if (config.balanceMinutes && available.length > 0) {
    const target = (config.numPeriods * config.periodDuration * PER_SLOT) / available.length
    for (const p of available) {
      score -= Math.abs((played.get(p.id) ?? 0) - target) * W.timeVariance
    }
  }

  // Per-period balance per player (soft — balanceByPeriod)
  // Penalises uneven period load, e.g. 8min Q1 + 2min Q2 vs 5+5
  if (config.balanceByPeriod) {
    for (const p of available) {
      const total = played.get(p.id) ?? 0
      if (total === 0) continue
      const targetPerPeriod = total / config.numPeriods
      for (let q = 1; q <= config.numPeriods; q++) {
        const minsInQ = slotOrder.filter((s, i) => s.quarter === q && assignments[i]?.includes(p.id)).length
        score -= Math.abs(minsInQ - targetPerPeriod) * W.periodBalance
      }
    }
  }

  return score
}

// ── Freeze enforcement ────────────────────────────────────────────────────────
// Re-sweeps assignments after all modifications (repairs, local search) and
// re-applies no-sub zone + gap constraints from scratch.
// Fixes phantom subs caused by local search modifying a slot whose gap-locked
// downstream slots still carry the old lineup.

function enforceFreeze(
  assignments: string[][],
  slotOrder:   { quarter: number; window: number }[],
  config:      GameConfig,
): void {
  const { periodDuration, noSubFirstMins, noSubLastMins, minSubGapMins } = config
  const lastSubWindow = new Map<number, number>()  // quarter → last sub window

  for (let i = 1; i < assignments.length; i++) {
    const { quarter, window } = slotOrder[i]
    const periodStart = isPeriodStart(i, periodDuration)

    if (periodStart) {
      lastSubWindow.set(quarter, 0)
      continue  // period starts are always free to change
    }

    const noSubZone = isLockedWindow(window, noSubFirstMins, noSubLastMins, periodDuration)
    const gapZone   = isGapLocked(window, lastSubWindow.get(quarter) ?? 0, minSubGapMins)

    if (noSubZone || gapZone) {
      // Force carry from previous slot
      assignments[i] = [...assignments[i - 1]]
    } else {
      // Free window — detect whether a sub actually occurred and update gap tracker
      const prevSet = new Set(assignments[i - 1])
      const subHappened = assignments[i].some(id => !prevSet.has(id))
      if (subHappened) lastSubWindow.set(quarter, window)
    }
  }
}

// ── Local search (hill-climbing single-slot substitutions) ───────────────────

function localSearch(
  assignments:    string[][],
  slotOrder:      { quarter: number; window: number }[],
  available:      RotationPlayer[],
  byId:           Map<string, RotationPlayer>,
  cMap:           Map<string, PlayerConstraint>,
  minSlots:       Map<string, number>,
  maxSlots:       Map<string, number>,
  config:         GameConfig,
  frozenSlots:    boolean[],  // which slots are frozen (locked/gap)
): string[][] {
  const { numPeriods, periodDuration } = config
  const LAST   = assignments.length - 1
  const availIds = new Set(available.map(p => p.id))

  let current      = assignments.map(l => [...l])
  let currentScore = scoreAssignments(current, slotOrder, available, byId, cMap, minSlots, maxSlots, config)

  for (let pass = 0; pass < LOCAL_ITERS; pass++) {
    let improved = false

    for (let s = 0; s < current.length; s++) {
      if (frozenSlots[s]) continue

      for (const onId of [...current[s]]) {
        const c = cMap.get(onId)
        if (s === 0    && c?.isStarter) continue
        if (s === LAST && c?.isCloser)  continue

        // Try each bench player as replacement
        const bench = available.filter(p =>
          !current[s].includes(p.id) &&
          (maxSlots.get(p.id) ?? 9999) > (current.map(l => l.filter(x => x === p.id).length).reduce((a, b) => a + b, 0))
        )

        for (const sub of bench) {
          const candidate = current[s].map(id => id === onId ? sub.id : id)

          // Stagger check with neighbours
          const pStart = isPeriodStart(s, periodDuration)
          const nStart = s < LAST && isPeriodStart(s + 1, periodDuration)
          const prevOk = s === 0 || pStart || changes(current[s-1], candidate) <= MAX_STAGGER
          const nextOk = s === LAST || nStart || changes(candidate, current[s+1]) <= MAX_STAGGER
          if (!prevOk || !nextOk) continue
          if (!posValid(candidate, byId)) continue

          // Evaluate
          const trial = current.map((l, i) => i === s ? candidate : [...l])
          const trialScore = scoreAssignments(trial, slotOrder, available, byId, cMap, minSlots, maxSlots, config)

          if (trialScore > currentScore) {
            current      = trial
            currentScore = trialScore
            improved     = true
            break  // restart inner loops with new assignment
          }
        }
        if (improved) break
      }
      if (improved) break
    }

    if (!improved) break
  }

  return current
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

// ── Single greedy pass ────────────────────────────────────────────────────────

function solveOnce(
  players:     RotationPlayer[],
  constraints: PlayerConstraint[],
  config:      GameConfig,
  jitter:      number,
): { assignments: string[][]; frozenSlots: boolean[]; slotsPlayed: Map<string, number>; warnings: string[] } {
  const {
    numPeriods, periodDuration,
    noSubFirstMins, noSubLastMins, minSubGapMins,
  } = config

  const TOTAL_SLOTS = numPeriods * periodDuration
  const LAST        = TOTAL_SLOTS - 1
  const warnings: string[] = []
  const byId  = new Map(players.map(p => [p.id, p]))
  const cMap  = new Map(constraints.map(c => [c.playerId, c]))
  const available = players.filter(p => !(cMap.get(p.id)?.unavailable ?? false))

  const slotOrder = buildSlotOrder(numPeriods, periodDuration)
  const totalPlayerMins = numPeriods * periodDuration * PER_SLOT
  const targetMins      = totalPlayerMins / available.length

  const minSlots = new Map(available.map(p => {
    const c    = cMap.get(p.id)
    const mins = config.balanceMinutes ? Math.floor(targetMins) : (c?.minMinutes ?? 10)
    return [p.id, Math.ceil(mins)]
  }))
  const maxSlots = new Map(available.map(p => {
    const c    = cMap.get(p.id)
    const mins = config.balanceMinutes
      ? Math.min(numPeriods * periodDuration, Math.ceil(targetMins) + 2)
      : (c?.maxMinutes ?? numPeriods * periodDuration)
    return [p.id, Math.min(TOTAL_SLOTS, Math.floor(mins))]
  }))

  const starterIds = available.filter(p => cMap.get(p.id)?.isStarter).map(p => p.id)
  const closerIds  = available.filter(p => cMap.get(p.id)?.isCloser).map(p => p.id)

  const assignments: string[][] = []
  const frozenSlots: boolean[]  = []
  const slotsPlayed = new Map(available.map(p => [p.id, 0]))
  const lastSubWindowByPeriod = new Map<number, number>()

  // Per-period balance tracking (only used when balanceByPeriod is on)
  const slotsPlayedThisPeriod = new Map(available.map(p => [p.id, 0]))

  const periodTargets = new Map<string, number>()   // target slots for current period
  const periodCaps    = new Map<string, number>()   // max slots for current period

  // Adaptive period budgets, recalculated at each period start.
  //
  // Sub constraints create fixed-size "chunks" per period. With noSubFirst=2, noSubLast=2,
  // minSubGap=2 in a 10-min period the chunks are [2, 2, 2, 4] minutes — achievable per-period
  // totals are only {2, 4, 6, 8, 10}, never exactly 5.
  //
  // A hard cap of exactly 5 would prevent players from playing 6, leaving them stuck at 4
  // per quarter (16 total instead of 20). The cap must be the NEXT ACHIEVABLE VALUE above
  // the floating target: for target=5 with minSubGapMins=2, cap = ceil(5/2)*2 = 6.
  // Players then get 4+6+4+6=20 or 6+4+6+4=20 — balanced and hitting target. ✓
  //
  // Adaptive recomputation means a player who overplayed in Q1 gets a lower target in Q2
  // (remaining / periodsLeft), and the urgency signal naturally compensates.
  function recomputePeriodBudgets(currentQ: number) {
    if (!config.balanceByPeriod) return
    const periodsLeft = numPeriods - currentQ + 1
    const chunkSize   = Math.max(1, config.minSubGapMins)
    available.forEach(p => {
      const totalPlayed = slotsPlayed.get(p.id) ?? 0
      const remaining   = Math.max(0, (minSlots.get(p.id) ?? 0) - totalPlayed)
      const target      = remaining / periodsLeft
      periodTargets.set(p.id, target)
      // Round cap UP to nearest achievable chunk boundary — never blocks players
      // from reaching their full-game target despite chunk-size constraints.
      const cap = Math.max(chunkSize, Math.ceil(target / chunkSize) * chunkSize)
      periodCaps.set(p.id, cap)
    })
  }

  // Initial computation before Q1
  recomputePeriodBudgets(1)

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const { quarter, window } = slotOrder[i]
    const periodStart = isPeriodStart(i, periodDuration)

    if (periodStart) {
      lastSubWindowByPeriod.set(quarter, 0)
      // Reset per-period minute tracking and recompute adaptive targets
      slotsPlayedThisPeriod.forEach((_, id) => slotsPlayedThisPeriod.set(id, 0))
      recomputePeriodBudgets(quarter)
    }

    const noSubZone = i > 0 && isLockedWindow(window, noSubFirstMins, noSubLastMins, periodDuration)
    const gapZone   = !periodStart && i > 0 && isGapLocked(window, lastSubWindowByPeriod.get(quarter) ?? 0, minSubGapMins)

    if (noSubZone || gapZone) {
      const prev = assignments[i - 1]
      assignments.push([...prev])
      frozenSlots.push(true)
      prev.forEach(id => {
        slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1)
        slotsPlayedThisPeriod.set(id, (slotsPlayedThisPeriod.get(id) ?? 0) + 1)
      })
      continue
    }

    frozenSlots.push(false)
    const prevLineup = periodStart ? [] : (i > 0 ? assignments[i - 1] : [])

    const eligible = available.filter(p => {
      const played = slotsPlayed.get(p.id) ?? 0
      const max    = maxSlots.get(p.id) ?? TOTAL_SLOTS
      if (played >= max) return false
      // Adaptive per-period cap: prevents a player spending their entire budget in one period
      if (config.balanceByPeriod) {
        const inPeriod  = slotsPlayedThisPeriod.get(p.id) ?? 0
        const cap       = periodCaps.get(p.id) ?? periodDuration
        if (inPeriod >= cap) return false
      }
      return true
    })

    const locked: string[] = []
    if (i === 0)    locked.push(...starterIds.slice(0, PER_SLOT))
    if (i === LAST) locked.push(...closerIds.slice(0, PER_SLOT).filter(id => !locked.includes(id)))

    // Windows remaining in this period (for period urgency weighting)
    const windowsLeftInPeriod = periodDuration - window + 1

    const lineup = pickLineup({
      eligible, prevLineup, locked, byId, slotsPlayed, minSlots,
      slotIndex: i, totalSlots: TOTAL_SLOTS, jitter,
      periodPlayed:        config.balanceByPeriod ? slotsPlayedThisPeriod : undefined,
      periodMinTarget:     config.balanceByPeriod ? periodTargets : undefined,
      windowsLeftInPeriod: config.balanceByPeriod ? windowsLeftInPeriod : undefined,
      warnings,
    })

    if (prevLineup.length > 0 && changes(prevLineup, lineup) > 0) {
      lastSubWindowByPeriod.set(quarter, window)
    } else if (window === 1 && i > 0) {
      const lastPeriodLast = assignments[i - 1]
      if (lastPeriodLast.length > 0 && changes(lastPeriodLast, lineup) > 0) {
        lastSubWindowByPeriod.set(quarter, window)
      }
    }

    lineup.forEach(id => {
      slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1)
      slotsPlayedThisPeriod.set(id, (slotsPlayedThisPeriod.get(id) ?? 0) + 1)
    })
    assignments.push(lineup)
  }

  // Repairs
  const byId2  = new Map(players.map(p => [p.id, p]))
  const cMap2  = new Map(constraints.map(c => [c.playerId, c]))
  repairMinutes(
    assignments, slotOrder, available, byId2, minSlots, maxSlots,
    slotsPlayed, cMap2, periodDuration, noSubFirstMins, noSubLastMins, warnings,
  )
  repairEveryQuarter(
    assignments, slotOrder, available, byId2, cMap2, slotsPlayed, minSlots,
    numPeriods, periodDuration, noSubFirstMins, noSubLastMins, warnings,
  )

  return { assignments, frozenSlots, slotsPlayed, warnings }
}

// ── Main solver (multi-start) ─────────────────────────────────────────────────

export function solve(
  players:     RotationPlayer[],
  constraints: PlayerConstraint[],
  config:      GameConfig = DEFAULT_GAME_CONFIG,
): OptimiserResult {
  const {
    numPeriods, periodDuration,
    noSubFirstMins, noSubLastMins, minSubGapMins,
  } = config

  const TOTAL_SLOTS = numPeriods * periodDuration
  const LAST        = TOTAL_SLOTS - 1
  const byId   = new Map(players.map(p => [p.id, p]))
  const cMap   = new Map(constraints.map(c => [c.playerId, c]))
  const available = players.filter(p => !(cMap.get(p.id)?.unavailable ?? false))
  const slotOrder = buildSlotOrder(numPeriods, periodDuration)

  const totalPlayerMins = numPeriods * periodDuration * PER_SLOT
  const targetMins      = totalPlayerMins / (available.length || 1)

  const minSlots = new Map(available.map(p => {
    const c    = cMap.get(p.id)
    const mins = config.balanceMinutes ? Math.floor(targetMins) : (c?.minMinutes ?? 10)
    return [p.id, Math.ceil(mins)]
  }))
  const maxSlots = new Map(available.map(p => {
    const c    = cMap.get(p.id)
    const mins = config.balanceMinutes
      ? Math.min(numPeriods * periodDuration, Math.ceil(targetMins) + 2)
      : (c?.maxMinutes ?? numPeriods * periodDuration)
    return [p.id, Math.min(TOTAL_SLOTS, Math.floor(mins))]
  }))

  // ── Feasibility checks ─────────────────────────────────────────────────────

  const baseWarnings: string[] = []

  if (available.length < 5) {
    return {
      feasible: false, plan: [], constraintReport: [],
      totalSubCalls: 0, subCallsPerQuarter: Array(numPeriods).fill(0),
      warnings: [`Only ${available.length} available — need at least 5`], config,
    }
  }

  const noPosPlayers = available.filter(p =>
    p.primaryPositions.length === 0 && p.secondaryPositions.length === 0
  )
  if (noPosPlayers.length) {
    baseWarnings.push(`${noPosPlayers.map(p => p.firstName).join(', ')} have no positions set — skipping position balance for them`)
  }

  const effectiveSubWindows = periodDuration - noSubFirstMins - noSubLastMins
  if (effectiveSubWindows < 1) {
    baseWarnings.push(`No-sub zones cover the entire period — subs will only happen at period starts`)
  } else if (minSubGapMins > 0) {
    const maxSubsPerPeriod = Math.floor(effectiveSubWindows / minSubGapMins)
    if (maxSubsPerPeriod < 1) {
      baseWarnings.push(`Min sub gap (${minSubGapMins} min) exceeds available sub window (${effectiveSubWindows} min) — subs at period starts only`)
    }
  }

  const totalReq = [...minSlots.values()].reduce((s, n) => s + n, 0)
  if (totalReq > TOTAL_SLOTS * PER_SLOT) {
    baseWarnings.push(`Minimum minutes exceed total capacity — some players will fall short`)
  }

  // ── Multi-start ────────────────────────────────────────────────────────────

  let bestAssignments: string[][] | null = null
  let bestFrozen:      boolean[]  | null = null
  let bestScore = -Infinity
  let bestWarnings: string[] = []

  for (let iter = 0; iter < NUM_STARTS; iter++) {
    // First iteration: deterministic (jitter=0). Rest: randomised.
    // When balanceByPeriod is on, use lower jitter so the period urgency signal
    // isn't swamped by random noise — period balance needs a steady hand.
    const jitter = iter === 0 ? 0 : (config.balanceByPeriod ? 0.08 : 0.18)

    const { assignments, frozenSlots, warnings } = solveOnce(players, constraints, config, jitter)

    // Apply local search to improve this solution
    const improved = localSearch(
      assignments, slotOrder, available, byId, cMap,
      minSlots, maxSlots, config, frozenSlots,
    )

    // Re-enforce no-sub zone + gap constraints: local search can modify a non-frozen
    // slot without updating the gap-locked downstream slots that still carry the old
    // lineup, creating phantom subs. enforceFreeze sweeps the final assignments and
    // forces carries wherever constraints require it.
    enforceFreeze(improved, slotOrder, config)

    const score = scoreAssignments(improved, slotOrder, available, byId, cMap, minSlots, maxSlots, config)

    if (score > bestScore) {
      bestScore       = score
      bestAssignments = improved
      bestFrozen      = frozenSlots
      bestWarnings    = warnings
    }
  }

  const assignments = bestAssignments!
  const allWarnings = [...baseWarnings, ...bestWarnings]

  // ── Build output ───────────────────────────────────────────────────────────

  const plan: RotationSlot[] = slotOrder.map(({ quarter, window }, i) => ({
    quarter, window, playerIds: assignments[i] ?? [],
  }))

  const { total, perQuarter } = countSubCalls(plan, numPeriods)

  // Re-compute slotsPlayed from final assignments
  const slotsPlayed = new Map(available.map(p => [p.id, 0]))
  assignments.forEach(lineup => lineup.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1)))

  const constraintReport: ConstraintReport[] = available.map(p => {
    const c         = cMap.get(p.id)
    const played    = slotsPlayed.get(p.id) ?? 0
    const minMins   = minSlots.get(p.id) ?? 0   // effective solver value
    const maxMins   = maxSlots.get(p.id) ?? TOTAL_SLOTS
    const qPlayed   = [...new Set(
      slotOrder.filter((_, i) => assignments[i]?.includes(p.id)).map(s => s.quarter)
    )].sort((a, b) => a - b)
    const starterMet = !c?.isStarter || (assignments[0]?.includes(p.id) ?? false)
    const closerMet  = !c?.isCloser  || (assignments[LAST]?.includes(p.id) ?? false)
    const everyQMet  = !c?.mustPlayEveryQuarter ||
      Array.from({ length: numPeriods }, (_, i) => i + 1).every(q => qPlayed.includes(q))

    return {
      playerId: p.id, name: p.name,
      minutesAssigned: played,
      minMinutes: minMins,
      maxMinutes: maxMins,
      minMinutesMet: played >= minMins,
      maxMinutesMet: played <= maxMins,
      quartersPlayed: qPlayed,
      everyQuarterMet: everyQMet,
      starterMet, closerMet,
    }
  })

  const feasible = constraintReport.every(r =>
    r.minMinutesMet && r.maxMinutesMet && r.starterMet && r.closerMet && r.everyQuarterMet
  )

  return {
    feasible, plan, constraintReport,
    totalSubCalls: total, subCallsPerQuarter: perQuarter,
    warnings: allWarnings, config,
  }
}
