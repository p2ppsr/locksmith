import {
  LookupService,
  LookupQuestion,
  LookupAnswer,
  LookupFormula
} from '@bsv/overlay'
import { HodlockerStorage } from './HodlockerStorage.js'
import { Script, Utils } from '@bsv/sdk'
import docs from './HodlockerLookupDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'
import { Db } from 'mongodb'

// Load the contract artifact
LocksmithContract.loadArtifact(locksmithContractJson)

/**
 * Implements a Hodlocker lookup service
 *
 * Note: The sCrypt contract is used to decode Hodlocker tokens.
 *
 * @public
 */
class HodlockerLookupService implements LookupService {
  /**
   * Constructs a new HodlockerLookupService instance
   * @param storage - The storage instance to use for managing records
   */
  constructor(public storage: HodlockerStorage) {}

  /**
   * Notifies the lookup service of a new output added.
   *
   * @param {string} txid - The transaction ID containing the output.
   * @param {number} outputIndex - The index of the output in the transaction.
   * @param {Script} outputScript - The script of the output to be processed.
   * @param {string} topic - The topic associated with the output.
   *
   * @returns {Promise<void>} A promise that resolves when the processing is complete.
   * @throws Will throw an error if there is an issue with storing the record in the storage engine.
   */
  async outputAdded?(
    txid: string,
    outputIndex: number,
    outputScript: Script,
    topic: string
  ): Promise<void> {
    if (topic !== 'tm_hodlocker') return
    try {
      // Decode the Hodlocker token fields from the Bitcoin outputScript
      const hodlocker = LocksmithContract.fromLockingScript(
        outputScript.toHex()
      ) as LocksmithContract

      // Extract fields (ensuring `message` is included)
      const address = hodlocker.address
      const lockUntilHeight = hodlocker.lockUntilHeight
      const message = hodlocker.message // Ensure this exists!

      if (!address || !lockUntilHeight || !message) {
        throw new Error(
          `Invalid lock fields. address: ${address}, lockUntilHeight: ${lockUntilHeight}, message: ${message}`
        )
      }

      // Store the lock data (now including message)
      await this.storage.storeRecord(
        txid,
        outputIndex,
        address,
        lockUntilHeight,
        message // Ensure this argument is passed!
      )
    } catch (e) {
      console.error('Error indexing Hodlocker token in lookup database', e)
      return
    }
  }

  /**
   * Notifies the lookup service that an output was spent
   * @param txid - The transaction ID of the spent output
   * @param outputIndex - The index of the spent output
   * @param topic - The topic associated with the spent output
   */
  async outputSpent?(
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    if (topic !== 'tm_hodlocker') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  /**
   * Notifies the lookup service that an output has been deleted
   * @param txid - The transaction ID of the deleted output
   * @param outputIndex - The index of the deleted output
   * @param topic - The topic associated with the deleted output
   */
  async outputDeleted?(
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    if (topic !== 'tm_hodlocker') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  /**
   * Answers a lookup query
   * @param question - The lookup question to be answered
   * @returns A promise that resolves to a lookup answer or formula
   */
  async lookup(
    question: LookupQuestion
  ): Promise<LookupAnswer | LookupFormula> {
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_hodlocker') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      address?: string
      findAll?: boolean
    }

    if (query.findAll) {
      return await this.storage.findAll()
    }

    const mess = JSON.stringify(question, null, 2)
    throw new Error(`question.query:${mess}}`)
  }

  /**
   * Returns documentation specific to this overlay lookup service
   * @returns A promise that resolves to the documentation string
   */
  async getDocumentation(): Promise<string> {
    return docs
  }

  /**
   * Returns metadata associated with this lookup service
   * @returns A promise that resolves to an object containing metadata
   * @throws An error indicating the method is not implemented
   */
  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Hodlocker Lookup Service',
      shortDescription: 'Lock your coins for a set period.'
    }
  }
}

// Factory function
export default (db: Db): HodlockerLookupService => {
  return new HodlockerLookupService(new HodlockerStorage(db))
}
