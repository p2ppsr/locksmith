import {
  LookupService,
  LookupQuestion,
  LookupAnswer,
  LookupFormula
} from '@bsv/overlay'
import { HodlockerStorage } from './HodlockerStorage.js'
import { Script } from '@bsv/sdk'
import { Beef, BEEF_V2 } from '@bsv/sdk'
import docs from './HodlockerLookupDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'
import { Db } from 'mongodb'

// Load the contract artifact
LocksmithContract.loadArtifact(locksmithContractJson)

/**
 * Implements a Hodlocker lookup service
 */
class HodlockerLookupService implements LookupService {
  constructor(public storage: HodlockerStorage) {}

  async outputAdded?(
    txid: string,
    outputIndex: number,
    outputScript: Script,
    topic: string
  ): Promise<void> {
    if (topic !== 'tm_hodlocker') return

    console.log(`📥 outputAdded called for ${txid}:${outputIndex}`)

    try {
      const lockingScriptHex = outputScript.toHex()
      console.log(`🔐 Locking script: ${lockingScriptHex}`)

      const hodlocker = LocksmithContract.fromLockingScript(
        lockingScriptHex
      ) as LocksmithContract
      console.log('🔎 Parsed Hodlocker Contract:', hodlocker)

      const address = hodlocker.address?.toString()
      const lockUntilHeight = Number(hodlocker.lockUntilHeight)
      const message = hodlocker.message

      if (!address || !lockUntilHeight || !message) {
        console.warn(`⚠️ Skipping due to invalid fields`, {
          address,
          lockUntilHeight,
          message
        })
        return
      }

      const existing = await this.storage.findByTxid(txid, outputIndex)
      if (existing) {
        console.log(`🔁 Skipping duplicate record ${txid}:${outputIndex}`)
        return
      }

      const beef = new Beef(BEEF_V2)
      beef.mergeTxidOnly(txid)

      console.log(`💾 Storing new Hodlocker token: ${txid}:${outputIndex}`)
      await this.storage.storeRecord({
        txid,
        outputIndex,
        address,
        lockUntilHeight,
        message,
        beef: beef.toBinary()
      })
      console.log(`✅ Successfully stored ${txid}:${outputIndex}`)
    } catch (e) {
      console.error(
        `❌ Error indexing Hodlocker token for ${txid}:${outputIndex}`,
        e
      )
    }
  }

  async outputSpent?(
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    if (topic !== 'tm_hodlocker') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async outputDeleted?(
    txid: string,
    outputIndex: number,
    topic: string
  ): Promise<void> {
    if (topic !== 'tm_hodlocker') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async lookup(
    question: LookupQuestion
  ): Promise<LookupAnswer | LookupFormula> {
    if (question.query == null) {
      throw new Error('❌ A valid query must be provided!')
    }
    if (question.service !== 'ls_hodlocker') {
      throw new Error('❌ Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      address?: string
      findAll?: boolean
    }

    if (query.txid) {
      console.log(`🔍 Lookup by TXID: ${query.txid}`)
      const record = await this.storage.findByTxid(query.txid)

      if (!record) {
        return { type: 'output-list', outputs: [] }
      }

      return {
        type: 'output-list',
        outputs: [
          {
            beef: record.beef,
            outputIndex: record.outputIndex
          }
        ]
      }
    }

    if (query.address) {
      console.log(`🔍 Lookup by Address: ${query.address}`)
      const records = await this.storage.findByAddress(query.address)

      return {
        type: 'output-list',
        outputs: records.map(record => ({
          beef: record.beef,
          outputIndex: record.outputIndex
        }))
      }
    }

    if (query.findAll) {
      console.log(`🔍 Lookup all Hodlocker records`)
      return {
        type: 'output-list',
        outputs: await this.storage.findAll()
      }
    }

    throw new Error(
      `❌ Invalid lookup query: ${JSON.stringify(question, null, 2)}`
    )
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
      shortDescription: 'Lock your coins for a set period.'
    }
  }
}

// Factory export
export default (db: Db): HodlockerLookupService => {
  return new HodlockerLookupService(new HodlockerStorage(db))
}
