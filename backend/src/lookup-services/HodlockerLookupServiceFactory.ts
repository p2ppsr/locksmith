import {
  LookupService,
  LookupQuestion,
  LookupAnswer,
  LookupFormula
} from '@bsv/overlay'
import { HodlockerStorage } from './HodlockerStorage.js'
import { Script } from '@bsv/sdk'
import docs from './HodlockerLookupDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'
import { Db } from 'mongodb'

// Load contract artifact
LocksmithContract.loadArtifact(locksmithContractJson)

/**
 * Implements a Hodlocker lookup service
 */
export class HodlockerLookupService implements LookupService {
  constructor(public storage: HodlockerStorage) {
    console.log('[HodlockerLookupService] Initialized')
  }

  async outputAdded?(
    txid: string,
    outputIndex: number,
    outputScript: Script,
    topic: string
  ): Promise<void> {
    console.log('[DEBUG] outputAdded() triggered with:', {
      txid,
      outputIndex,
      topic
    })

    if (topic !== 'tm_hodlocker') {
      console.log('[DEBUG] outputAdded() skipping due to topic:', topic)
      return
    }

    try {
      const hodlocker = LocksmithContract.fromLockingScript(
        outputScript.toHex()
      ) as LocksmithContract
      const address = hodlocker.address?.toString()
      const lockUntilHeight = Number(hodlocker.lockUntilHeight)
      const message = hodlocker.message
      console.log('[DEBUG] outputAdded():address:', address)
      console.log('[DEBUG] outputAdded():lockUntilHeight:', lockUntilHeight)
      console.log('[DEBUG] outputAdded():message:', message)

      if (!address || !lockUntilHeight || !message) {
        console.log('[DEBUG] outputAdded() missing fields:', {
          address,
          lockUntilHeight,
          message
        })
        return
      }

      console.log('[DEBUG] Storing Hodlocker record:', {
        txid,
        outputIndex,
        address,
        lockUntilHeight,
        message
      })

      await this.storage.storeRecord(
        txid,
        outputIndex,
        address,
        lockUntilHeight,
        message
      )
    } catch (e) {
      console.error('[ERROR] outputAdded() failed:', e)
    }
  }

  async outputSpent?(
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    console.log(
      `[HodlockerLookupService] outputSpent called for txid: ${txid}, outputIndex: ${outputIndex}, topic: ${topic}`
    )

    if (topic === 'tm_hodlocker') {
      console.log(
        `[HodlockerLookupService] Deleting Hodlocker record for spent output: txid=${txid}, outputIndex=${outputIndex}`
      )
      await this.storage.deleteRecord(txid, outputIndex)
    }
  }

  async outputDeleted?(
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    console.log(
      `[HodlockerLookupService] outputDeleted called for txid: ${txid}, outputIndex: ${outputIndex}, topic: ${topic}`
    )

    if (topic === 'tm_hodlocker') {
      console.log(
        `[HodlockerLookupService] Deleting Hodlocker record for deleted output: txid=${txid}, outputIndex=${outputIndex}`
      )
      await this.storage.deleteRecord(txid, outputIndex)
    }
  }

  async lookup(
    question: LookupQuestion
  ): Promise<LookupAnswer | LookupFormula> {
    console.log(
      `[HodlockerLookupService] lookup called with question: ${JSON.stringify(question)}`
    )

    if (!question.query) {
      console.error(`[HodlockerLookupService] Invalid query received`)
      throw new Error('A valid query must be provided!')
    }

    if (question.service !== 'ls_hodlocker') {
      console.error(
        `[HodlockerLookupService] Unsupported lookup service: ${question.service}`
      )
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      address: string
      lockUntilHeight: number
      message: string
      findAll?: boolean
    }
    if (query.findAll) {
      return await this.storage.findAll()
    }
    const mess = JSON.stringify(question, null, 2)
    throw new Error(`question.query:${mess}}`)
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Hodlocker Lookup Service',
      shortDescription: 'Manages Hodlocker locks and retrievals.'
    }
  }
}

// Factory export
export default (db: Db): HodlockerLookupService => {
  return new HodlockerLookupService(new HodlockerStorage(db))
}
