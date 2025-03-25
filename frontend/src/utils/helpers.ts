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
import { HodlockerToken } from '../types/types'

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

interface ExtendedLocksmith extends Locksmith {
  keyID: string
  signature: string
  lockUntilHeight: bigint
  message: string
  // ❌ don't override `address` type here
}

/**
 * List all instances of a specific smart contract in the basket.
 *
 * @param {(lockingScriptHex: string) => T} contractHydrator - Function to rehydrate a contract from lockingScript hex.
 * @returns {Promise<ListResult<T>[]>} Array of list results with contracts and metadata.
 */
export const listContracts = async <T extends SmartContract>(
  BASKET_ID: string,
  hodlocker: HodlockerToken[],
  contractHydrator: (lockingScriptHex: string) => T
): Promise<ListResult<T>[]> => {
  console.log(`📡 listContracts started for basket: ${BASKET_ID}`)

  const walletClient = new WalletClient('json-api', 'non-admin.com')

  try {
    console.log(`🔍 Calling walletClient.listOutputs for basket: ${BASKET_ID}`)

    const listOutputResults = await walletClient.listOutputs({
      basket: BASKET_ID,
      include: 'locking scripts'
    })

    console.log(
      `✅ listOutputs SUCCESS for ${BASKET_ID}:`,
      JSON.stringify(listOutputResults, null, 2) // Log full response
    )

    if (!listOutputResults.outputs || listOutputResults.outputs.length === 0) {
      console.warn(`⚠️ No outputs found in basket: ${BASKET_ID}`)
      return []
    }

    type WalletOutputWithBeef = WalletOutput & { atomicBeefTX: HexString }
    const outputs = listOutputResults.outputs as WalletOutputWithBeef[]

    console.log(
      `📦 Processing ${outputs.length} outputs from walletClient.listOutputs`
    )

    const results = await Promise.all(
      outputs.map(async (output, index) => {
        console.log(`🔹 Processing output #${index}:`, output)

        if (!output.outpoint || !output.lockingScript) {
          console.warn(
            `⚠️ Skipping output #${index} due to missing fields:`,
            output
          )
          return null
        }

        // ✅ Find the matching stored token using txid
        const txid = output.outpoint.split('.')[0]
        const matchingToken = hodlocker.find(t => {
          console.log(
            `🔎 Checking stored token txid: ${t.token.txid} vs output txid: ${
              output.outpoint.split('.')[0]
            }`
          )
          return t.token.txid === output.outpoint.split('.')[0]
        })

        if (!matchingToken) {
          console.warn(`⚠️ No stored token found for txid: ${txid}`)
          return null
        }

        console.log(`✅ Found matching stored token for txid: ${txid}`)

        const [txidFull, voutStr] = output.outpoint.split('.')
        const outputIndex = parseInt(voutStr)

        let hodlockerContract: ExtendedLocksmith
        try {
          hodlockerContract = Locksmith.fromLockingScript(
            output.lockingScript
          ) as ExtendedLocksmith
          console.log(
            `🔑 Successfully parsed Hodlocker contract for output #${index}`
          )
        } catch (e) {
          console.warn(
            `❌ Failed to parse contract from script at output #${index}: ${
              (e as Error).message
            }`
          )
          return null
        }

        const contract = contractHydrator(output.lockingScript)

        const token: HodlockerToken = {
          token: {
            atomicBeefTX: matchingToken.token.atomicBeefTX, // ✅ Retrieve from stored hodlocker
            txid: txidFull,
            outputIndex,
            lockingScript: output.lockingScript,
            satoshis: output.satoshis
          },
          keyID: hodlockerContract.keyID,
          signature: hodlockerContract.signature,
          lockUntilHeight: Number(hodlockerContract.lockUntilHeight),
          message: hodlockerContract.message,
          address:
            hodlockerContract.address.toString?.() ??
            String(hodlockerContract.address)
        }

        console.log(
          `✅ Token successfully created for output #${index}:`,
          token
        )

        return {
          contract,
          txid: txidFull,
          BEEF: token.token.atomicBeefTX, // ✅ Now correctly sourced
          outputs: [output]
        } as ListResult<T>
      })
    )

    console.log(
      `✅ Final processed results:`,
      results.filter(r => r !== null)
    )

    return results.filter((result): result is ListResult<T> => result !== null)
  } catch (error) {
    console.error(
      `❌ ERROR in listContracts for basket ${BASKET_ID}:`,
      (error as Error).message
    )
    return []
  }
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
  console.log('redeemContract')
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
      inputBEEF: Utils.toArray(listResult.BEEF),
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
