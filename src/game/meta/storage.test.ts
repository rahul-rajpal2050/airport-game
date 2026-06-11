import { beforeEach, describe, expect, it } from 'bun:test'
import { emptySave, loadSave, persistSave, setStorageBackend, type StorageBackend } from './storage'

function memoryBackend(initial: string | null = null): StorageBackend & { raw: () => string | null } {
  let mem = initial
  return { get: () => mem, set: (v) => (mem = v), raw: () => mem }
}

describe('storage', () => {
  beforeEach(() => {
    setStorageBackend(memoryBackend())
  })

  it('round-trips a save', () => {
    const data = emptySave()
    data.records.bestShiftScore = 4200
    data.run = { runSeed: 'run-1', shiftIndex: 2, reputation: 60, perkIds: ['weather_radar'], runScore: 9000 }
    persistSave(data)
    expect(loadSave()).toEqual(data)
  })

  it('returns an empty save when nothing is stored', () => {
    expect(loadSave()).toEqual(emptySave())
  })

  it('recovers from corrupt data', () => {
    setStorageBackend(memoryBackend('{not json'))
    expect(loadSave()).toEqual(emptySave())
  })

  it('rejects unknown versions', () => {
    setStorageBackend(memoryBackend(JSON.stringify({ version: 99, run: null })))
    expect(loadSave()).toEqual(emptySave())
  })
})
