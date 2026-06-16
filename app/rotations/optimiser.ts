// Rotation Planner — Constraint Solver
// Pure TypeScript, no external dependencies, runs client-side
//
// Algorithm: greedy slot-by-slot with urgency scoring + constraint repair
//
// Core constraints (all hard):
//   - Exactly 5 players per slot
//   - Stagger: max 2 player changes between consecutive slots (≥3 carry over)
//   - Position balance: ≥1 perimeter (PG/SG) AND ≥1 interior (PF/C) per lineup
//   - Starters locked into Q1 Slot A
//   - Closers locked into Q4 Slot B
//   - Min minutes per player (repaired after initial pass)
//   - Every-quarter players appear in ≥1 slot per quarter (repaired after initial pass)

import type {
  RotationPlayer, PlayerConstraint, RotationSlot,
  OptimiserResult, ConstraintReport, Quarter, Slot, Position,
} from './types'
import { POSITION_GROUP } from './types'

// ── Slot ordering ─────────────────────────────────────────────────────────────

const SLOT_ORDER: { quarter: Quarter; slot: Slot }[] = [
  { quarter: 1, slot: 'A' }, { quarter: 1, slot: 'B' },
  { quarter: 2, slot: 'A' }, { quarter: 2, slot: 'B' },
  { quarter: 3, slot: 'A' }, { quarter: 3, slot: 'B' },
  { quarter: 4, slot: 'A' }, { quarter: 4, slot: 'B' },
]

const TOTAL_SLOTS   = 8
const PER_SLOT      = 5
const MINS_PER_SLOT = 5
const MAX_STAGGER   = 2   // max player changes between consecutive slots

// ── Position helpers ──────────────────────────────────────────────────────────

function allPositions(p: RotationPlayer): Position[] {
  return [...p.primaryPositions, ...p.secondaryPositions]
}

function isPerimeter(p: RotationPlayer): boolean {
  return allPositions(p).some(pos => POSITION_GROUP[pos] === 'perimeter')
}

function isInterior(p: RotationPlayer): boolean {
  return allPositions(p).some(pos => POSITION_GROUP[pos] === 'interior')
}

function lineupHasPerimeter(ids: string[], byId: Map<string, RotationPlayer>): boolean {
  return ids.some(id => { const p = byId.get(id); return p ? isPerimeter(p) : false })
}

function lineupHasInterior(ids: string[], byId: Map<string, RotationPlayer>): boolean {
  return ids.some(id => { const p = byId.get(id); return p ? isInterior(p) : false })
}

function positionValid(ids: string[], byId: Map<string, RotationPlayer>): boolean {
  // Only enforce if we have enough position data; if everyone has no positions set,
  // skip the check rather than always failing.
  const withPositions = ids.filter(id => {
    const p = byId.get(id)
    return p && (p.primaryPositions.length > 0 || p.secondaryPositions.length > 0)
  })
  if (withPositions.length === 0) return true
  return lineupHasPerimeter(ids, byId) && lineupHasInterior(ids, byId)
}

// ── Urgency scoring ───────────────────────────────────────────────────────────

// Returns a score ∈ [0, ∞) indicating how urgently this player needs to play.
// Higher = more urgent. Players who have already met their minimum score 0.
function urgency(
  playerId: string,
  slotsPlayed: Map<string, number>,
  minSlots: Map<string, number>,
  slotIndex: number,            // which slot we're filling (0-based)
): number {
  const played  = slotsPlayed.get(playerId) ?? 0
  const needed  = minSlots.get(playerId) ?? 2
  const stillNeeds = Math.max(0, needed - played)
  const remaining  = TOTAL_SLOTS - slotIndex   // slots left including this one
  if (stillNeeds === 0) return 0
  // urgency = proportion of remaining slots this player must fill
  return stillNeeds / remaining
}

// ── Lineup validation ─────────────────────────────────────────────────────────

function changesFrom(prev: string[], next: string[]): number {
  const prevSet = new Set(prev)
  return next.filter(id => !prevSet.has(id)).length
}

// ── Core: pick the best 5 for a slot ─────────────────────────────────────────

