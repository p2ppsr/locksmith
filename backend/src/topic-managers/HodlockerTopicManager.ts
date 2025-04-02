import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction } from '@bsv/sdk'
import docs from './HodlockerTopicDocs.md.js'
import LocksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'

LocksmithContract.loadArtifact(LocksmithContractJson)

export default class HodlockerTopicManager implements TopicManager {
  async identifyAdmissibleOutputs (
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []
    try {
      const parsedTransaction = Transaction.fromBEEF(beef)
      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const script = output.lockingScript.toHex()
          const hodlocker = LocksmithContract.fromLockingScript(
            script
          ) as LocksmithContract
          console.log('[DEBUG]:hodlocker:', hodlocker)
          outputsToAdmit.push(i)
        } catch (error) {
          continue
        }
      }
      if (outputsToAdmit.length === 0) {
        throw new Error('No outputs admitted!')
      }
    } catch (error) {
      const beefStr = JSON.stringify(beef, null, 2)
      throw new Error(
        `❌ Error identifying admissible outputs: ${String(error)} beef: ${beefStr}`
      ) // Cast error to string
    }

    return {
      outputsToAdmit,
      coinsToRetain: previousCoins
    }
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
      name: 'Hodlocker Topic Manager',
      shortDescription: 'Hodlocker time-locked contracts'
    }
  }
}
