import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils } from '@bsv/sdk'
import docs from './HodlockerTopicDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'

// Load the contract artifact
LocksmithContract.loadArtifact(locksmithContractJson)

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
      const txid = parsedTransaction.id('hex') // Extract TXID
      console.log(`🔍 Processing TXID: ${txid}`)

      // Try to decode and validate transaction outputs
      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          // Parse sCrypt locking script
          const script = output.lockingScript.toHex()

          // Ensure Hodlocker can be constructed from script
          const locksmith = LocksmithContract.fromLockingScript(
            script
          ) as LocksmithContract

          // Extract the correct fields
          const address = locksmith.address
          const lockUntilHeight = Number(locksmith.lockUntilHeight) // ✅ Convert `bigint` to `number`
          const message = locksmith.message

          if (!address || !lockUntilHeight || !message) {
            console.warn(
              `⚠️ Invalid lock fields. address: ${address}, lockUntilHeight: ${lockUntilHeight}, message: ${message}`
            )
            continue
          }

          // 🔹 Verify using lock height instead of missing signature
          const verifyResult = await anyoneWallet.verifySignature({
            protocolID: [0, 'hodlocker'],
            keyID: '1',
            counterparty: address,
            data: [lockUntilHeight], // Ensure correct signing data
            signature: Utils.toArray(script, 'hex') // Placeholder fix
          })

          if (!verifyResult.valid) {
            console.warn(`⚠️ Signature invalid for TXID ${txid}`)
            continue
          }

          console.log(`✅ Admitted output ${i} in TXID ${txid}`)
          outputsToAdmit.push(i)
        } catch (error) {
          console.warn(`⚠️ Skipping invalid output in TXID ${txid}:`, error)
          continue
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
      shortDescription: 'Lock your coins for a number of blocks.'
    }
  }
}