function pickLineup(params: {
  eligible:    RotationPlayer[]
  prevLineup:  string[]         // empty for first slot
  locked:      string[]         // must be in this lineup (starters/closers)
  byId:        Map<string, RotationPlayer>
  slotsPlayed: Map<string, number>
  minSlots:    Map<string, number>
  slotIndex:   number
  warnings:    string[]
}): string[] {
  const { eligible, prevLineup, locked, byId, slotsPlayed, minSlots, slotIndex, warnings } = params
  const eligibleIds = new Set(eligible.map(p => p.id))

  // Validate locked players are actually eligible
  const validLocked = locked.filter(id => eligibleIds.has(id))
  if (validLocked.length !== locked.length) {
    warnings.push(`Some locked players (starters/closers) are unavailable — ignoring`)
  }

  // How many more spots to fill after locked players
  const spotsLeft = PER_SLOT - validLocked.length
  if (spotsLeft < 0) {
    warnings.push(`Too many locked players for one slot — using first ${PER_SLOT}`)
    return validLocked.slice(0, PER_SLOT)
  }

  // Candidates: eligible, not already locked
  const candidates = eligible.filter(p => !validLocked.includes(p.id))

  // With stagger constraint: if we have a previous lineup, we must carry ≥3 players
  // (changing at most MAX_STAGGER = 2)
  let carryIds: string[] = []
  let newIds: string[] = []

  if (prevLineup.length > 0) {
    // From previous lineup, exclude locked players already handled
    const prevCarriable = prevLineup.filter(id => eligibleIds.has(id) && !validLocked.includes(id))
    const prevOut       = prevLineup.filter(id => !eligibleIds.has(id) || validLocked.includes(id))

    // How many changes have we already "used" by bringing in locked players?
    const forcedChanges = validLocked.filter(id => !prevLineup.includes(id)).length
    const remainingChangeSlots = Math.max(0, MAX_STAGGER - forcedChanges)

    // Must carry at least: (PER_SLOT - validLocked.length - remainingChangeSlots) from prev
    const mustCarryCount = Math.max(0, (PER_SLOT - validLocked.length) - remainingChangeSlots)

    // Sort prevCarriable (string IDs): prefer players who still need minutes
    const sorted = [...prevCarriable].sort((a, b) =>
      urgency(b, slotsPlayed, minSlots, slotIndex) - urgency(a, slotsPlayed, minSlots, slotIndex)
    )

    // First, fill mandatory carries (to satisfy stagger)
    carryIds = sorted.slice(0, mustCarryCount)

    // Then, fill remaining spots: prefer candidates who NEED minutes most
    const remaining = spotsLeft - carryIds.length
    const notCarried = candidates.filter(p => !carryIds.includes(p.id))
    // Sort: highest urgency first; for ties, players who just played get lower priority
    const ranked = [...notCarried].sort((a, b) => {
      const ua = urgency(a.id, slotsPlayed, minSlots, slotIndex)
      const ub = urgency(b.id, slotsPlayed, minSlots, slotIndex)
      if (Math.abs(ua - ub) > 0.01) return ub - ua
      // Secondary sort: players who played last slot should rest if others need minutes
      const aPlayed = prevLineup.includes(a.id) ? 1 : 0
      const bPlayed = prevLineup.includes(b.id) ? 1 : 0
      return aPlayed - bPlayed
    })

    newIds = ranked.slice(0, remaining).map(p => p.id)
  } else {
    // First slot: just pick by urgency, position balance second
    const sorted = [...candidates].sort((a, b) =>
      urgency(b.id, slotsPlayed, minSlots, slotIndex) - urgency(a.id, slotsPlayed, minSlots, slotIndex)
    )
    newIds = sorted.slice(0, spotsLeft).map(p => p.id)
  }

  let lineup = [...validLocked, ...carryIds, ...newIds]

  // Ensure exactly 5 (pad or trim if needed due to edge cases)
  if (lineup.length < PER_SLOT) {
    const extras = candidates
      .filter(p => !lineup.includes(p.id))
      .slice(0, PER_SLOT - lineup.length)
      .map(p => p.id)
    lineup = [...lineup, ...extras]
  }
  lineup = lineup.slice(0, PER_SLOT)

  // Fix position balance if violated
  lineup = fixPositionBalance(lineup, eligible, byId, prevLineup, slotIndex, slotsPlayed, minSlots, warnings)

  return lineup
}

// ── Position balance repair ───────────────────────────────────────────────────

