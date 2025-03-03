import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction } from '@bsv/sdk/dist/esm/src/transaction/index.js'
import { ProtoWallet } from '@bsv/sdk/dist/esm/src/wallet/index.js'
import docs from './LocksmithTopicDocs.md.js'
import locksmithContractJson from '../../artifacts/Locksmith.json' assert { type: 'json' }
import { Locksmith } from '../contracts/Locksmith.js'
import { LocksmithLookupServiceFactory } from '../lookup-services/LocksmithLookupServiceFactory.js'
import { LocksmithStorage } from '../lookup-services/LocksmithStorage.js'

Locksmith.loadArtifact(locksmithContractJson)

const storage = LocksmithStorage.getInstance()
const locksmithLookupService =
  LocksmithLookupServiceFactory.getInstance(storage)

const anyoneWallet = new ProtoWallet('anyone')

/**
 * Helper function to check if a given locking script is a P2PKH script.
 * P2PKH scripts follow the pattern: OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG
 * Hex representation: 76a914{20-byte public key hash}88ac
 * @param script - The locking script in hex format.
 * @returns True if the script is a P2PKH script, otherwise false.
 */
const isP2PKHScript = (script: string): boolean => {
  return /^76a914[a-fA-F0-9]{40}88ac$/.test(script)
}

/**
 * Topic Manager for Locksmith.
 * Ensures only valid Locksmith locks are added to the overlay.
 */
export class LocksmithTopicManager implements TopicManager {
  /**
   * Identifies if outputs are admissible based on protocol rules.
   * @param beef - The transaction data in BEEF format.
   * @param previousCoins - The previous coins to consider.
   * @returns A promise resolving with admittance instructions.
   */
  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []

    try {
      console.log('Parsing transaction from BEEF format...')
      const parsedTransaction = Transaction.fromBEEF(beef)
      console.log('Parsed transaction:', parsedTransaction)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const script = output.lockingScript.toHex().trim()
          console.log(`Checking output script at index ${i}: ${script}`)

          // Ensure this is a Smart Contract (Heuristic: Length > 150 bytes)
          if (script.length <= 150) {
            console.warn(`Skipping output ${i}: Not a smart contract.`)
            continue
          }

          const locksmith =
            await locksmithLookupService.getLocksmithData(script)

          if (!locksmith) {
            console.warn(`Skipping output ${i}: Locksmith contract not found.`)
            continue
          }

          console.log(`Retrieved Locksmith contract:`, locksmith)

          if (!locksmith.lockUntilHeight) {
            console.warn(`Skipping output ${i}: No lock height detected.`)
            continue
          }

          if (locksmith.lockUntilHeight >= BigInt(500000000)) {
            console.warn(
              `Skipping output ${i}: Invalid lockUntilHeight (${locksmith.lockUntilHeight}).`
            )
            continue
          }

          console.log(
            `Admitting Locksmith output ${i} with lockUntilHeight: ${locksmith.lockUntilHeight}`
          )
          outputsToAdmit.push(i)
        } catch (error) {
          console.warn(`Skipping output ${i}: ${(error as Error).message}`)
        }
      }

      if (outputsToAdmit.length === 0) {
        console.warn('No valid Locksmith outputs found.')
      }
    } catch (error) {
      console.error('Error identifying admissible Locksmith outputs:', error)
    }

    console.log('Final outputs to admit:', outputsToAdmit)

    return {
      outputsToAdmit,
      coinsToRetain: previousCoins
    }
  }

  /**
   * Retrieves documentation for Locksmith topic manager.
   * @returns A promise resolving to the documentation string.
   */
  async getDocumentation(): Promise<string> {
    return docs
  }

  /**
   * Retrieves metadata for the topic manager.
   * @returns A promise resolving to an object containing metadata.
   */
  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Locksmith Topic Manager',
      shortDescription: 'Handles time-locked outputs for users.'
    }
  }
}
