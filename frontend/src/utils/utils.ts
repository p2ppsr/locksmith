import { LocksmithArtifact } from '@bsv/backend'
import { Locksmith } from '../../../backend/src/contracts/Locksmith'
import { WalletClient, Transaction, SHIPBroadcasterConfig, SHIPBroadcaster, Utils, LookupResolver, Beef, HTTPSOverlayBroadcastFacilitator, Script } from '@bsv/sdk'
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
import { toast } from 'react-toastify'
import { HodlockerToken, Token } from '../types/types'
import { TXIDHexString } from '@babbage/sdk-ts/out/src/sdk'

const BASKET_ID = 'hodlocker7'

Locksmith.loadArtifact(LocksmithArtifact)

// This locks the passed number of sats for the passed number of blocks
export const lock = async (
  satoshis: number, lockBlockCount: number, message: string, setHodlocker: React.Dispatch<React.SetStateAction<HodlockerToken[]>>, hodlocker: HodlockerToken[]): Promise<string | undefined> => {
  if (lockBlockCount < 0) {
    throw new Error('You need to lock to a future block or the current block, for immediate release')
  }
  if (satoshis < 3) {
    throw new Error('You need to lock at least 5 satoshis')
  }
  if (message.length < 1) {
    throw new Error(
      "You need to tell people why you are locking your coins, and why it is not a waste of your and everyone else's time and money."
    )
  }
  console.log('lock():satoshis', satoshis)
  console.log('lock():lockBlockCount', lockBlockCount)
  console.log('lock():message', message)
  console.log('lock():hodlocker', hodlocker)
  const walletClient = new WalletClient('json-api', 'non-admin.com')

  const currentBlockHeightObj = await walletClient.getHeight()
  const lockBlockHeight = currentBlockHeightObj.height + lockBlockCount

  const keyID = '1' // 🔐 This will be randomized eventually
  const publicKeyResponse = await walletClient.getPublicKey({
    protocolID: [0, 'hodlocker'],
    keyID
  })
  const rawPublicKey = publicKeyResponse.publicKey
  const derivedAddress = bsv.PublicKey.fromString(rawPublicKey).toAddress().toString()

  console.log(`🔑 Locking Step - Public Key: ${rawPublicKey}`)
  console.log(`🏠 Locking Step - Derived Address: ${derivedAddress}`)

  const address = bsv.PublicKey.fromString(rawPublicKey).toAddress()

  const signature = Utils.toHex(
    (
      await walletClient.createSignature({
        data: [1],
        protocolID: [0, 'hodlocker'],
        keyID,
        counterparty: 'self'
      })
    ).signature
  )

  const instance = new Locksmith(
    Addr(address.toByteString()),
    BigInt(lockBlockHeight),
    toByteString(signature, false)
  )

  const lockingScript = instance.lockingScript.toHex()

  // 🔹 Create the transaction first so we can extract the BEEF
  const newHodlockerToken = await walletClient.createAction({
    description: 'Create a Hodlocker lock',
    outputs: [
      {
        basket: BASKET_ID,
        lockingScript,
        satoshis,
        outputDescription: 'Hodlocker output'
      }
    ],
    options: { randomizeOutputs: false }
  })

  if (newHodlockerToken.tx == null) {
    throw new Error('Hodlocker Transaction is undefined')
  }

  const beefHex = Utils.toHex(newHodlockerToken.tx)
  // Store full metadata in the frontend state

  const transaction = Transaction.fromAtomicBEEF(newHodlockerToken.tx)
  const txid = transaction.id('hex')

  const facilitator = new HTTPSOverlayBroadcastFacilitator(fetch, true)
  const args: SHIPBroadcasterConfig = {
    networkPreset: 'local',
    facilitator,
    requireAcknowledgmentFromAnyHostForTopics: 'any'
  }

  const broadcaster = new SHIPBroadcaster(['tm_hodlocker'], args)
  const broadcasterResult = await broadcaster.broadcast(transaction)

  if (broadcasterResult.status === 'error') {
    console.log('broadcasterResult.description:', broadcasterResult.description)
    throw new Error('Transaction failed to broadcast')
  }

  toast.dark('✅ Hodlocker successfully created!')

  const lockUntilHeight = lockBlockHeight

  setHodlocker((original: HodlockerToken[]) => [
    {
      token: {
        atomicBeefTX: beefHex,
        txid,
        outputIndex: 0,
        lockingScript,
        satoshis
      },
      keyID,
      signature,
      lockUntilHeight,
      message,
      address: address.toString(),
      contract: lockingScript
    },
    ...original
  ])
  setTimeout(() => {
    console.log('hodlockerToken:', hodlocker)
  }, 1000)

  return txid
}