function fixPositionBalance(
  lineup:      string[],
  eligible:    RotationPlayer[],
  byId:        Map<string, RotationPlayer>,
  prevLineup:  string[],
  slotIndex:   number,
  slotsPlayed: Map<string, number>,
  minSlots:    Map<string, number>,
  warnings:    string[],
): string[] {
  if (positionValid(lineup, byId)) return lineup

  const needsPerimeter = !lineupHasPerimeter(lineup, byId)
  const needsInterior  = !lineupHasInterior(lineup, byId)

  // Find substitutes: eligible players not in lineup who satisfy the needed role
  const substitutes = eligible.filter(p => !lineup.includes(p.id) && (
    (needsPerimeter && isPerimeter(p)) ||
    (needsInterior  && isInterior(p))
  ))

  if (substitutes.length === 0) {
    warnings.push(`Cannot satisfy position balance in Q${SLOT_ORDER[slotIndex]?.quarter ?? '?'} Slot ${SLOT_ORDER[slotIndex]?.slot ?? '?'} — insufficient position diversity in available players`)
    return lineup
  }

  // Find the player to remove: lowest urgency, satisfies neither missing role
  const removable = lineup.filter(id => {
    const p = byId.get(id)
    if (!p) return true
    if (needsPerimeter && isPerimeter(p)) return false
    if (needsInterior  && isInterior(p))  return false
    return true
  })

  if (removable.length === 0) return lineup

  // Remove player with lowest urgency among removable
  const toRemove = removable.sort((a, b) =>
    urgency(a, slotsPlayed, minSlots, slotIndex) - urgency(b, slotsPlayed, minSlots, slotIndex)
  )[0]

  // Add the highest-urgency substitute
  const toAdd = substitutes.sort((a, b) =>
    urgency(b.id, slotsPlayed, minSlots, slotIndex) - urgency(a.id, slotsPlayed, minSlots, slotIndex)
  )[0]

  const newLineup = lineup.map(id => id === toRemove ? toAdd.id : id)

  // Check stagger wasn't violated by this fix (informational only — balance takes priority)
  if (prevLineup.length > 0 && changesFrom(prevLineup, newLineup) > MAX_STAGGER) {
    warnings.push(`Position balance fix required exceeding stagger limit in slot ${slotIndex + 1}`)
  }

  return newLineup
}

// ── Repair: min minutes ───────────────────────────────────────────────────────

function repairMinMinutes(
  assignments:  string[][],
  available:    RotationPlayer[],
  byId:         Map<string, RotationPlayer>,
  minSlots:     Map<string, number>,
  slotsPlayed:  Map<string, number>,
  cMap:         Map<string, PlayerConstraint>,
  warnings:     string[],
): void {
  const MAX_REPAIR = 50

  for (let iter = 0; iter < MAX_REPAIR; iter++) {
    // Find a player below minimum
    const underserved = available.find(p => {
      const played = slotsPlayed.get(p.id) ?? 0
      return played < (minSlots.get(p.id) ?? 0)
    })
    if (!underserved) break

    // Find a slot where we can add them (within stagger)
    let repaired = false
    for (let s = 0; s < TOTAL_SLOTS; s++) {
      if (assignments[s].includes(underserved.id)) continue

      // Find lowest-urgency player in this slot we could swap out
      const slotPlayed = new Map(slotsPlayed)
      const swappable = assignments[s]
        .filter(id => {
          const c = cMap.get(id)
          // Don't remove starters from Q1A or closers from Q4B
          if (s === 0 && c?.isStarter) return false
          if (s === 7 && c?.isCloser)  return false
          return id !== underserved.id
        })
        .sort((a, b) =>
          urgency(a, slotPlayed, minSlots, s) - urgency(b, slotPlayed, minSlots, s)
        )

      if (swappable.length === 0) continue

      const toRemove = swappable[0]
      const newLineup = assignments[s].map(id => id === toRemove ? underserved.id : id)

      // Check stagger for adjacent slots
      const prevOk = s === 0 || changesFrom(assignments[s - 1], newLineup) <= MAX_STAGGER
      const nextOk = s === 7 || changesFrom(newLineup, assignments[s + 1]) <= MAX_STAGGER

      if (!prevOk || !nextOk) continue

      // Check position balance maintained
      if (!positionValid(newLineup, byId)) continue

      // Apply repair
      assignments[s] = newLineup
      slotsPlayed.set(underserved.id, (slotsPlayed.get(underserved.id) ?? 0) + 1)
      slotsPlayed.set(toRemove, Math.max(0, (slotsPlayed.get(toRemove) ?? 0) - 1))
      repaired = true
      break
    }

    if (!repaired) {
      warnings.push(`${underserved.name} could not reach minimum minutes — constraints may be over-specified`)
      break
    }
  }
}

// ── Repair: every-quarter ─────────────────────────────────────────────────────

