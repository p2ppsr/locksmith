import { LocksmithStorage } from '../src/lookup-services/LocksmithStorage'
import { LocksmithLookupServiceFactory } from '../src/lookup-services/LocksmithLookupServiceFactory'

describe('LocksmithLookupServiceFactory', () => {
  let factory: LocksmithLookupServiceFactory
  let storage: LocksmithStorage

  beforeEach(() => {
    storage = LocksmithStorage.getInstance() // ✅ Use singleton instance
    factory = LocksmithLookupServiceFactory.getInstance(storage) // ✅ Pass singleton instance
  })

  test('should return stored Locksmith data', async () => {
    const key = 'test-script'
    const value = { lockUntilHeight: 150000 }

    storage.storeLocksmithEntry(key, value)
    const result = await factory.getLocksmithData(key)

    expect(result).toEqual(value)
  })

  test('should return null for non-existent Locksmith script', async () => {
    const result = await factory.getLocksmithData('invalid-script')
    expect(result).toBeNull()
  })
})