/**
 * Lists all currently active locks.
 *
 * @returns {Promise<Array<{ sats: number, left: number, message: string }>>} - A promise resolving to an array of active locks.
 */
export const list = async (
  walletClient: WalletClient,
  hodlocker: HodlockerToken[]
): Promise<Array<{ sats: number, left: number, message: string }>> => {
  const currentBlockHeight = await walletClient.getHeight()

  console.log('🛠️ Checking hodlocker before listContracts', JSON.stringify(hodlocker, null, 2))
  const contracts = await listContracts(
    BASKET_ID,
    hodlocker,

    (lockingScript: string) => {
      return Locksmith.fromLockingScript(lockingScript) as Locksmith
    }
  )

  return contracts.map(x => {
    const locksmith = x.contract

    const sats = x.outputs.length > 0 ? x.outputs[0].satoshis : 0
    const lockUntil = Number(locksmith.lockUntilHeight)
    const messageHex = locksmith.message?.toString?.() ?? ''
    const message = Buffer.from(messageHex, 'hex').toString('utf8')

    return {
      sats,
      left: lockUntil - currentBlockHeight.height,
      message
    }
  })
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
  hodlocker: HodlockerToken[],
  refreshCallback: () => void
): Promise<void> => {
  console.log('🕵️‍♂️ Watchman started...')

  const walletClient = new WalletClient('json-api', 'non-admin.com')

  try {
    // ✅ 1. Retrieve current block height
    const currentBlockHeight = await walletClient.getHeight()
    console.log('⏳ Current block height:', currentBlockHeight.height)

    // ✅ 2. Process each HodlockerToken directly
    for (const hodlock of hodlocker) {
      const { token, keyID, lockUntilHeight, message } = hodlock

      console.log(
        `🔄 Checking contract ${token.txid}: LockHeight=${lockUntilHeight}, CurrentHeight=${currentBlockHeight.height}, keyID=${keyID}`
      )

      if (currentBlockHeight.height < lockUntilHeight) {
        console.log(`🔒 Contract ${token.txid} still locked, skipping.`)
        continue
      }

      console.log(`🔓 Unlocking contract:${truncate(token.txid, 120)}`)

      // ✅ 3. Retrieve and verify transaction
      let fromTx
      try {
        const BEEF = verifyTruthy(Utils.toArray(token.atomicBeefTX, 'hex'))
        const tx = Transaction.fromAtomicBEEF(BEEF)
        fromTx = new bsv.Transaction(tx.toHex())

        console.log(`✅ Retrieved transaction for ${token.txid}`)
        console.log('🔍 Transaction Inputs:', fromTx.inputs)
      } catch (error) {
        console.error(`❌ ERROR: Failed to retrieve transaction for ${token.txid}:`, (error as Error).message)
        continue
      }

      // ✅ 4. Define redeem function
      const redeemHydrator = async (self: SmartContract): Promise<void> => {
        console.log(`🔓 Redeeming contract ${token.txid}...`)

        const instance = self as Locksmith
        const script = fromTx.outputs[token.outputIndex ?? 0]?.script

        // Ensure script is valid
        if (!script || !(script instanceof bsv.Script)) {
          throw new Error(`⚠️ ERROR: Locking script is missing or invalid for ${token.txid}`)
        }

        console.log(`🔒 Locking Script: ${script.toHex()}`)

        // Create unlocking transaction
        const bsvtx = new bsv.Transaction()
        bsvtx.from({
          txId: token.txid,
          outputIndex: token.outputIndex ?? 0,
          script: script.toHex(),
          satoshis: token.satoshis
        })
        bsvtx.inputs[0].sequenceNumber = 0xfffffffe
        bsvtx.nLockTime = lockUntilHeight

        const hashType =
          bsv.crypto.Signature.SIGHASH_NONE |
          bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
          bsv.crypto.Signature.SIGHASH_FORKID

        console.log(`📝 Hash Type: ${hashType}`)

        // Generate preimage
        let preimage, hashbuf
        try {
          preimage = bsv.Transaction.Sighash.sighashPreimage(
            bsvtx,
            hashType,
            0,
            script,
            new bsv.crypto.BN(token.satoshis)
          )
          console.log(`📜 Preimage Generated: ${preimage.toString('hex')}`)
        } catch (error) {
          console.error(`❌ ERROR: Failed to generate preimage for ${token.txid}:`, (error as Error).message)
          console.error('🔍 Token Data:', JSON.stringify(token, null, 2))
          return
        }

        try {
          hashbuf = bsv.crypto.Hash.sha256(preimage)
          console.log(`🔗 Hash Buffer: ${hashbuf.toString('hex')}`)
        } catch (error) {
          console.error(`❌ ERROR: Failed to compute hash buffer for ${token.txid}:`, (error as Error).message)
          return
        }

        console.log(`🔑 Requesting signature for contract ${token.txid}...`)

        let SDKSignature
        try {
          SDKSignature = await walletClient.createSignature({
            protocolID: [0, 'hodlocker'],
            keyID,
            data: Array.from(hashbuf)
          })

          if (!SDKSignature.signature || !Array.isArray(SDKSignature.signature)) {
            throw new Error('⚠️ ERROR: Invalid SDKSignature format received.')
          }
        } catch (error) {
          console.error(`❌ ERROR: Failed to get signature for ${token.txid}:`, (error as Error).message)
          return
        }

        console.log(`✅ Signature retrieved for ${token.txid}:`, SDKSignature.signature)

        let signatureHex, signature
        try {
          signatureHex = Buffer.from(SDKSignature.signature).toString('hex')
          signature = bsv.crypto.Signature.fromString(signatureHex)
          signature.nhashtype = hashType

          console.log(`🖊️ Signature Hex: ${signatureHex}`)
        } catch (error) {
          console.error(`❌ ERROR: Failed to process signature for ${token.txid}:`, (error as Error).message)
          return
        }

        let publicKey: { publicKey: string } // Ensure correct type
        const derivedPublicKey: string = '' // ✅ Explicitly declare and initialize

        try {
          debugLockingScript(token.lockingScript)
          const keyID = '1'
          const lockPublicKeyResponse = await walletClient.getPublicKey({
            protocolID: [0, 'hodlocker'],
            keyID
          })
          const unlockPublicKeyResponse = await walletClient.getPublicKey({
            protocolID: [0, 'hodlocker'],
            keyID
          })

          console.log(`🔑 Lock Public Key: ${lockPublicKeyResponse.publicKey}`)
          console.log(`🔑 Unlock Public Key: ${unlockPublicKeyResponse.publicKey}`)

          const unlockRawPublicKey = unlockPublicKeyResponse.publicKey
          const unlockDerivedAddress = bsv.PublicKey.fromString(unlockRawPublicKey).toAddress().toString()

          console.log(`🔑 Unlocking Step - Public Key: ${unlockRawPublicKey}`)
          console.log(`🏠 Unlocking Step - Derived Address: ${unlockDerivedAddress}`)
          console.log(`🔹 Contract Address (Stored in instance): ${instance.address.toString()}`)

          if (unlockDerivedAddress !== instance.address.toString()) {
            throw new Error(`❌ Public Key Mismatch! Derived Address ${unlockDerivedAddress} does not match Contract Address ${instance.address.toString()}`)
          }

          console.log('✅ Address validation successful!')

          // ✅ Assign Transaction References
          console.log('🔍 Assigning transaction references...')
          instance.from = {
            tx: fromTx,
            outputIndex: token.outputIndex ?? 0
          }
          instance.to = {
            tx: bsvtx,
            inputIndex: 0
          }

          // ✅ Log Contract Instance Before Unlocking
          console.log('📑 Contract instance before unlocking:')
          console.log(`🔹 Address: ${instance.address.toString()}`)
          console.log(`🔹 Lock Until Height: ${instance.lockUntilHeight}`)
          console.log('🔹 From TX:', JSON.stringify(instance.from, null, 2))
          console.log('🔹 To TX:', JSON.stringify(instance.to, null, 2))

          // ✅ Attempt Unlocking
          console.log(`🔓 Attempting to unlock contract ${token.txid}...`)
          // instance.unlock(
          //   Sig(toByteString(signature.toTxFormat().toString('hex'))),
          //   PubKey(toByteString(rawPublicKey))
          // )

          console.log(`✅ Successfully unlocked contract ${token.txid}!`)
        } catch (error) {
          console.error(`❌ ERROR unlocking contract ${token.txid}:`, (error as Error).message)
        }
      }
      // ✅ 5. Execute redeemContract
      try {
        console.log(`🚀 Executing redeemContract for ${token.txid}`)
        // 📌 Generate redemption hex for manual submission
        console.log(`fromTx:${truncate(fromTx.toString(), 120)}`)

        await redeemContract(
          {
            contract: Locksmith.fromLockingScript(token.lockingScript) as Locksmith,
            txid: token.txid,
            BEEF: token.atomicBeefTX,
            outputs: [
              {
                lockingScript: token.lockingScript,
                satoshis: token.satoshis,
                outpoint: `${token.txid}.${token.outputIndex}`,
                spendable: false
              }
            ]
          },
          redeemHydrator,
          'Recover previously-locked coins',
          Number(lockUntilHeight),
          0xfffffffe
        )
        console.log(`✅ Successfully redeemed ${token.txid}`)
      } catch (error) {
        console.error(`❌ ERROR unlocking contract ${token.txid}:`, (error as Error).message)
      }

      refreshCallback()
    }
  } catch (error) {
    console.error('❌ ERROR in Watchman execution:', (error as Error).message)
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

export const lookupHodlockerByTxid = async (
  txid: string
): Promise<Partial<HodlockerToken> | undefined> => {
  try {
    console.log('🔍 lookupHodlockerByTxid: Looking up Hodlocker by txid:', txid)

    if (!txid) {
      console.warn('⚠️ lookupHodlockerByTxid called with undefined txid!')
      return undefined
    }

    const resolver = new LookupResolver({ networkPreset: 'local' })
    const lookupResult = await resolver.query({
      service: 'ls_hodlocker',
      query: { findAll: true }
    })

    const res = await fetch('http://localhost:8080/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'ls_hodlocker',
        query: { txid }
      })
    })

    const data = await res.json()
    console.log('🔎 Lookup result:', data)

    if (!data || data.type !== 'output-list' || !data.outputs.length) {
      console.warn('⚠️ No Hodlocker records found for txid:', txid)
      return undefined
    }

    const result = data.outputs[0]
    const beefHex = Utils.toHex(result.beef)
    console.log('🔬 BEEF (non-atomic):', beefHex)

    let script: string | undefined = result.lockingScript // ✅ fallback or primary
    let satoshis: number | undefined = result.satoshis // also sometimes included

    // Only attempt to decode BEEF if it's atomic
    if (beefHex.startsWith('ef2240201') || beefHex.startsWith('ef2240202')) {
      try {
        const tx = Transaction.fromAtomicBEEF(result.beef)
        const index = Number(result.outputIndex)

        const output = tx.outputs[index]
        script = output.lockingScript.toHex()
        satoshis = output.satoshis
      } catch (e) {
        console.warn('⚠️ Valid prefix but failed to decode BEEF:', (e as Error).message)
      }
    } else {
      console.warn(`⚠️ Invalid BEEF prefix: ${beefHex.slice(0, 10)}`)
    }

    if (!script) {
      console.error('❌ No lockingScript available. Cannot proceed.')
      return undefined
    }

    const hodlocker = Locksmith.fromLockingScript(script) as Locksmith

    return {
      token: {
        txid,
        outputIndex: Number(result.outputIndex),
        lockingScript: script,
        satoshis
      },
      lockUntilHeight: Number(hodlocker.lockUntilHeight),
      message: hodlocker.message
    } as Partial<HodlockerToken>
  } catch (error) {
    console.error('❌ Lookup failed:', (error as Error).message)
    return undefined
  }
}

