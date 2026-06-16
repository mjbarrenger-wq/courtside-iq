// Rotation Planner — Domain Types
// See ROTATIONS.md for full spec

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
  // Performance data (optional — used for PPP-weighted optimisation)
  offPpp?: number
  defPpp?: number
}

export interface PlayerConstraint {
  playerId: string
  isStarter: boolean       // must be on court for Q1 Slot A
  isCloser: boolean        // must be on court for Q4 Slot B
  minMinutes: number       // minimum total game minutes (default 10)
  maxMinutes: number       // maximum total game minutes (default 40)
  mustPlayEveryQuarter: boolean
  unavailable: boolean     // injured/absent — exclude entirely
}

export type Quarter = 1 | 2 | 3 | 4
export type Slot = 'A' | 'B'

export interface RotationSlot {
  quarter: Quarter
  slot: Slot
  playerIds: string[]      // exactly 5
  estimatedPpp?: number
}

export interface RotationPlan {
  id?: string
  name: string
  teamId: string
  gameId?: string
  slots: RotationSlot[]    // 8 total: Q1A, Q1B, Q2A, Q2B, Q3A, Q3B, Q4A, Q4B
  constraints: PlayerConstraint[]
}

export interface ConstraintReport {
  playerId: string
  name: string
  minutesAssigned: number
  minMinutesMet: boolean
  quartersPlayed: number[]
  everyQuarterMet: boolean
  starterMet: boolean
  closerMet: boolean
}

export interface OptimiserResult {
  feasible: boolean
  plan: RotationSlot[]
  constraintReport: ConstraintReport[]
  totalSubCalls: number    // number of slot transitions with ≥1 player change
  subCallsPerQuarter: number[]
  warnings: string[]
  estimatedNetPpp?: number
}