function repairEveryQuarter(
  assignments:  string[][],
  available:    RotationPlayer[],
  byId:         Map<string, RotationPlayer>,
  cMap:         Map<string, PlayerConstraint>,
  slotsPlayed:  Map<string, number>,
  minSlots:     Map<string, number>,
  warnings:     string[],
): void {
  const everyQ = available.filter(p => cMap.get(p.id)?.mustPlayEveryQuarter)

  for (const player of everyQ) {
    for (let q = 1; q <= 4; q++) {
      const qSlots = SLOT_ORDER
        .map((s, i) => ({ ...s, i }))
        .filter(s => s.quarter === q)

      const playsThisQ = qSlots.some(s => assignments[s.i].includes(player.id))
      if (playsThisQ) continue

      // Try to insert player into one of this quarter's slots
      let inserted = false
      for (const { i } of qSlots) {
        const swappable = assignments[i].filter(id => {
          const c = cMap.get(id)
          if (i === 0 && c?.isStarter) return false
          if (i === 7 && c?.isCloser)  return false
          return true
        }).sort((a, b) =>
          urgency(a, slotsPlayed, minSlots, i) - urgency(b, slotsPlayed, minSlots, i)
        )

        if (swappable.length === 0) continue

        const toRemove = swappable[0]
        const newLineup = assignments[i].map(id => id === toRemove ? player.id : id)

        const prevOk = i === 0 || changesFrom(assignments[i - 1], newLineup) <= MAX_STAGGER
        const nextOk = i === 7 || changesFrom(newLineup, assignments[i + 1]) <= MAX_STAGGER

        if (!prevOk || !nextOk) continue
        if (!positionValid(newLineup, byId)) continue

        assignments[i] = newLineup
        slotsPlayed.set(player.id, (slotsPlayed.get(player.id) ?? 0) + 1)
        slotsPlayed.set(toRemove, Math.max(0, (slotsPlayed.get(toRemove) ?? 0) - 1))
        inserted = true
        break
      }

      if (!inserted) {
        warnings.push(`${player.name} could not be placed in Q${q} — every-quarter constraint unmet (stagger or position balance conflict)`)
      }
    }
  }
}

// ── Sub call counter (re-exported for RotationGrid) ──────────────────────────

export function countSubCalls(slots: RotationSlot[]): { total: number; perQuarter: number[] } {
  const perQuarter = [0, 0, 0, 0]
  let total = 0
  const ordered = [...slots].sort((a, b) =>
    a.quarter !== b.quarter ? a.quarter - b.quarter : a.slot.localeCompare(b.slot)
  )
  for (let i = 1; i < ordered.length; i++) {
    const prev = new Set(ordered[i - 1].playerIds)
    const curr = ordered[i].playerIds
    const changes = curr.filter(id => !prev.has(id)).length
    if (changes > 0) {
      total++
      perQuarter[ordered[i].quarter - 1]++
    }
  }
  return { total, perQuarter }
}

// ── Main solver ───────────────────────────────────────────────────────────────

