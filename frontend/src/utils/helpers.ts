import { SmartContract } from 'scrypt-ts'
import {
  CreateActionResult,
  CreateActionOutput,
  WalletClient,
  WalletOutput,
  ListOutputsResult,
  ListOutputsArgs,
  Beef,
  Utils,
  Transaction,
  HexString
} from '@bsv/sdk'
import { lookupHodlockerByTxid } from './utils'
import { Locksmith } from '@bsv/backend'

/**
 * Verify a variable is not null or undefined.
 * If the variable is null or undefined, this function will throw an error.
 *
 * @param {T | null | undefined} v - Variable to be verified
 * @returns {T} - Returns the variable if it is neither null nor undefined.
 * @throws {Error} - Throws an error if the truthy value could not be verified.
 */
export const verifyTruthy = <T>(v: T | null | undefined): T => {
  if (v == null) {
    console.error('verifyTruthy failed! Value is null or undefined.')
    throw new Error('A bad thing has happened.')
  }
  return v
}

/**
 * Deploy an instance of a smart contract.
 *
 * @param {SmartContract} instance - Instance of a SmartContract to be deployed.
 * @param {number} satoshis - The amount of satoshis to attach to the contract's output.
 * @param {string} description - Description about what the action does.
 * @param {string} basket - Optional. The associated basket to use for the action.
 * @param {string} metadata - Optional. Custom metadata to be added to the customInstructions field of the output
 * @param {boolean} acceptDelayedBroadcast - Optional. Defaults to false which ensures confirmed broadcast of new transaction.
 * @returns {Promise<CreateActionResult>} - Promise resolving the action result.
 */
export const deployContract = async (
  instance: SmartContract,
  satoshis: number,
  description: string,
  basket?: string,
  metadata?: string,
  acceptDelayedBroadcast = false
): Promise<CreateActionResult> => {
  console.log('Generated Locking Script:', instance.lockingScript.toHex())

  const walletClient = new WalletClient('json-api', 'non-admin.com')
  return await walletClient.createAction({
    description,
    outputs: [
      {
        lockingScript: instance.lockingScript.toHex(),
        satoshis,
        basket,
        customInstructions: metadata,
        outputDescription: 'Output for hodlocker token'
      }
    ],
    options: { acceptDelayedBroadcast: false, noSend: true }
  })
}

// export const deployContract_old = async (
//     instance: SmartContract,
//     satoshis: number,
//     description: string,
//     basket?: string,
//     metadata?: string,
//     acceptDelayedBroadcast = false
// ): Promise<CreateActionResult> => {
//     return await createAction({
//         description,
//         outputs: [
//             {
//                 script: instance.lockingScript.toHex(),
//                 satoshis,
//                 basket,
//                 customInstructions: metadata,
//             },
//         ],
//         acceptDelayedBroadcast
//     })
// }

export interface ListResult<T extends SmartContract> {
  contract: T
  txid: string
  BEEF: HexString
  outputs: WalletOutput[] // ✅ Ensure compatibility with redeemContract
}

/**
 * List all instances of a specific smart contract in the basket.
 *
 * @param {string} basket - The basket name where the contracts are expected.
 * @param {(lockingScript: string) => T} contractHydrator - Function that hydrates the contract from a locking script.
 * @returns {Promise<ListResult<T>[]>} - Promise resolving an array of list results with the hydrated contracts.
 */
export const listContracts = async <T extends SmartContract>(
  basket: string,
  contractHydrator: (lockingScript: string) => T
): Promise<Array<ListResult<T>>> => {
  const walletClient = new WalletClient('json-api', 'non-admin.com')

  const listOutputResults = await walletClient.listOutputs({
    basket,
    includeCustomInstructions: true
  })

  console.log('🔍 Full listOutputs response:', listOutputResults)

  const contracts = await Promise.all(
    listOutputResults.outputs.map(async output => {
      if (!output.outpoint) {
        console.warn('⚠️ Skipping contract with missing outpoint:', output)
        return null
      }

      const [txid] = output.outpoint.split('.') // Extract TXID
      const token = await lookupHodlockerByTxid(txid)

      if (!token) {
        console.warn('No token returned.')
        return null
      }

      if (!token.lockingScript) {
        console.warn('⚠️ Token has no locking script. Cannot decode.')
        return null
      }

      // ✅ Decode with proper lockingScript
      const hodlocker = Locksmith.fromLockingScript(token.lockingScript)

      const contract = contractHydrator(hodlocker.lockingScript.toHex()) // Fix: convert Script to string

      return {
        contract,
        txid,
        // ❌ Removed atomicBeefTX unless it's part of your custom Token object
        outputs: listOutputResults.outputs
      }
    })
  )

  return contracts.filter((result): result is ListResult<T> => result !== null)
}

