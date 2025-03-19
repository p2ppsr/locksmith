import { LocksmithArtifact } from '@bsv/backend'
import { Locksmith } from '../../../backend/src/index'
import { WalletClient, Transaction } from '@bsv/sdk'
import {
  bsv,
  type SmartContract,
  Addr,
  Sig,
  PubKey,
  toByteString
} from 'scrypt-ts'
import {
  deployContract,
  listContracts,
  redeemContract,
  verifyTruthy
} from './helpers'
import crypto from 'crypto'

const BASKET_ID = 'hodlocker'

Locksmith.loadArtifact(LocksmithArtifact)

// This locks the passed number of sats for the passed number of blocks
export const lock = async (
  satoshis: number,
  lockBlockCount: number,
  message: string
): Promise<string | undefined> => {
  if (lockBlockCount < 0) {
    throw new Error(
      'You need to lock to a future block or the current block, for immediate release'
    )
  }
  if (satoshis < 5) {
    throw new Error('You need to lock at least 5 satoshis')
  }
  if (message.length < 1) {
    throw new Error(
      "You need to tell people why you are locking your coins, and why it is not a waste of your and everyone else's time and money."
    )
  }
  const walletClient = new WalletClient('json-api', 'non-admin.com')
  const currentBlockHeightObj = await walletClient.getHeight() // Get current block height
  const keyID = crypto.randomBytes(32).toString('base64')
  const publicKey = await walletClient.getPublicKey({
    protocolID: [0, 'hodlocker'],
    keyID
  })
  const address = bsv.PublicKey.fromString(publicKey.publicKey).toAddress()
  const lockBlockHeight = currentBlockHeightObj.height + lockBlockCount
  const instance = new Locksmith(
    Addr(address.toByteString()),
    BigInt(lockBlockHeight),
    toByteString(message, true)
  )
  const tx = await deployContract(
    instance,
    satoshis,
    `Lock coins for ${lockBlockCount} ${
      lockBlockCount === 1 ? 'block' : 'blocks'
    }: ${message}`,
    BASKET_ID,
    `${keyID},${lockBlockHeight}`
  )
  return tx.txid
}

/**
 * Lists all currently active locks.
 *
 * @returns {Promise<Array<{ sats: number, left: number, message: string }>>} - A promise resolving to an array of active locks.
 */
export const list = async (
  walletClient: WalletClient
): Promise<Array<{ sats: number; left: number; message: string }>> => {
  //  Retrieve block height using walletClient
  const currentBlockHeight = await walletClient.getHeight()

  //  Fetch contracts using the new world listContracts
  const contracts = await listContracts(BASKET_ID, (lockingScript: string) => {
    return Locksmith.fromLockingScript(lockingScript) as Locksmith
  })

  return contracts.map(x => ({
    sats: x.outputs.length > 0 ? x.outputs[0].satoshis : 0, //  Ensure valid satoshis reference
    left: Number(x.contract.lockUntilHeight) - currentBlockHeight.height, //  Correct block height logic
    message: Buffer.from(x.contract.message.toString(), 'hex').toString('utf8') //  Decode hex message to utf8
  }))
}

// export const list = async (): Promise<
//   Array<{ sats: number; left: number; message: string }>
// > => {
//   const contracts = await listContracts(BASKET_ID, (lockingScript: string) => {
//     return LocksmithContract.fromLockingScript(
//       lockingScript
//     ) as LocksmithContract
//   })
//   const walletClient = new WalletClient('json-api', 'non-admin.com')
//   const currentBlockHeight = await walletClient.getHeight()

//   return contracts.map((contract: ListResult<SmartContract>) => ({
//     sats: contract.satoshis, //  Corrected field mapping
//     left: Number(contract.contract.lockUntilHeight) - currentBlockHeight.height, //  Retain logic for lock height
//     message: Buffer.from(contract.contract.message.toString(), 'hex').toString(
//       'utf8'
//     ), //  Ensure correct encoding
//     outpoint: contract.outpoint //  Ensure `outpoint` is included instead of `txid + vout`
//   }))
// }