/**
 * Truncates a string to a specified length, adding "..." if it exceeds the limit.
 *
 * @param str - The input string to truncate.
 * @param length - The maximum number of characters before adding ellipses.
 * @returns The truncated string with "..." if it exceeds the specified length.
 */
export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str // No need to truncate
  return str.slice(0, length) + '...'
}

export const verifyLockingScript = (lockingScript: string) => {
  const script = bsv.Script.fromASM(lockingScript)

  // Check for required opcodes
  const containsCheckSig = script.chunks.some(chunk => chunk.opcodenum === bsv.Opcode.OP_CHECKSIG)
  const containsLockTimeVerify = script.chunks.some(chunk => chunk.opcodenum === bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)

  if (!containsCheckSig) {
    throw new Error('Locking script is missing OP_CHECKSIG')
  }

  if (!containsLockTimeVerify) {
    console.warn('Locking script does not enforce a time lock (OP_CHECKLOCKTIMEVERIFY)')
  }

  console.log('✅ Locking script is valid:', lockingScript)
}

export const debugLockingScript = (lockingScript: string) => {
  console.log("🔍 Raw Locking Script:", lockingScript)

  try {
      // Convert ASM script
      const script = bsv.Script.fromASM(lockingScript)
      const asm = script.toASM()
      const hex = script.toHex()

      console.log("✅ Parsed Locking Script ASM:", asm)
      console.log("✅ Parsed Locking Script Hex:", hex)

      // Check if OP_CHECKSIG is present
      if (!asm.includes("OP_CHECKSIG")) {
          console.error("❌ OP_CHECKSIG is missing from the locking script!")
      } else {
          console.log("✅ OP_CHECKSIG is present in the locking script!")
      }

  } catch (error) {
      console.error("❌ Error parsing locking script:", (error as Error).message)
  }
}

