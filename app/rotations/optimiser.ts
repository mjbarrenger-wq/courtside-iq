// Rotation Planner — Multi-start Constraint Solver
// Architecture: multi-start randomised greedy → score → local search → best result

import type {
  RotationPlayer, PlayerConstraint, RotationSlot,
  OptimiserResult, ConstraintReport, GameConfig, Position,
} from './types'
import { DEFAULT_GAME_CONFIG, POSITION_GROUP } from './types'

const PER_SLOT    = 5
const NUM_STARTS  = 150  // random restarts (modest bump from 120; 200 froze the UI for little gain —
                         // short stints are driven by minute-balance tightness, not search depth)
const LOCAL_ITERS = 40   // hill-climbing passes per start (each pass = one accepted improvement)

// ── Score weights ─────────────────────────────────────────────────────────────

const W = {
  minMinutes:      120,  // per missing minute (hard)
  maxMinutes:       15,  // per excess minute (soft)
  starterMiss:     600,  // flat per player (hard)
  closerMiss:      600,  // flat per player (hard)
  everyPeriod:     250,  // per period missed (hard)
  posBalance:       40,  // per slot with invalid position mix (hard)
  subCall:           3,  // per sub call to ref (soft — minimise)
  timeVariance:      6,  // per minute deviation from target across players (balanceMinutes)
  periodBalance:    80,  // per minute deviation from per-period target per player (balanceByPeriod)
  quarterImbalance: 80,  // per excess minute beyond maxQtrImbalance (max-min across quarters)
  splitStint:      100,  // per broken stint per player per quarter (on→off→on)
  shortStint:       30,  // per minute under minStintMins when subbed out early
  crossQuarterPlay: 40,  // per player playing the last slot of Q and first slot of Q+1 (no break)
}

// ── Position helpers ──────────────────────────────────────────────────────────

function allPos(p: RotationPlayer): Position[] {
  return [...p.primaryPositions, ...p.secondaryPositions]
}

// ── Position assignment feasibility (bipartite matching) ──────────────────────
// A lineup is position-valid iff its players can be matched to 5 DISTINCT court
// positions (PG/SG/SF/PF/C), each player taking one of their OWN primary or
// secondary positions. Players with no positions set act as wildcards (eligible
// for any spot) so they never block a lineup. This guarantees the on-court five
// can always be arranged so nobody plays a position they aren't listed for.
const ALL_POS_LIST: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']

function eligiblePositions(p: RotationPlayer | undefined): boolean[] {
  if (!p) return [true, true, true, true, true]
  const set = new Set<Position>([...p.primaryPositions, ...p.secondaryPositions])
  if (set.size === 0) return [true, true, true, true, true]  // no positions → wildcard
  return ALL_POS_LIST.map(pos => set.has(pos))
}

// Size of the maximum player→position matching (Kuhn's augmenting paths).
function maxMatchingSize(ids: string[], byId: Map<string, RotationPlayer>): number {
  const elig = ids.map(id => eligiblePositions(byId.get(id)))
  const matchPos = new Array<number>(ALL_POS_LIST.length).fill(-1)  // position → player index
  const augment = (pi: number, seen: boolean[]): boolean => {
    for (let posi = 0; posi < ALL_POS_LIST.length; posi++) {
      if (elig[pi][posi] && !seen[posi]) {
        seen[posi] = true
        if (matchPos[posi] === -1 || augment(matchPos[posi], seen)) {
          matchPos[posi] = pi
          return true
        }
      }
    }
    return false
  }
  let matched = 0
  for (let pi = 0; pi < elig.length; pi++) {
    if (augment(pi, new Array<boolean>(ALL_POS_LIST.length).fill(false))) matched++
  }
  return matched
}

// Valid when every player in the lineup can take a distinct eligible position.
function posValid(ids: string[], byId: Map<string, RotationPlayer>): boolean {
  return maxMatchingSize(ids, byId) === ids.length
}

