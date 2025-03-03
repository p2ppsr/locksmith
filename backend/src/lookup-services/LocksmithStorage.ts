/**
 * Singleton Storage for Locksmith-related data.
 */
export class LocksmithStorage {
  private static instance: LocksmithStorage
  private dataStore: Map<string, any>

  private constructor() {
    console.log('Initializing LocksmithStorage...')
    this.dataStore = new Map()
  }

  /**
   * Returns the singleton instance of LocksmithStorage.
   * @returns {LocksmithStorage} Singleton instance.
   */
  static getInstance(): LocksmithStorage {
    if (!LocksmithStorage.instance) {
      console.log('Creating new LocksmithStorage instance...')
      LocksmithStorage.instance = new LocksmithStorage()
    }
    return LocksmithStorage.instance
  }

  /**
   * Retrieves a copy of stored Locksmith entries.
   * @returns {Map<string, any>} A copy of the stored entries.
   */
  public getStoredEntries(): Map<string, any> {
    console.log('Retrieving all Locksmith stored entries:', this.dataStore)
    return new Map(this.dataStore)
  }

  /**
   * Stores Locksmith data.
   * @param key - The key associated with the data.
   * @param value - The Locksmith data to store.
   */
  public storeLocksmithEntry(key: string, value: any): void {
    const trimmedKey = key.trim()
    console.log(`Storing Locksmith entry: [${trimmedKey}]`, value)
    this.dataStore.set(trimmedKey, value)
  }

  /**
   * Retrieves Locksmith data by key.
   * @param key - The lookup key.
   * @returns The stored Locksmith data or undefined if not found.
   */
  public getLocksmithEntry(key: string): any {
    const trimmedKey = key.trim()
    console.log(`Looking up Locksmith entry for key: [${trimmedKey}]`)
    const result = this.dataStore.get(trimmedKey)

    if (result !== undefined) {
      console.log(`Retrieved Locksmith entry: [${trimmedKey}]`, result)
    } else {
      console.warn(`Locksmith entry NOT found for key: [${trimmedKey}]`)
    }

    return result
  }
}
