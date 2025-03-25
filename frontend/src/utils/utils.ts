import { LocksmithArtifact } from '@bsv/backend'
import { Locksmith } from '../../../backend/src/contracts/Locksmith'
import { WalletClient, Transaction, SHIPBroadcasterConfig, SHIPBroadcaster, Utils, LookupResolver, Beef, HTTPSOverlayBroadcastFacilitator } from '@bsv/sdk'
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

const BASKET_ID = 'hodlocker5'

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

  const walletClient = new WalletClient('json-api', 'non-admin.com')

  const currentBlockHeightObj = await walletClient.getHeight()
  const lockBlockHeight = currentBlockHeightObj.height + lockBlockCount

  const keyID = '1' // 🔐 This will be randomized eventually
  const publicKeyResponse = await walletClient.getPublicKey({
    protocolID: [0, 'hodlocker'],
    keyID
  })
  const rawPublicKey = publicKeyResponse.publicKey
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
    options: { noSend: true, randomizeOutputs: false }
  })

  if (!newHodlockerToken.tx) {
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
  hodlocker: HodlockerToken[],
): Promise<Array<{ sats: number, left: number, message: string }>> => {
  const currentBlockHeight = await walletClient.getHeight()

  console.log(`🛠️ Checking hodlocker before listContracts`, JSON.stringify(hodlocker, null, 2))
  const contracts = await listContracts(
    BASKET_ID,
    hodlocker,

    (lockingScript: string) => {
      return Locksmith.fromLockingScript(lockingScript) as Locksmith
    }
  )
  
  return contracts.map(x => {
    const locksmith = x.contract as Locksmith

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
  console.log('🕵️‍♂️ Watchman loop started...')

  const walletClient = new WalletClient('json-api', 'non-admin.com')
  let previousBlock = 0

  while (true) {
    console.log('🔁 Watchman loop iteration started...')

    try {
      // ✅ 1. Retrieve current block height
      const currentBlockHeight = await walletClient.getHeight()
      console.log('⏳ Current block height:', currentBlockHeight.height)

      if (currentBlockHeight.height === previousBlock) {
        console.log('⏳ Block height unchanged, waiting 6s...')
        await new Promise(resolve => setTimeout(resolve, 6000))
        continue
      } else {
        previousBlock = currentBlockHeight.height
      }

      // ✅ 2. Fetch contracts from basket
      console.log('📥 Fetching contracts from listContracts...')
      let contracts = []
      try {
        contracts = await listContracts(BASKET_ID, hodlocker, (lockingScript: string) => {
          console.log('🔎 Received lockingScript:', lockingScript)

          if (!lockingScript) {
            console.error('⚠️ ERROR: Found a contract with undefined lockingScript!')
            throw new Error('Locking script is undefined!')
          }

          return Locksmith.fromLockingScript(lockingScript) as Locksmith
        })
        console.log(`✅ Retrieved ${contracts.length} contract(s)`)
      } catch (error) {
        console.error('❌ ERROR: listContracts failed:', (error as Error).message)
        await new Promise(resolve => setTimeout(resolve, 6000))
        continue // Prevent loop from stopping
      }

      // ✅ 3. Process each contract
      for (const contract of contracts) {
        if (!contract.outputs[0]?.customInstructions) {
          console.log(`⚠️ Skipping contract ${contract.txid}, missing customInstructions`)
          continue
        }

        const customInstructions = contract.outputs[0].customInstructions.split(',')
        const keyID = customInstructions[0]
        const lockBlockHeight = Number(customInstructions[1])

        console.log(`🔄 Checking contract ${contract.txid}: LockHeight=${lockBlockHeight}, Current=${currentBlockHeight.height}`)

        if (currentBlockHeight.height < lockBlockHeight) {
          console.log(`🔒 Contract ${contract.txid} still locked, skipping.`)
          continue
        }

        console.log(`🔓 Unlocking contract ${contract.txid}...`)

        // ✅ 4. Retrieve and verify transaction
        let fromTx
        try {
          const BEEF = verifyTruthy(Utils.toArray(contract.BEEF, 'hex'))
          const tx = Transaction.fromAtomicBEEF(BEEF)
          fromTx = new bsv.Transaction(tx.toHex())
          console.log(`✅ Retrieved transaction for ${contract.txid}`)
        } catch (error) {
          console.error(`❌ ERROR: Failed to retrieve transaction for ${contract.txid}:`, (error as Error).message)
          continue
        }

        contract.contract.from = { tx: fromTx, outputIndex: 0 }

        // ✅ 5. Define redeem function
        const redeemHydrator = async (self: SmartContract): Promise<void> => {
          console.log(`🔓 Redeeming contract ${contract.txid}...`)

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

          console.log(`🔑 Requesting signature for contract ${contract.txid}...`)

          let SDKSignature
          try {
            SDKSignature = await walletClient.createSignature({
              protocolID: [0, 'hodlocker'],
              keyID,
              data: Array.from(hashbuf)
            })

            if (!SDKSignature.signature || !Array.isArray(SDKSignature.signature)) {
              throw new Error('Invalid SDKSignature format received.')
            }
          } catch (error) {
            console.error(`❌ ERROR: Failed to get signature for ${contract.txid}:`, (error as Error).message)
            return
          }

          console.log(`✅ Signature retrieved for ${contract.txid}`)

          const signatureHex = Buffer.from(SDKSignature.signature).toString('hex')
          const signature = bsv.crypto.Signature.fromString(signatureHex)
          signature.nhashtype = hashType

          const publicKey = await walletClient.getPublicKey({ keyID })

          console.log(`✅ Public key retrieved for contract ${contract.txid}`)

          instance.unlock(
            Sig(toByteString(signature.toTxFormat().toString('hex'))),
            PubKey(toByteString(publicKey.publicKey))
          )
        }

        // ✅ 6. Execute redeemContract
        try {
          console.log(`🚀 Executing redeemContract for ${contract.txid}`)
          await redeemContract(
            contract,
            redeemHydrator,
            'Recover previously-locked coins',
            lockBlockHeight,
            0xfffffffe
          )
          console.log(`✅ Successfully redeemed ${contract.txid}`)
        } catch (error) {
          console.error(`❌ ERROR unlocking contract ${contract.txid}:`, (error as Error).message)
        }

        refreshCallback()
      }
    } catch (error) {
      console.error('❌ ERROR in Watchman loop:', (error as Error).message)
    }

    console.log('⏳ Watchman waiting 6 seconds before next loop...')
    await new Promise(resolve => setTimeout(resolve, 18000))
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