export function solve(
  players:     RotationPlayer[],
  constraints: PlayerConstraint[],
): OptimiserResult {
  const warnings: string[] = []

  // Build lookup maps
  const byId  = new Map(players.map(p => [p.id, p]))
  const cMap  = new Map(constraints.map(c => [c.playerId, c]))

  // Available players (not marked unavailable)
  const available = players.filter(p => !(cMap.get(p.id)?.unavailable ?? false))

  // ── 1. Feasibility check ────────────────────────────────────────────────────

  if (available.length < 5) {
    return {
      feasible: false, plan: [], constraintReport: [],
      totalSubCalls: 0, subCallsPerQuarter: [0,0,0,0],
      warnings: [`Only ${available.length} available players — need at least 5`],
    }
  }

  // Minimum and maximum slots per player
  const minSlots = new Map(available.map(p => {
    const mins = cMap.get(p.id)?.minMinutes ?? 10
    return [p.id, Math.ceil(mins / MINS_PER_SLOT)]
  }))
  const maxSlots = new Map(available.map(p => {
    const maxMins = cMap.get(p.id)?.maxMinutes ?? 40
    return [p.id, Math.floor(maxMins / MINS_PER_SLOT)]
  }))

  const totalRequired = [...minSlots.values()].reduce((s, n) => s + n, 0)
  if (totalRequired > TOTAL_SLOTS * PER_SLOT) {
    warnings.push(
      `Minimum minutes requirements exceed game capacity (${totalRequired} player-slots needed vs ${TOTAL_SLOTS * PER_SLOT} available). Some players will fall short.`
    )
  }

  // Warn about missing positions
  const noPositions = available.filter(p => p.primaryPositions.length === 0 && p.secondaryPositions.length === 0)
  if (noPositions.length > 0) {
    warnings.push(`${noPositions.map(p => p.firstName).join(', ')} ${noPositions.length === 1 ? 'has' : 'have'} no positions set — excluded from position balance checks`)
  }

  // ── 2. Identify locked players per slot ────────────────────────────────────

  const starterIds = available
    .filter(p => cMap.get(p.id)?.isStarter)
    .map(p => p.id)

  const closerIds = available
    .filter(p => cMap.get(p.id)?.isCloser)
    .map(p => p.id)

  if (starterIds.length > PER_SLOT) {
    warnings.push(`More than ${PER_SLOT} players flagged as starters — only first ${PER_SLOT} will start`)
  }
  if (closerIds.length > PER_SLOT) {
    warnings.push(`More than ${PER_SLOT} players flagged as closers — only first ${PER_SLOT} will close`)
  }

  // ── 3. Greedy slot-by-slot assignment ──────────────────────────────────────

  const assignments: string[][] = []
  const slotsPlayed = new Map(available.map(p => [p.id, 0]))

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const { quarter, slot } = SLOT_ORDER[i]
    const prevLineup = i > 0 ? assignments[i - 1] : []

    // Exclude players who have already hit their max minutes
    const eligible = available.filter(p => {
      const played = slotsPlayed.get(p.id) ?? 0
      const max    = maxSlots.get(p.id) ?? TOTAL_SLOTS
      return played < max
    })

    // Determine locked players for this specific slot
    const locked: string[] = []
    if (i === 0) locked.push(...starterIds.slice(0, PER_SLOT))
    if (i === 7) locked.push(...closerIds.slice(0, PER_SLOT).filter(id => !locked.includes(id)))

    const lineup = pickLineup({
      eligible,
      prevLineup,
      locked,
      byId,
      slotsPlayed,
      minSlots,
      slotIndex: i,
      warnings,
    })

    // Update slotsPlayed
    lineup.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1))
    assignments.push(lineup)
  }

  // ── 4. Repair: min minutes ──────────────────────────────────────────────────

  repairMinMinutes(assignments, available, byId, minSlots, slotsPlayed, cMap, warnings)

  // ── 5. Repair: every-quarter ────────────────────────────────────────────────

  repairEveryQuarter(assignments, available, byId, cMap, slotsPlayed, minSlots, warnings)

  // ── 6. Build output ─────────────────────────────────────────────────────────

  const plan: RotationSlot[] = SLOT_ORDER.map(({ quarter, slot }, i) => ({
    quarter,
    slot,
    playerIds: assignments[i] ?? [],
  }))

  const { total, perQuarter } = countSubCalls(plan)

  // Verify stagger compliance in final plan
  for (let i = 1; i < assignments.length; i++) {
    const changes = changesFrom(assignments[i - 1], assignments[i])
    if (changes > MAX_STAGGER) {
      warnings.push(`Stagger limit exceeded between slot ${i} and slot ${i + 1} (${changes} changes) — constraints may conflict`)
    }
  }

  // Constraint report
  const constraintReport: ConstraintReport[] = available.map(p => {
    const c         = cMap.get(p.id)
    const played    = slotsPlayed.get(p.id) ?? 0
    const minsAssigned = played * MINS_PER_SLOT
    const minMins   = c?.minMinutes ?? 10
    const quarters  = [...new Set(
      SLOT_ORDER
        .filter((_, i) => assignments[i]?.includes(p.id))
        .map(s => s.quarter)
    )].sort((a, b) => a - b)

    const starterMet = !c?.isStarter || (assignments[0]?.includes(p.id) ?? false)
    const closerMet  = !c?.isCloser  || (assignments[7]?.includes(p.id) ?? false)
    const everyQMet  = !c?.mustPlayEveryQuarter || ([1,2,3,4] as Quarter[]).every(q => quarters.includes(q))

    return {
      playerId:       p.id,
      name:           p.name,
      minutesAssigned: minsAssigned,
      minMinutesMet:  minsAssigned >= minMins,
      quartersPlayed: quarters,
      everyQuarterMet: everyQMet,
      starterMet,
      closerMet,
    }
  })

  // Check position balance in final plan
  plan.forEach(({ quarter, slot, playerIds }) => {
    if (!positionValid(playerIds, byId)) {
      warnings.push(`Position balance not met in Q${quarter} Slot ${slot}`)
    }
  })

  const feasible =
    constraintReport.every(r => r.minMinutesMet && r.starterMet && r.closerMet && r.everyQuarterMet) &&
    warnings.filter(w => w.includes('Position balance not met')).length === 0

  return {
    feasible,
    plan,
    constraintReport,
    totalSubCalls: total,
    subCallsPerQuarter: perQuarter,
    warnings,
  }
}
