// Rotation Planner — Domain Types

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C'
export type PositionGroup = 'perimeter' | 'wing' | 'interior'

export const POSITION_NUMBER: Record<Position, number> = {
  PG: 1, SG: 2, SF: 3, PF: 4, C: 5,
}
export const POSITION_GROUP: Record<Position, PositionGroup> = {
  PG: 'perimeter', SG: 'perimeter',
  SF: 'wing',
  PF: 'interior', C: 'interior',
}

export interface RotationPlayer {
  id: string
  name: string
  firstName: string
  jersey: number
  primaryPositions: Position[]
  secondaryPositions: Position[]
  offPpp?: number
  defPpp?: number
}

export interface PlayerConstraint {
  playerId: string
  isStarter: boolean
  isCloser: boolean
  minMinutes: number      // effective value used by solver (may come from team default or override)
  maxMinutes: number
  mustPlayEveryQuarter: boolean
  unavailable: boolean
}

export type Quarter = number   // period number (1-based)
export type SubWindow = number  // window within a period (1-based, 1 minute each)

export interface RotationSlot {
  quarter: Quarter
  window: SubWindow
  playerIds: string[]
  estimatedPpp?: number
}

export interface GameConfig {
  numPeriods: number       // typically 2 (halves) or 4 (quarters)
  periodDuration: number   // minutes per period (e.g. 10, 12, 8)
  noSubFirstMins: number   // no lineup changes in first N minutes of each period
  noSubLastMins: number    // no lineup changes in last N minutes of each period
  minSubGapMins: number    // minimum minutes between consecutive sub calls within a period (0 = no limit)
  balanceMinutes: boolean  // try to equalize playing time across available players
  balanceByPeriod: boolean // try to spread each player's minutes evenly across periods
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  numPeriods: 4,
  periodDuration: 10,
  noSubFirstMins: 2,
  noSubLastMins: 2,
  minSubGapMins: 2,
  balanceMinutes: false,
  balanceByPeriod: true,
}

export interface RotationPlan {
  id?: string
  name: string
  teamId: string
  gameId?: string
  slots: RotationSlot[]
  constraints: PlayerConstraint[]
  config: GameConfig
}

export interface ConstraintReport {
  playerId: string
  name: string
  minutesAssigned: number
  minMinutes: number       // effective target (for display)
  maxMinutes: number       // effective cap (for display)
  minMinutesMet: boolean
  maxMinutesMet: boolean
  quartersPlayed: number[]
  everyQuarterMet: boolean
  starterMet: boolean
  closerMet: boolean
}

export interface OptimiserResult {
  feasible: boolean
  plan: RotationSlot[]
  constraintReport: ConstraintReport[]
  totalSubCalls: number
  subCallsPerQuarter: number[]
  warnings: string[]
  config: GameConfig
}
