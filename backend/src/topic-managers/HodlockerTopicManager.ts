import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils, Beef } from '@bsv/sdk'
import docs from './HodlockerTopicDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'
import { Signer } from 'scrypt-ts'

// Load the contract artifact
LocksmithContract.loadArtifact(locksmithContractJson)

// const anyoneWallet = new ProtoWallet('anyone')

export default class HodlockerTopicManager implements TopicManager {
  /**
   * Identify if the outputs are admissible depending on the particular protocol requirements
   * @param beef - The transaction data in BEEF format
   * @param previousCoins - The previous coins to consider
   * @returns A promise that resolves with the admittance instructions
   */
  async identifyAdmissibleOutputs(
    beefBytes: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    console.log(`identifyAdmissibleOutputs:beef:${Utils.toHex(beefBytes)}`)

    const beef = Beef.fromBinary(beefBytes)
    if (!beef.isValid()) {
      throw new Error('Invalid BEEF: does not comply with BRC-95')
    }

    const outputsToAdmit: number[] = []

    try {
      const parsedTransaction = Transaction.fromBEEF(beefBytes)
      const txid = parsedTransaction.id('hex')
      console.log(`🔍 Processing TXID: ${txid}`)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const script = output.lockingScript.toHex()
          console.log(`🔹 Output ${i} Locking Script: ${script}`)

          const locksmith = LocksmithContract.fromLockingScript(
            script
          ) as LocksmithContract
          console.log('🔹 Parsed Locksmith Contract:', locksmith)

          const lockUntilHeight = Number(locksmith.lockUntilHeight)

          if (!lockUntilHeight || !locksmith.address) {
            console.warn(
              `⚠️ Missing lockUntilHeight or address in output ${i}. Skipping...`
            )
            continue
          }

          console.log(
            `ℹ️ Skipping signature verification for output ${i}, allowing based on structure only.`
          )

          outputsToAdmit.push(i)
          console.log(`✅ Admitted output ${i} in TXID ${txid}`)
        } catch (error) {
          console.warn(
            `⚠️ Skipping invalid output in TXID ${txid}:`,
            (error as Error).message
          )
        }
      }

      if (outputsToAdmit.length === 0) {
        console.warn(`⚠️ No outputs admitted in TXID ${txid}`)
      }
    } catch (error) {
      console.error(`❌ Error identifying admissible outputs:`, error)
      throw new Error(
        `topicManager:Error:identifying admissible outputs:${error}`
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
      shortDescription: 'Lock your coins for a number of blocks.'
    }
  }
}