// Assigns each player in a lineup a DISTINCT court position from their eligible
// set, preferring PRIMARY positions and only dropping a player into a secondary
// when that's needed to complete the five. Returns id → assigned position.
// Pure/exported — used by the grid to label who's playing where each lineup.
export function assignLineupPositions(
  ids: string[],
  byId: Map<string, RotationPlayer>,
): Record<string, Position> {
  const n = ids.length
  const elig = ids.map(id => {
    const p    = byId.get(id)
    const all  = p ? new Set<Position>([...p.primaryPositions, ...p.secondaryPositions]) : new Set<Position>()
    const prim = p ? new Set<Position>(p.primaryPositions) : new Set<Position>()
    return { all, prim, wild: !p || all.size === 0 }
  })
  const canTake = (i: number, posi: number) => elig[i].wild || elig[i].all.has(ALL_POS_LIST[posi])
  const isPrim  = (i: number, posi: number) => !elig[i].wild && elig[i].prim.has(ALL_POS_LIST[posi])

  // Depth-first over distinct position assignments; keep the one with the most
  // players in a PRIMARY spot. n ≤ 5 → at most 120 leaves, trivial.
  let bestPerm: number[] | null = null
  let bestPrim = -1
  const used = new Array<boolean>(ALL_POS_LIST.length).fill(false)
  const cur: number[] = []
  const recurse = (i: number, primCount: number) => {
    if (i === n) {
      if (primCount > bestPrim) { bestPrim = primCount; bestPerm = [...cur] }
      return
    }
    for (let posi = 0; posi < ALL_POS_LIST.length; posi++) {
      if (used[posi] || !canTake(i, posi)) continue
      used[posi] = true; cur.push(posi)
      recurse(i + 1, primCount + (isPrim(i, posi) ? 1 : 0))
      used[posi] = false; cur.pop()
    }
  }
  recurse(0, 0)

  const out: Record<string, Position> = {}
  if (bestPerm) ids.forEach((id, i) => { out[id] = ALL_POS_LIST[bestPerm![i]] })
  return out
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

// Returns a boolean[] — true means the slot can have a lineup change (not locked by no-sub zone
// or gap constraint). Recomputed from the current assignments so repairs don't attempt slots
// that enforceFreeze would immediately revert. Must be called fresh each repair iteration
// because each successful repair changes assignments, which may shift gap-lock boundaries.
function computeModifiable(
  assignments:    string[][],
  slotOrder:      { quarter: number; window: number }[],
  periodDuration: number,
  noSubFirstMins: number,
  noSubLastMins:  number,
  minSubGapMins:  number,
): boolean[] {
  const modifiable: boolean[] = []
  const lastSub = new Map<number, number>()  // quarter → last sub window

  for (let i = 0; i < assignments.length; i++) {
    const { quarter, window } = slotOrder[i]

    if (i === 0 || isPeriodStart(i, periodDuration)) {
      lastSub.set(quarter, 0)
      modifiable.push(true)  // period starts are always free to change
      continue
    }

    const noSubZone = isLockedWindow(window, noSubFirstMins, noSubLastMins, periodDuration)
    const gapZone   = isGapLocked(window, lastSub.get(quarter) ?? 0, minSubGapMins)

    modifiable.push(!noSubZone && !gapZone)

    // Update last sub window tracker only for free slots where a sub actually occurred
    if (!noSubZone && !gapZone) {
      const prevSet = new Set(assignments[i - 1])
      if (assignments[i].some(id => !prevSet.has(id))) {
        lastSub.set(quarter, window)
      }
    }
  }

  return modifiable
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
  maxStagger:          number
  // Period balance (optional — only passed when balanceByPeriod is on)
  periodPlayed?:       Map<string, number>   // slots played so far in current period
  periodMinTarget?:    Map<string, number>   // target slots per period per player
  windowsLeftInPeriod?: number
  prevQuarterLastLineup?: string[]           // last lineup of the previous quarter (for cross-quarter fatigue)
  warnings:            string[]
}): string[] {
  const {
    eligible, prevLineup, locked, byId, slotsPlayed, minSlots,
    slotIndex, totalSlots, jitter, maxStagger,
    periodPlayed, periodMinTarget, windowsLeftInPeriod,
    prevQuarterLastLineup,
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
    // Global pace signal: compare actual played vs proportional share of the game so far.
    // Prevents players from consistently occupying 6-min stint slots across multiple quarters —
    // which is what happens when jitter swamps the small base-urgency difference between
    // players who differ by just 2 min played.
    //
    // Example at Q2 start (slotIndex=10, totalSlots=40):
    //   proportionalExpected = 20 * 10/40 = 5
    //   Cooper played 4 → pace = -1 → paceScore = +0.20  (boosted)
    //   Mitch  played 6 → pace = +1 → paceScore = -0.20  (suppressed)
    //   Gap = 0.40 — five times larger than jitter (0.08), so reliably preserved.
    const globalPlayed = slotsPlayed.get(id) ?? 0
    const proportionalExpected = slotIndex > 0
      ? (minSlots.get(id) ?? 0) * (slotIndex / totalSlots)
      : 0
    const pace      = globalPlayed - proportionalExpected   // positive = ahead, negative = behind
    const paceScore = Math.max(-1.5, -pace * 0.20)         // cap at ±1.5 to avoid dominating hard constraints

    // Cross-quarter rest signal: at period starts, softly discourage players who just played
    // the final slot of the previous quarter from immediately starting the next one.
    // This reduces the "10 consecutive minutes" problem at quarter boundaries.
    //
    // Calibration: -0.5 is deliberately moderate.
    //   - Strong enough to reliably shift the greedy away from Q-end players at period starts
    //     when rested players exist at similar urgency (6× jitter, so almost always applied).
    //   - Weak enough that a player significantly behind their minute target (paceScore > 0.5)
    //     can still start the next quarter if the solver genuinely needs them there.
    //   - This was -0.7 previously (too strong — locked rested players into the starting role
    //     every quarter, preventing minute balance) and +0.8 (wrong direction — actively pushed
    //     Q-end players into Q+1 start). -0.5 is the right middle ground.
    const fatigueScore = prevQuarterLastLineup?.includes(id) ? -0.5 : 0

    return base + periodScore + paceScore + fatigueScore + (jitter > 0 ? Math.random() * jitter : 0)
  }

  let carryIds: string[] = []
  let newIds:   string[] = []

  if (prevLineup.length > 0) {
    const carriable  = prevLineup.filter(id => eligSet.has(id) && !validLocked.includes(id))
    const forced     = validLocked.filter(id => !prevLineup.includes(id)).length
    const free       = Math.max(0, maxStagger - forced)
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

  return fixBalance(lineup.slice(0, PER_SLOT), eligible, byId, slotIndex, totalSlots, slotsPlayed, minSlots, validLocked)
}

// Repairs a lineup toward a valid 5-position matching by swapping bench players
// in. Each pass takes the single swap that most improves matching coverage (ties
// broken toward the least-disruptive minute change). Locked starters/closers are
// never swapped out. If coverage can't be completed, returns the best effort —
// the scorer penalises the residual and a warning is surfaced.
function fixBalance(
  lineup:       string[],
  eligible:     RotationPlayer[],
  byId:         Map<string, RotationPlayer>,
  slotIndex:    number,
  totalSlots:   number,
  slotsPlayed:  Map<string, number>,
  minSlots:     Map<string, number>,
  protectedIds: string[] = [],
): string[] {
  if (posValid(lineup, byId)) return lineup

  const urg     = (id: string) => urgency(id, slotsPlayed, minSlots, slotIndex, totalSlots)
  const protect = new Set(protectedIds)
  let cur = [...lineup]

  for (let k = 0; k < PER_SLOT && !posValid(cur, byId); k++) {
    const curSize = maxMatchingSize(cur, byId)
    const bench   = eligible.filter(p => !cur.includes(p.id))
    let best: { lineup: string[]; size: number; cost: number } | null = null

    for (const onId of cur) {
      if (protect.has(onId)) continue
      for (const sub of bench) {
        const cand = cur.map(id => id === onId ? sub.id : id)
        const size = maxMatchingSize(cand, byId)
        if (size <= curSize) continue           // must strictly improve coverage
        const cost = urg(onId) - urg(sub.id)    // lower = less disruptive minute-wise
        if (!best || size > best.size || (size === best.size && cost < best.cost)) {
          best = { lineup: cand, size, cost }
        }
      }
    }

    if (!best) break
    cur = best.lineup
  }

  return cur
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
  minSubGapMins:  number,
  maxStagger:     number,
  warnings:       string[],
  config:         GameConfig,
): void {
  const LAST = assignments.length - 1
  // Track players we've failed to fix so we continue to the next under-player rather than
  // aborting the entire repair loop (original break-on-failure abandoned all fixable players).
  const unfixable = new Set<string>()

  for (let iter = 0; iter < 300; iter++) {
    const under = available.find(p =>
      (slotsPlayed.get(p.id) ?? 0) < (minSlots.get(p.id) ?? 0) && !unfixable.has(p.id)
    )
    if (!under) break

    // Recompute modifiable slots each iteration: each successful repair changes assignments,
    // which can shift gap-lock boundaries. Using only isLockedWindow caused repairs to place
    // players in gap-locked slots that enforceFreeze would later revert, producing 19-min
    // violations even though 20 is achievable.
    const modifiable = computeModifiable(assignments, slotOrder, periodDuration, noSubFirstMins, noSubLastMins, minSubGapMins)

    // Quarter-aware candidate sort: prefer slots in quarters where this player
    // is most behind their per-quarter target. This prevents repairMinutes from
    // stuffing all repair minutes into the last quarter (whichever happens to have
    // swappable slots), which is the main cause of uneven quarter distributions.
    const perQTarget = (minSlots.get(under.id) ?? 0) / config.numPeriods
    const underQPlayed: Record<number, number> = {}
    for (let i = 0; i < assignments.length; i++) {
      const q = slotOrder[i].quarter
      underQPlayed[q] = (underQPlayed[q] ?? 0) + (assignments[i].includes(under.id) ? 1 : 0)
    }
    const candidateSlots = Array.from({ length: assignments.length }, (_, i) => i)
      .filter(s => !assignments[s].includes(under.id) && modifiable[s])
      .sort((a, b) => {
        // Most-behind quarter first (largest deficit = lowest played vs target)
        const qa = slotOrder[a].quarter, qb = slotOrder[b].quarter
        const defA = perQTarget - (underQPlayed[qa] ?? 0)
        const defB = perQTarget - (underQPlayed[qb] ?? 0)
        return defB - defA  // descending deficit → most-behind quarter first
      })

    let ok = false
    for (const s of candidateSlots) {

      const swappable = assignments[s]
        .filter(id => {
          const c = cMap.get(id)
          if (s === 0    && c?.isStarter) return false
          if (s === LAST && c?.isCloser)  return false
          // Anti-cycling: only remove players who are strictly above their minimum.
          // Prevents the A↔B minute-swap loop where both players sit at exactly their
          // minimum target and the repair oscillates between them indefinitely.
          return (slotsPlayed.get(id) ?? 0) > (minSlots.get(id) ?? 0)
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
      const prevOk = s === 0 || pStart || changes(assignments[s-1], newLineup) <= maxStagger
      const nextOk = s === LAST || nStart || changes(newLineup, assignments[s+1]) <= maxStagger
      if (!prevOk || !nextOk || !posValid(newLineup, byId)) continue

      assignments[s] = newLineup
      // Enforce freeze immediately so carries propagate before the next iteration.
      // Without this, slotsPlayed drifts: repair tracks ±1 per swap but enforceFreeze
      // can cascade into adjacent slots (e.g. gap-carry at s+1), causing the next
      // iteration to see incorrect counts and produce odd totals like 19.
      enforceFreeze(assignments, slotOrder, config)
      available.forEach(p => slotsPlayed.set(p.id, 0))
      assignments.forEach(lineup => lineup.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1)))
      ok = true
      break
    }

    if (!ok) {
      warnings.push(`${under.name} could not reach minimum minutes — constraints may be over-specified`)
      unfixable.add(under.id)  // skip this player next iteration; continue to others
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
  minSubGapMins:  number,
  maxStagger:     number,
  warnings:       string[],
  config:         GameConfig,
): void {
  const LAST  = assignments.length - 1
  const everyQ = available.filter(p => cMap.get(p.id)?.mustPlayEveryQuarter)

  for (const player of everyQ) {
    for (let q = 1; q <= numPeriods; q++) {
      const qIdxs = slotOrder.map((s, i) => ({ ...s, i })).filter(s => s.quarter === q)
      if (qIdxs.some(s => assignments[s.i].includes(player.id))) continue

      // Recompute modifiable slots for the current assignment state — gap-aware, same
      // fix as repairMinutes to avoid placing players in slots enforceFreeze will revert.
      const modifiable = computeModifiable(assignments, slotOrder, periodDuration, noSubFirstMins, noSubLastMins, minSubGapMins)

      let inserted = false
      for (const { i } of qIdxs) {
        if (!modifiable[i]) continue
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
        const prevOk = i === 0 || pStart || changes(assignments[i-1], newLineup) <= maxStagger
        const nextOk = i === LAST || nStart || changes(newLineup, assignments[i+1]) <= maxStagger
        if (!prevOk || !nextOk || !posValid(newLineup, byId)) continue

        assignments[i] = newLineup
        enforceFreeze(assignments, slotOrder, config)
        available.forEach(p => slotsPlayed.set(p.id, 0))
        assignments.forEach(lineup => lineup.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1)))
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
      const perQMins = Array.from({ length: config.numPeriods }, (_, qi) =>
        slotOrder.filter((s, i) => s.quarter === qi + 1 && assignments[i]?.includes(p.id)).length
      )
      for (const minsInQ of perQMins) {
        score -= Math.abs(minsInQ - targetPerPeriod) * W.periodBalance
      }

      // Quarter imbalance penalty: strongly penalise solutions where the spread between
      // the player's best and worst quarter exceeds maxQtrImbalance.
      // e.g. with maxQtrImbalance=2: a 2+10+4+4 spread (range 8) gets penalised 480pts;
      // a 4+6+5+5 spread (range 2) gets 0 penalty. Drives local search toward 5+5+5+5.
      if (config.maxQtrImbalance >= 0) {
        const maxQ   = Math.max(...perQMins)
        const minQ   = Math.min(...perQMins)
        const excess = Math.max(0, (maxQ - minQ) - config.maxQtrImbalance)
        score -= excess * W.quarterImbalance
      }
    }
  }

  // Split stint penalty — penalise any quarter where a player appears, disappears, then
  // reappears. This guides the solver toward continuous stints (soft — can be broken when
  // position coverage or other hard constraints require it).
  for (const p of available) {
    for (let q = 1; q <= config.numPeriods; q++) {
      const qSlots = slotOrder
        .map((s, i) => ({ on: assignments[i]?.includes(p.id) ?? false, quarter: s.quarter }))
        .filter(s => s.quarter === q)
      let wasOn = false
      let wasOff = false
      for (const s of qSlots) {
        if (s.on && wasOff && wasOn) {
          score -= W.splitStint
          wasOff = false  // only count each re-entry once
        }
        if (s.on)  wasOn  = true
        if (!s.on && wasOn) wasOff = true
      }
    }
  }

  // Short stint penalty — penalise subbing a player out before they've completed minStintMins.
  // Measured for each player removed at each sub call within a period.
  if (config.minStintMins > 0) {
    for (let i = 1; i < assignments.length; i++) {
      if (slotOrder[i].quarter !== slotOrder[i - 1].quarter) continue
      const subbedOut = assignments[i - 1].filter(id => !assignments[i].includes(id))
      for (const id of subbedOut) {
        // Count consecutive slots this player was on before slot i (same quarter)
        let stintLen = 0
        const q = slotOrder[i].quarter
        for (let j = i - 1; j >= 0 && slotOrder[j].quarter === q; j--) {
          if (assignments[j].includes(id)) stintLen++
          else break
        }
        if (stintLen < config.minStintMins) {
          score -= (config.minStintMins - stintLen) * W.shortStint
        }
      }
    }
  }

  // Cross-quarter continuous play penalty — penalise any player who appears in both
  // the last slot of quarter Q and the first slot of quarter Q+1 (no break at all).
  // A player entering at Q window 5 plays 6 consecutive minutes; if they also start
  // Q+1 they go straight to 10 minutes without rest, which is poor practice.
  // The penalty guides the solver toward rotating those players out at quarter breaks.
  for (let i = 1; i < assignments.length; i++) {
    if (!isPeriodStart(i, config.periodDuration)) continue
    const prevLineup = assignments[i - 1]
    const nextLineup = assignments[i]
    for (const id of nextLineup) {
      if (prevLineup.includes(id)) score -= W.crossQuarterPlay
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
          const prevOk = s === 0 || pStart || changes(current[s-1], candidate) <= config.maxStagger
          const nextOk = s === LAST || nStart || changes(candidate, current[s+1]) <= config.maxStagger
          if (!prevOk || !nextOk) continue
          if (!posValid(candidate, byId)) continue

          // Build trial.
          // At period starts, also propagate the candidate through the immediately
          // following frozen slots (no-sub zone at the start of the new quarter).
          // Without this, scoreAssignments sees a "lineup change" from the new
          // period-start lineup to the old frozen slots, creating phantom short-stint
          // and split-stint penalties that dwarf the cross-quarter improvement and
          // cause the swap to be incorrectly rejected.
          const trial = current.map((l, i) => {
            if (i === s) return candidate
            if (pStart && i > s && frozenSlots[i] && !isPeriodStart(i, periodDuration)) {
              // Check we're still inside the same quarter's opening no-sub zone
              const qS = Math.floor(s / periodDuration)
              const qI = Math.floor(i / periodDuration)
              if (qS === qI) return [...candidate]
            }
            return [...l]
          })
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

    let eligible = available.filter(p => {
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

    // Safety valve: if per-period caps exhaust the eligible pool, relax them for the
    // least-played players until we have PER_SLOT candidates. Without this, a free sub
    // window in Q4 (or any late quarter) can produce an empty lineup when all players
    // simultaneously hit their period budget — enforceFreeze then carries the empty
    // lineup through the no-sub zone, leaving nobody on court for the rest of the game.
    if (eligible.length < PER_SLOT) {
      const periodCapBlocked = available
        .filter(p => {
          if (eligible.includes(p)) return false
          const played = slotsPlayed.get(p.id) ?? 0
          const max    = maxSlots.get(p.id) ?? TOTAL_SLOTS
          if (played >= max) return false  // hard max still blocks
          if (!config.balanceByPeriod)     return false
          const inPeriod = slotsPlayedThisPeriod.get(p.id) ?? 0
          const cap      = periodCaps.get(p.id) ?? periodDuration
          return inPeriod >= cap            // only period-cap-blocked, not hard-max
        })
        .sort((a, b) => (slotsPlayed.get(a.id) ?? 0) - (slotsPlayed.get(b.id) ?? 0))
      const needed = PER_SLOT - eligible.length
      eligible = [...eligible, ...periodCapBlocked.slice(0, needed)]
    }

    const locked: string[] = []
    if (i === 0)    locked.push(...starterIds.slice(0, PER_SLOT))
    if (i === LAST) locked.push(...closerIds.slice(0, PER_SLOT).filter(id => !locked.includes(id)))

    // Windows remaining in this period (for period urgency weighting)
    const windowsLeftInPeriod = periodDuration - window + 1

    const lineup = pickLineup({
      eligible, prevLineup, locked, byId, slotsPlayed, minSlots,
      slotIndex: i, totalSlots: TOTAL_SLOTS, jitter, maxStagger: config.maxStagger,
      periodPlayed:        config.balanceByPeriod ? slotsPlayedThisPeriod : undefined,
      periodMinTarget:     config.balanceByPeriod ? periodTargets : undefined,
      windowsLeftInPeriod: config.balanceByPeriod ? windowsLeftInPeriod : undefined,
      // At period starts, pass the last lineup of the previous quarter so the urgency
      // function can penalise players who just played — preventing 10-minute continuous
      // stints across the quarter boundary.
      prevQuarterLastLineup: (periodStart && i > 0) ? assignments[i - 1] : undefined,
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

  // Repairs — two-pass approach:
  // Pass 1: fix obvious under-players from the greedy result.
  // Freeze: apply enforceFreeze to get a gap-consistent state, then recompute slotsPlayed
  //         from actual assignments (greedy slotsPlayed tracking can drift when gap-locked
  //         carries propagate). Pass 2: fix any remaining violations on the frozen state.
  const byId2  = new Map(players.map(p => [p.id, p]))
  const cMap2  = new Map(constraints.map(c => [c.playerId, c]))
  repairMinutes(
    assignments, slotOrder, available, byId2, minSlots, maxSlots,
    slotsPlayed, cMap2, periodDuration, noSubFirstMins, noSubLastMins,
    minSubGapMins, config.maxStagger, warnings, config,
  )
  repairEveryQuarter(
    assignments, slotOrder, available, byId2, cMap2, slotsPlayed, minSlots,
    numPeriods, periodDuration, noSubFirstMins, noSubLastMins,
    minSubGapMins, config.maxStagger, warnings, config,
  )

  // Intermediate freeze + recount: ensures repair pass 2 starts from a fully
  // consistent state. (repairMinutes already enforces after each swap, but this
  // guarantees the starting slotsPlayed is correct for the second pass.)
  enforceFreeze(assignments, slotOrder, config)
  slotsPlayed.forEach((_, id) => slotsPlayed.set(id, 0))
  assignments.forEach(lineup => lineup.forEach(id => slotsPlayed.set(id, (slotsPlayed.get(id) ?? 0) + 1)))

  repairMinutes(
    assignments, slotOrder, available, byId2, minSlots, maxSlots,
    slotsPlayed, cMap2, periodDuration, noSubFirstMins, noSubLastMins,
    minSubGapMins, config.maxStagger, warnings, config,
  )
  repairEveryQuarter(
    assignments, slotOrder, available, byId2, cMap2, slotsPlayed, minSlots,
    numPeriods, periodDuration, noSubFirstMins, noSubLastMins,
    minSubGapMins, config.maxStagger, warnings, config,
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

  // "Every Q" feasibility check — warn when the sub constraint math makes it impossible
  // to fit all every-quarter players into a single period.
  //
  // With noSubFirst=F, noSubLast=L, minSubGap=G in a D-minute period:
  //   effectiveWindow = D - F - L
  //   maxSubsPerPeriod = floor(effectiveWindow / G)  [or floor(effectiveWindow / 1) if G=0]
  //   maxUniquePlayers = 5 (period start) + maxStagger × maxSubsPerPeriod
  //
  // If everyQ players > maxUnique, it's mathematically impossible — some will be missing
  // from at least one quarter no matter how the solver allocates them.
  const everyQCount = available.filter(p => constraints.find(c => c.playerId === p.id)?.mustPlayEveryQuarter).length
  const cfgMaxStagger = config.maxStagger
  if (everyQCount > 0 && effectiveSubWindows >= 1) {
    const gapDiv = minSubGapMins > 0 ? minSubGapMins : 1
    const maxSubsPerPeriod = Math.floor(effectiveSubWindows / gapDiv)
    const maxUniquePlayers = PER_SLOT + cfgMaxStagger * maxSubsPerPeriod
    if (everyQCount > maxUniquePlayers) {
      const neededStagger = maxSubsPerPeriod > 0
        ? Math.ceil((everyQCount - PER_SLOT) / maxSubsPerPeriod)
        : everyQCount
      baseWarnings.push(
        `"Every quarter" is set for ${everyQCount} players, but the current settings allow at most ` +
        `${maxUniquePlayers} unique players per quarter ` +
        `(5 starters + ${cfgMaxStagger} per sub × ${maxSubsPerPeriod} sub${maxSubsPerPeriod !== 1 ? 's' : ''} per quarter). ` +
        `To fit all ${everyQCount}, increase "Max players per sub" to ${neededStagger}` +
        (noSubLastMins > 2 ? ` or reduce the end no-sub zone below ${noSubLastMins} min.` : `.`)
      )
    }
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

    // Post-freeze repair: local search can introduce new gap-locks (by subbing at a
    // free window) that enforceFreeze then resolves by carrying the previous lineup —
    // removing a player who was correctly placed there and dropping them to an odd
    // (mathematically impossible with even chunks) minute total like 19.
    // Run one more repair pass on the now-frozen state so any lost minutes are recovered.
    // computeModifiable inside repairMinutes ensures only truly-free slots are touched,
    // so the subsequent enforceFreeze won't revert anything.
    const postFreezePlayed = new Map(available.map(p => [p.id, 0]))
    improved.forEach(lineup => lineup.forEach(id => postFreezePlayed.set(id, (postFreezePlayed.get(id) ?? 0) + 1)))
    const postRepairWarnings: string[] = []
    repairMinutes(
      improved, slotOrder, available, byId, minSlots, maxSlots, postFreezePlayed, cMap,
      periodDuration, noSubFirstMins, noSubLastMins, minSubGapMins, config.maxStagger, postRepairWarnings, config,
    )
    enforceFreeze(improved, slotOrder, config)  // final safety freeze

    const score = scoreAssignments(improved, slotOrder, available, byId, cMap, minSlots, maxSlots, config)

    if (score > bestScore) {
      bestScore       = score
      bestAssignments = improved
      bestFrozen      = frozenSlots
      bestWarnings    = [...warnings, ...postRepairWarnings]
    }
  }

  const assignments = bestAssignments!
  const allWarnings = [...baseWarnings, ...bestWarnings]

  // Surface any slots that couldn't be filled so every player sits in one of their
  // own positions (happens only when the available players lack position coverage).
  const invalidPosSlots = assignments.filter(l => !posValid(l, byId)).length
  if (invalidPosSlots > 0) {
    allWarnings.push(
      `${invalidPosSlots} minute-slot${invalidPosSlots > 1 ? 's' : ''} could not be arranged so every player is in one of their primary/secondary positions — there isn't enough position coverage among the available players (check the position editor).`,
    )
  }

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

    // Min stint check — only intra-quarter sub-outs count (period-end exits are fine)
    let shortStintCount = 0
    if (config.minStintMins > 0) {
      for (let i = 1; i < assignments.length; i++) {
        if (slotOrder[i].quarter !== slotOrder[i - 1].quarter) continue
        const wasOn = assignments[i - 1]?.includes(p.id) ?? false
        const isOn  = assignments[i]?.includes(p.id)    ?? false
        if (!wasOn || isOn) continue  // not a sub-out for this player
        let stintLen = 0
        const q = slotOrder[i].quarter
        for (let j = i - 1; j >= 0 && slotOrder[j].quarter === q; j--) {
          if (assignments[j].includes(p.id)) stintLen++
          else break
        }
        if (stintLen < config.minStintMins) shortStintCount++
      }
    }

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
      minStintMet: shortStintCount === 0,
      shortStintCount,
    }
  })

  const feasible = constraintReport.every(r =>
    r.minMinutesMet && r.maxMinutesMet && r.starterMet && r.closerMet && r.everyQuarterMet && r.minStintMet
  )

  return {
    feasible, plan, constraintReport,
    totalSubCalls: total, subCallsPerQuarter: perQuarter,
    warnings: allWarnings, config,
  }
}
