import { LocksmithStorage } from './LocksmithStorage.js'

/**
 * Factory class for creating Locksmith lookup services.
 */
export class LocksmithLookupServiceFactory {
  private static instance: LocksmithLookupServiceFactory
  private storage: LocksmithStorage

  private constructor(storage: LocksmithStorage) {
    this.storage = storage
  }

  /**
   * Retrieves or initializes the singleton instance.
   * @param storage - The LocksmithStorage instance.
   * @returns The singleton LocksmithLookupServiceFactory instance.
   */
  static getInstance(
    storage?: LocksmithStorage
  ): LocksmithLookupServiceFactory {
    if (!LocksmithLookupServiceFactory.instance) {
      console.log('Creating new LocksmithLookupServiceFactory instance...')
      LocksmithLookupServiceFactory.instance =
        new LocksmithLookupServiceFactory(
          storage || LocksmithStorage.getInstance()
        )
    }
    return LocksmithLookupServiceFactory.instance
  }

  /**
   * Retrieves Locksmith data from storage.
   * @param key - The lookup key (locking script).
   * @returns The stored Locksmith data or null if not found.
   */
  async getLocksmithData(key: string): Promise<any | null> {
    const result = this.storage.getLocksmithEntry(key.trim())
    console.log(`Looking up Locksmith entry for key: ${key.trim()}`, result)
    return result !== undefined ? result : null
  }
}
