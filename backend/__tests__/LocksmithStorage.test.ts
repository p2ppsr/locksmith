import { LocksmithStorage } from '../src/lookup-services/LocksmithStorage'

describe('LocksmithStorage', () => {
  let storage: LocksmithStorage

  beforeEach(() => {
    storage = LocksmithStorage.getInstance() // ✅ Use singleton instance
  })

  test('should store and retrieve Locksmith data correctly', () => {
    const key = 'test-script'
    const value = { lockUntilHeight: 100000 }

    storage.storeLocksmithEntry(key, value)
    expect(storage.getLocksmithEntry(key)).toEqual(value)
  })

  test('should return undefined for non-existent entries', () => {
    expect(storage.getLocksmithEntry('non-existent')).toBeUndefined()
  })
})
