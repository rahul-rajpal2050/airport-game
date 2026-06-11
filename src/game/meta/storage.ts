const SAVE_KEY = 'airport-game-save-v1'

export interface RunState {
  runSeed: string
  shiftIndex: number
  reputation: number
  perkIds: string[]
  runScore: number
}

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface Settings {
  difficulty: Difficulty
  nearMisses: boolean
}

export interface SaveData {
  version: 1
  run: RunState | null
  records: {
    bestShiftScore: number
    bestRunScore: number
    runsCompleted: number
  }
  settings: Settings
}

export function defaultSettings(): Settings {
  return { difficulty: 'normal', nearMisses: true }
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
    records: { bestShiftScore: 0, bestRunScore: 0, runsCompleted: 0 },
    settings: defaultSettings(),
  }
}

export function loadSave(): SaveData {
  try {
    const raw = backend.get()
    if (!raw) return emptySave()
    const parsed = JSON.parse(raw) as SaveData
    if (parsed.version !== 1 || typeof parsed.records !== 'object') return emptySave()
    // older saves predate settings: fill defaults
    parsed.settings = { ...defaultSettings(), ...parsed.settings }
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
