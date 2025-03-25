import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils } from '@bsv/sdk'
import docs from './HodlockerTopicDocs.md.js'
import LocksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'

LocksmithContract.loadArtifact(LocksmithContractJson)

const anyoneWallet = new ProtoWallet('anyone')

/**
 *  Note: The PushDrop package is used to decode BRC-48 style Pay-to-Push-Drop tokens.
 */
export default class HodlockerTopicManager implements TopicManager {
  /**
   * Identify if the outputs are admissible depending on the particular protocol requirements
   * @param beef - The transaction data in BEEF format
   * @param previousCoins - The previous coins to consider
   * @returns A promise that resolves with the admittance instructions
   */
  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []
    try {
      const parsedTransaction = Transaction.fromBEEF(beef)

      // Try to decode and validate transaction outputs
      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          // Parse sCrypt locking script
          const script = output.lockingScript.toHex()
          // Ensure Hodlocker can be constructed from script
          const hodlocker = LocksmithContract.fromLockingScript(
            script
          ) as LocksmithContract
          console.log(hodlocker)

          // ❌ Removed signature verification - Hodlocker only signs on redemption

          outputsToAdmit.push(i)
        } catch (error) {
          // Continue processing other outputs
          continue
        }
      }
      if (outputsToAdmit.length === 0) {
        console.warn('No outputs admitted!')
        // throw new ERR_BAD_REQUEST('No outputs admitted!')
      }
    } catch (error) {
      const beefStr = JSON.stringify(beef, null, 2)
      throw new Error(
        `HodlockerTopicManager: Error identifying admissible outputs: ${error} beef: ${beefStr}`
      )
    }

    return {
      outputsToAdmit,
      coinsToRetain: previousCoins
    }
  }

  /**
   * Get the documentation associated with this topic manager
   * @returns A promise that resolves to a string containing the documentation
   */
  async getDocumentation(): Promise<string> {
    return docs
  }

  /**
   * Get metadata about the topic manager
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
      name: 'Hodlocker Topic Manager',
      shortDescription: 'Hodlocker time-locked contracts'
    }
  }
}