/**
 * Starts a background unlock watchman, that will automatically unlock any
 * available coins from previous contracts.
 */
// export const startBackgroundUnlockWatchman = async (
//   refreshCallback: () => void
// ): Promise<void> => {
//   let previousBlock = 0
//   while (true) {
//     const walletClient = new WalletClient('json-api', 'non-admin.com')
//     const currentBlockHeight = await walletClient.getHeight()
//     if (currentBlockHeight.height === previousBlock) {
//       await new Promise(resolve => setTimeout(resolve, 60000))
//       continue
//     } else {
//       previousBlock = currentBlockHeight.height
//     }
//     const contracts = await listContracts(
//       BASKET_ID,
//       (lockingScript: string) => {
//         return LocksmithContract.fromLockingScript(
//           lockingScript
//         ) as LocksmithContract
//       }
//     )
//     for (let i = 0; i < contracts.length; i++) {
//       const customInstructionsStr = contracts[i].customInstructions
//       if (customInstructionsStr === null || customInstructionsStr === undefined)
//         continue
//       const customInstructions = customInstructionsStr.split(',')
//       const keyID = customInstructions[0]
//       const lockBlockHeight = Number(customInstructions[1])
//       if (currentBlockHeight.height < lockBlockHeight) {
//         continue
//       }
//       const fromTx = new bsv.Transaction(contracts[i].envelope?.rawTx ?? '')
//       contracts[i].contract.from = {
//         tx: fromTx,
//         outputIndex: contracts[i].vout ?? 0
//       }
//       const redeemHydrator = async (self: SmartContract): Promise<void> => {
//         const instance = self as LocksmithContract
//         const bsvtx = new bsv.Transaction()
//         const script = fromTx.outputs[contracts[i].vout ?? 0]?.script

//         // Ensure that the script is either a valid `Script` object or throw an error
//         if (!script || !(script instanceof bsv.Script)) {
//           throw new Error('Script not found or is invalid')
//         }

//         bsvtx.from({
//           txId: contracts[i].txid,
//           outputIndex: contracts[i].vout ?? 0,
//           script: script.toHex(),
//           satoshis: contracts[i].amount
//         })
//         bsvtx.inputs[0].sequenceNumber = 0xfffffffe
//         bsvtx.nLockTime = lockBlockHeight
//         const hashType =
//           bsv.crypto.Signature.SIGHASH_NONE |
//           bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
//           bsv.crypto.Signature.SIGHASH_FORKID
//         const preimage = bsv.Transaction.Sighash.sighashPreimage(
//           bsvtx,
//           hashType,
//           0,
//           script,
//           new bsv.crypto.BN(parseInt(String(contracts[i].amount)))
//         )
//         const hashbuf = bsv.crypto.Hash.sha256(preimage)
//         const SDKSignature = await walletClient.createSignature({
//           protocolID: [0, 'hodlocker'],
//           keyID,
//           data: Utils.toArray(hashbuf)
//         })
//         const signature = bsv.crypto.Signature.fromString(
//           Buffer.from(SDKSignature.signature).toString('hex')
//         )
//         signature.nhashtype = hashType
//         self.from = {
//           tx: new bsv.Transaction(contracts[0].envelope?.rawTx ?? ''),
//           outputIndex: contracts[0].vout ?? 0
//         }
//         self.to = {
//           tx: bsvtx,
//           inputIndex: 0
//         }
//         const publicKey = await getPublicKey({
//           protocolID: [0, 'hodlocker'],
//           keyID
//         })
//         instance.unlock(
//           Sig(toByteString(signature.toTxFormat().toString('hex'))),
//           PubKey(toByteString(publicKey))
//         )
//       }
//       await redeemContract(
//         contracts[i],
//         redeemHydrator,
//         'Recover previously-locked coins',
//         lockBlockHeight,
//         0xfffffffe
//       )
//       refreshCallback()
//     }
//     await new Promise(resolve => setTimeout(resolve, 60000))
//   }
// }

