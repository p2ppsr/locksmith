/**
 * Common Type Definitions for Locksmith and Overlay Services
 */

/**
 * Defines metadata information for a Topic Manager.
 */
export type TopicManagerMetaData = {
  name: string
  shortDescription: string
  iconURL?: string
  version?: string
  informationURL?: string
}

/**
 * Defines the structure of admittance instructions.
 */
export type AdmittanceInstructions = {
  outputsToAdmit: number[]
  coinsToRetain: number[]
}

/**
 * Defines the structure of a stored Locksmith entry.
 */
export type LocksmithEntry = {
  lockUntilHeight: bigint
}

/**
 * Defines the structure for Locksmith storage.
 */
export interface LocksmithStorage {
  storeLocksmithEntry(key: string, value: LocksmithEntry): void
  getLocksmithEntry(key: string): LocksmithEntry | null
}

/**
 * Defines the structure for a Locksmith lookup service.
 */
export interface LocksmithLookupService {
  getLocksmithData(key: string): Promise<LocksmithEntry | null>
}

/**
 * Defines the structure for a Topic Manager.
 */
export interface TopicManager {
  identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions>
  getDocumentation(): Promise<string>
  getMetaData(): Promise<TopicManagerMetaData>
}

export type LocksmithContract = {
  lockUntilHeight: number
  creatorIdentityKey: string
  token: {
    rawTX: string
    outputIndex: number
    lockingScript: string
    satoshis: number
  }
}