//   export const listContracts_old = async <T extends SmartContract>(
//     basket: string,
//     contractHydrator: (lockingScript: string) => T
// ): Promise<ListResult<T>[]> => {
//     const outputs = await getTransactionOutputs({
//         basket,
//         spendable: true,
//         includeEnvelope: true,
//         includeCustomInstructions: true,
//     })
//     const contracts: ListResult<T>[] = []
//     for (let i = 0; i < outputs.length; i++) {
//         contracts.push({
//             ...outputs[i],
//             contract: contractHydrator(outputs[i].outputScript),
//         })
//     }
//     return contracts
// }

/**
 * Redeem a smart contract.
 *
 * @param {ListResult<SmartContract>} listResult - The contract that needs to be redeemed, obtained by listing the smart contracts.
 * @param {(self: SmartContract) => void} redeemTransformer - Function that modifies the contract to a state that can be redeemed.
 * @param {string} description - Description about what the action does.
 * @param {number} customLockTime - Optional. The locktime to set on the redeeming transaction.
 * @param {number} customSequenceNumber - Optional. The sequence number for the input.
 * @param {CreateActionOutput[]} outputs - Optional. Additional outputs that should be added to the transaction.
 * @returns {Promise<CreateActionResult>} - Promise resolving the action result.
 */
export const redeemContract = async (
  listResult: ListResult<SmartContract>,
  redeemTransformer: (self: SmartContract) => void,
  description: string,
  customLockTime?: number,
  customSequenceNumber = 0xffffffff,
  outputs?: CreateActionOutput[]
): Promise<CreateActionResult> => {
  const walletClient = new WalletClient('json-api', 'non-admin.com')

  try {
    // Verify BEEF exists instead of envelope
    verifyTruthy(listResult.BEEF)

    // Ensure there are outputs available
    if (!listResult.outputs || listResult.outputs.length === 0) {
      throw new Error('No outputs available in listResult!')
    }

    // Ensure outpoint is present
    const outpoint = listResult.outputs[0].outpoint
    if (!outpoint) {
      throw new Error('Outpoint is missing from the contract output.')
    }

    // Generate unlocking script & Log it
    const unlockingScript = (
      await listResult.contract.getUnlockingScript(redeemTransformer)
    ).toHex()
    console.log('🔓 Unlocking Script:', unlockingScript)

    // Log input details before calling walletClient.createAction
    console.log('🔍 Inputs:', {
      outpoint,
      unlockingScript,
      sequenceNumber: customSequenceNumber
    })

    // Log outputs if provided
    if (outputs != null) {
      console.log('📤 Outputs:', outputs)
    }

    // Execute createAction & Log result
    const actionResult = await walletClient.createAction({
      inputs: [
        {
          outpoint,
          unlockingScript,
          sequenceNumber: customSequenceNumber,
          inputDescription: 'Unlocking Hodlocker'
        }
      ],
      description,
      lockTime: customLockTime,
      outputs
    })

    console.log('Transaction Executed Successfully:', actionResult)
    const transaction = Transaction.fromAtomicBEEF(actionResult.tx!)
    const txid = transaction.id('hex')
    console.log('transaction:', transaction.toHex())
    console.log('txid:', txid)

    return actionResult
  } catch (error) {
    console.error('Redeem Contract Failed:', (error as Error).message)
    throw error
  }
}

// export const redeemContract_old = async (
//   listResult: ListResult<SmartContract>,
//   redeemTransformer: (self: SmartContract) => void,
//   description: string,
//   customLockTime?: number,
//   customSequenceNumber = 0xffffffff,
//   outputs?: CreateActionOutput[]
// ): Promise<CreateActionResult> => {
//   return await createAction({
//     inputs: {
//       [listResult.txid]: {
//         ...verifyTruthy(listResult.envelope),
//         outputsToRedeem: [
//           {
//             index: listResult.vout,
//             unlockingScript: (
//               await listResult.contract.getUnlockingScript(redeemTransformer)
//             ).toHex(),
//             sequenceNumber: customSequenceNumber
//           }
//         ]
//       }
//     },
//     description,
//     lockTime: customLockTime,
//     outputs
//   })
// }