export const startBackgroundUnlockWatchman = async (
  refreshCallback: () => void
): Promise<void> => {
  const walletClient = new WalletClient('json-api', 'non-admin.com')
  let previousBlock = 0

  while (true) {
    //  Maintain old world flow for retrieving block height
    const currentBlockHeight = await walletClient.getHeight()

    if (currentBlockHeight.height === previousBlock) {
      await new Promise(resolve => setTimeout(resolve, 60000))
      continue
    } else {
      previousBlock = currentBlockHeight.height
    }

    //  List all smart contract instances from the basket
    //  List all smart contract instances from the basket
    const contracts = await listContracts(
      BASKET_ID,
      (lockingScript: string) => {
        return Locksmith.fromLockingScript(lockingScript) as Locksmith
      }
    )

    for (let i = 0; i < contracts.length; i++) {
      const contract = contracts[i]

      //  Ensure customInstructions exist in the first output
      if (!contract.outputs[0]?.customInstructions) continue

      const customInstructions =
        contract.outputs[0].customInstructions.split(',')
      const keyID = customInstructions[0]
      const lockBlockHeight = Number(customInstructions[1])

      if (currentBlockHeight.height < lockBlockHeight) continue

      //  Maintain old-world framework: Ensure transaction is retrievable
      const BEEF = verifyTruthy(contracts[i].BEEF) //  Ensure BEEF is not undefined
      const tx = Transaction.fromAtomicBEEF(BEEF) //  Safe conversion
      const fromTx = new bsv.Transaction(tx.toHex())

      contract.contract.from = {
        tx: fromTx,
        outputIndex: 0 //  Ensure first output is used correctly
      }

      //  Redeem hydrator function (Following Old World Style)
      const redeemHydrator = async (self: SmartContract): Promise<void> => {
        const instance = self as Locksmith
        const script = contract.outputs[0].lockingScript

        if (!script || typeof script !== 'string') {
          throw new Error('Locking script is missing or not a valid string.')
        }

        const scriptInstance = bsv.Script.fromHex(script)

        const hashType =
          bsv.crypto.Signature.SIGHASH_NONE |
          bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
          bsv.crypto.Signature.SIGHASH_FORKID

        const preimage = bsv.Transaction.Sighash.sighashPreimage(
          new bsv.Transaction(),
          hashType,
          0,
          scriptInstance,
          new bsv.crypto.BN(contract.outputs[0].satoshis)
        )

        const hashbuf = bsv.crypto.Hash.sha256(preimage)

        //  Maintain the walletClient signature retrieval
        const SDKSignature = await walletClient.createSignature({
          protocolID: [0, 'hodlocker'],
          keyID,
          data: Array.from(hashbuf)
        })

        if (!SDKSignature.signature || !Array.isArray(SDKSignature.signature)) {
          throw new Error('Invalid SDKSignature format received.')
        }

        const signatureHex = Buffer.from(SDKSignature.signature).toString('hex')
        const signature = bsv.crypto.Signature.fromString(signatureHex)
        signature.nhashtype = hashType

        //  Old-world structure: Assign inputs and outputs correctly
        self.from = {
          tx: fromTx, //  Ensure `tx` is set correctly
          outputIndex: 0 //  This should be set correctly based on the output being redeemed
        }

        self.to = {
          tx: new bsv.Transaction(), //  Ensure `tx` is defined
          inputIndex: 0
        }
        const publicKey = await walletClient.getPublicKey({ keyID })

        instance.unlock(
          Sig(toByteString(signature.toTxFormat().toString('hex'))),
          PubKey(toByteString(publicKey.publicKey))
        )
      }

      //  Use the same contract flow as the old-world
      await redeemContract(
        contract,
        redeemHydrator,
        'Recover previously-locked coins',
        lockBlockHeight,
        0xfffffffe
      )

      refreshCallback()
    }

    await new Promise(resolve => setTimeout(resolve, 60000))
  }
}

