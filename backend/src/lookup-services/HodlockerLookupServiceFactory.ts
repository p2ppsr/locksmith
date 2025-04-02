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

LocksmithContract.loadArtifact(locksmithContractJson)

export class HodlockerLookupService implements LookupService {
  constructor (public storage: HodlockerStorage) {
    console.log('[DEBUG] Initialized')
  }

  async outputAdded (
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

      if (
        address === undefined ||
        lockUntilHeight === undefined ||
        message === undefined
      ) {
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
      console.error('❌  outputAdded() failed:', e)
    }
  }

  async outputSpent (
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    console.log(
      `[DEBUG] outputSpent called for txid: ${txid}, outputIndex: ${outputIndex}, topic: ${topic}`
    )
    if (topic === 'tm_hodlocker') {
      console.log(
        `[DEBUG] Deleting Hodlocker record for spent output: txid=${txid}, outputIndex=${outputIndex}`
      )
      await this.storage.deleteRecord(txid, outputIndex)
    }
  }

  async outputDeleted (
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    console.log(
      `[DEBUG] outputDeleted called for txid: ${txid}, outputIndex: ${outputIndex}, topic: ${topic}`
    )
    if (topic === 'tm_hodlocker') {
      console.log(
        `[DEBUG] Deleting Hodlocker record for deleted output: txid=${txid}, outputIndex=${outputIndex}`
      )
      await this.storage.deleteRecord(txid, outputIndex)
    }
  }

  async lookup (
    question: LookupQuestion
  ): Promise<LookupAnswer | LookupFormula> {
    console.log(
      `[DEBUG] lookup called with question: ${JSON.stringify(question)}`
    )

    if (question.query == null) {
      console.error('❌ Invalid query received')
      throw new Error('A valid query must be provided!')
    }

    if (question.service !== 'ls_hodlocker') {
      console.error(`❌ Unsupported lookup service: ${question.service}`)
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      address: string
      lockUntilHeight: number
      message: string
      findAll?: boolean
    }

    if (typeof query.findAll !== 'undefined' && query.findAll) {
      return await this.storage.findAll()
    }

    const mess = JSON.stringify(question, null, 2)
    throw new Error(`❌ question.query:${mess}`)
  }

  async getDocumentation (): Promise<string> {
    return docs
  }

  async getMetaData (): Promise<{
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

export default (db: Db): HodlockerLookupService => {
  return new HodlockerLookupService(new HodlockerStorage(db))
}
