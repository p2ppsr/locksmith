import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils, Beef } from '@bsv/sdk'
import docs from './HodlockerTopicDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' with { type: 'json' }
import { LocksmithContract } from '../contracts/Locksmith.js'

// Load the contract artifact
LocksmithContract.loadArtifact(locksmithContractJson)

const anyoneWallet = new ProtoWallet('anyone')

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
    console.log(`identifyAdmissibleOutputs:beef:${Utils.toHex(beef)}`)
    // throw new Error(
    //   `identifyAdmissibleOutputs:beef:${Utils.toHex(beef)}`
    // )

    const outputsToAdmit: number[] = []

    try {
      const parsedTransaction = Transaction.fromBEEF(beef)
      const txid = parsedTransaction.id('hex') // Extract TXID

      console.log(`🔍 Processing TXID: ${txid}`)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          // Parse sCrypt locking script
          const script = output.lockingScript.toHex()
          console.log(`🔹 Output ${i} Locking Script: ${script}`)

          // Ensure LocksmithContract can be constructed from script
          const locksmith = LocksmithContract.fromLockingScript(
            script
          ) as LocksmithContract
          console.log('🔹 Parsed Locksmith Contract:', locksmith)

          // 🔹 Extract values passed to Locksmith
          const lockUntilHeight = Number(locksmith.lockUntilHeight) // ✅ Convert `bigint` to `number`
          const signature = locksmith.signer // ✅ Extracted signature

          // 🔹 Ensure required fields exist
          if (!lockUntilHeight || !signature) {
            console.warn(
              `⚠️ Missing required fields in output ${i}. Skipping...`
            )
            continue
          }

          console.log(
            `🔹 Verifying Signature -> LockUntilHeight: ${lockUntilHeight}, Signature: ${signature}`
          )

          // ✅ Match `walletClient.createSignature` exactly
          const verifyResult = await anyoneWallet.verifySignature({
            protocolID: [0, 'hodlocker'],
            keyID: '1', // ✅ Must match deployment keyID
            counterparty: 'self', // ✅ Matches `createSignature`
            data: [1], // ✅ Data signed during deployment
            signature: Utils.toArray(signature, 'hex') // ✅ Extracted from contract
          })

          if (!verifyResult.valid) {
            console.warn(`⚠️ Signature invalid for output ${i} in TXID ${txid}`)
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