/**
 * Starts a background unlock watchman, that will automatically unlock any
 * available coins from previous contracts.
 */
// export const startBackgroundUnlockWatchman = async (
//   refreshCallback: () => void
// ): Promise<void> => {
//   let previousBlock = 0
//   while (true) {
//     const { headers: currentBlockHeight } = await woc.chainInfo()
//     if (currentBlockHeight === previousBlock) {
//       await new Promise(resolve => setTimeout(resolve, 60000))
//       continue
//     } else {
//       previousBlock = currentBlockHeight
//     }
//     const contracts = await listContracts(BASKET_ID, (lockingScript: string) => {
//       return Locksmith.fromLockingScript(lockingScript) as Locksmith
//     })
//     for (let i = 0; i < contracts.length; i++) {
//       const customInstructionsStr = contracts[i].customInstructions
//       if (customInstructionsStr === null || customInstructionsStr === undefined) continue
//       const customInstructions = customInstructionsStr.split(',')
//       const keyID = customInstructions[0]
//       const lockBlockHeight = Number(customInstructions[1])
//       if (currentBlockHeight < lockBlockHeight) {
//         continue
//       }
//       const fromTx = new bsv.Transaction(contracts[i].envelope?.rawTx ?? '')
//       contracts[i].contract.from = {
//         tx: fromTx,
//         outputIndex: contracts[i].vout ?? 0
//       }
//       const redeemHydrator = async (self: SmartContract): Promise<void> => {
//         const instance = self as Locksmith
//         const bsvtx = new bsv.Transaction()
//         const script = fromTx.outputs[contracts[i].vout ?? 0]?.script

//         // Ensure that the script is either a valid `Script` object or throw an error
//         if (!script || !(script instanceof bsv.Script)) {
//           throw new Error('Script not found or is invalid')
//         }

//         bsvtx.from({
//           txId: contracts[i].txid,
//           outputIndex: contracts[i].vout ?? 0,
//           script: script.toHex(),
//           satoshis: contracts[i].amount
//         })
//         bsvtx.inputs[0].sequenceNumber = 0xfffffffe
//         bsvtx.nLockTime = lockBlockHeight
//         const hashType =
//           bsv.crypto.Signature.SIGHASH_NONE |
//           bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
//           bsv.crypto.Signature.SIGHASH_FORKID
//         const preimage = bsv.Transaction.Sighash.sighashPreimage(
//           bsvtx,
//           hashType,
//           0,
//           script,
//           new bsv.crypto.BN(parseInt(String(contracts[i].amount)))
//         )
//         const hashbuf = bsv.crypto.Hash.sha256(preimage)
//         const SDKSignature = await createSignature({
//           protocolID: PROTOCOL_ID,
//           keyID,
//           data: hashbuf
//         })
//         const signature = bsv.crypto.Signature.fromString(Buffer.from(SDKSignature).toString('hex'))
//         signature.nhashtype = hashType
//         self.from = {
//           tx: new bsv.Transaction(contracts[0].envelope?.rawTx ?? ''),
//           outputIndex: contracts[0].vout ?? 0
//         }
//         self.to = {
//           tx: bsvtx,
//           inputIndex: 0
//         }
//         const publicKey = await getPublicKey({
//           protocolID: PROTOCOL_ID,
//           keyID
//         })
//         instance.unlock(
//           Sig(toByteString(signature.toTxFormat().toString('hex'))),
//           PubKey(toByteString(publicKey))
//         )
//       }
//       await redeemContract(
//         contracts[i],
//         redeemHydrator,
//         'Recover previously-locked coins',
//         lockBlockHeight,
//         0xfffffffe
//       )
//       refreshCallback()
//     }
//     await new Promise(resolve => setTimeout(resolve, 60000))
//   }
// }
