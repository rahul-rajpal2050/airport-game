const SAVE_KEY = 'airport-game-save-v1'

export interface RunState {
  runSeed: string
  shiftIndex: number
  reputation: number
  perkIds: string[]
  runScore: number
  /** sum of each completed shift's satisfaction %, for the run average */
  satisfactionSum: number
}

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface Settings {
  difficulty: Difficulty
  nearMisses: boolean
  gateCount: number
  runwayCount: number
  tutorialSeen: boolean
  playerName: string
}

export interface Records {
  bestShiftScore: number
  bestRunScore: number
  runsCompleted: number
  /** best single-shift satisfaction % — the headline personal best */
  bestSatisfaction: number
  /** consecutive-day daily-challenge streak */
  dailyStreak: { count: number; lastDay: string }
}

export interface SaveData {
  version: 1
  run: RunState | null
  records: Records
  settings: Settings
}

export function defaultSettings(): Settings {
  return {
    difficulty: 'normal',
    nearMisses: true,
    gateCount: 10,
    runwayCount: 3,
    tutorialSeen: false,
    playerName: '',
  }
}

export function defaultRecords(): Records {
  return {
    bestShiftScore: 0,
    bestRunScore: 0,
    runsCompleted: 0,
    bestSatisfaction: 0,
    dailyStreak: { count: 0, lastDay: '' },
  }
}

export interface StorageBackend {
  get(): string | null
  set(value: string): void
}

function defaultBackend(): StorageBackend {
  if (typeof localStorage !== 'undefined') {
    return {
      get: () => localStorage.getItem(SAVE_KEY),
      set: (v) => localStorage.setItem(SAVE_KEY, v),
    }
  }
  // headless tests: in-memory
  let mem: string | null = null
  return { get: () => mem, set: (v) => (mem = v) }
}

let backend = defaultBackend()

export function setStorageBackend(b: StorageBackend): void {
  backend = b
}

export function emptySave(): SaveData {
  return {
    version: 1,
    run: null,
    records: defaultRecords(),
    settings: defaultSettings(),
  }
}

export function loadSave(): SaveData {
  try {
    const raw = backend.get()
    if (!raw) return emptySave()
    const parsed = JSON.parse(raw) as SaveData
    if (parsed.version !== 1 || typeof parsed.records !== 'object') return emptySave()
    // older saves predate newer settings/records fields: fill defaults
    parsed.settings = { ...defaultSettings(), ...parsed.settings }
    parsed.records = { ...defaultRecords(), ...parsed.records }
    return parsed
  } catch {
    return emptySave() // corrupt data: start clean rather than crash
  }
}

export function persistSave(data: SaveData): void {
  try {
    backend.set(JSON.stringify(data))
  } catch {
    // storage full or unavailable: the game still plays, persistence is best-effort
  }
}
