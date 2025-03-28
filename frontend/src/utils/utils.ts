import { LocksmithArtifact, Locksmith } from '@bsv/backend'
import {
  WalletClient,
  Transaction,
  SHIPBroadcaster,
  Utils,
  CreateActionArgs,
  SecurityLevel
} from '@bsv/sdk'
import {
  bsv,
  type SmartContract,
  Addr,
  Sig,
  PubKey,
  toByteString
} from 'scrypt-ts'
import { toast } from 'react-toastify'
import { HodlockerToken } from '../types/types'

// Define custom types explicitly as strings or numbers
type TXIDHexString = string
type PositiveIntegerOrZero = number

const BASKET_ID = 'hodlocker10'
const MIN_SATOSHIS = 3
const API_ENDPOINT = 'non-admin.com'
const PROTOCOL_ID: [SecurityLevel, string] = [0 as SecurityLevel, 'hodlocker']

Locksmith.loadArtifact(LocksmithArtifact)

interface LockErrorMessages {
  invalidBlockCount: string
  insufficientSatoshis: string
  emptyMessage: string
  undefinedTransaction: string
  broadcastFailed: string
}

// This locks the passed number of sats for the passed number of blocks
export const lock = async (
  satoshis: number,
  lockBlockCount: number,
  message: string,
  setHodlocker: React.Dispatch<React.SetStateAction<HodlockerToken[]>>,
  hodlocker: HodlockerToken[]
): Promise<string> => {
  const errors: LockErrorMessages = {
    invalidBlockCount: 'You need to lock to a future block',
    insufficientSatoshis: `You need to lock at least ${MIN_SATOSHIS} satoshis`,
    emptyMessage: "You need to provide a message explaining why you're locking your coins",
    undefinedTransaction: 'Failed to create Hodlocker transaction',
    broadcastFailed: 'Failed to broadcast transaction'
  }

  // Explicit number check
  if (lockBlockCount <= 0 || Number.isNaN(lockBlockCount)) throw new Error(errors.invalidBlockCount)
  // Explicit number check
  if (satoshis < MIN_SATOSHIS || Number.isNaN(satoshis)) throw new Error(errors.insufficientSatoshis)
  // Explicit empty string check
  if (message.trim() === '') throw new Error(errors.emptyMessage)

  try {
    const walletClient = new WalletClient('json-api', API_ENDPOINT)
    const currentBlockHeightObj = await walletClient.getHeight()
    // Explicit number check
    if (currentBlockHeightObj?.height == null || Number.isNaN(currentBlockHeightObj.height)) {
      throw new Error('Failed to fetch current block height')
    }

    const lockBlockHeight = currentBlockHeightObj.height + lockBlockCount
    const keyID = '1' // TODO: Randomize this in future iterations

    const publicKeyResponse = await walletClient.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self'
    })
    // Explicit string check
    if (publicKeyResponse?.publicKey === undefined || publicKeyResponse.publicKey === '') {
      throw new Error('Failed to fetch public key')
    }

    const rawPublicKey = publicKeyResponse.publicKey
    const address = bsv.PublicKey.fromString(rawPublicKey).toAddress()
    const instance = new Locksmith(
      Addr(address.toByteString()),
      BigInt(lockBlockHeight),
      toByteString(message, true)
    )

    const lockingScript = instance.lockingScript.toHex()
    const newHodlockerToken = await walletClient.createAction({
      description: 'Create a Hodlocker lock',
      outputs: [{
        basket: BASKET_ID,
        lockingScript,
        satoshis,
        outputDescription: 'Hodlocker output'
      }],
      options: { randomizeOutputs: false }
    })

    if (newHodlockerToken.tx == null) throw new Error(errors.undefinedTransaction)

    const transaction = Transaction.fromAtomicBEEF(newHodlockerToken.tx)
    const txid = transaction.id('hex')
    const broadcaster = new SHIPBroadcaster(['tm_hodlocker'], { networkPreset: 'local' })
    const broadcastResult = await broadcaster.broadcast(transaction)

    // Explicit string check
    if (broadcastResult.status === 'error') {
      throw new Error(`${errors.broadcastFailed}: ${broadcastResult.description || 'Unknown error'}`)
    }

    const newToken: HodlockerToken = {
      token: {
        atomicBeefTX: Utils.toHex(newHodlockerToken.tx),
        txid,
        outputIndex: 0,
        lockingScript,
        satoshis
      },
      keyID,
      lockUntilHeight: lockBlockHeight,
      message: Buffer.from(message, 'utf8').toString('hex'),
      address: address.toString()
    }

    setHodlocker((prev) => [newToken, ...prev])
    toast.dark('✅ Hodlocker successfully created!')

    console.debug('Hodlocker Token Created:', { txid, lockBlockHeight, satoshis })
    return txid
  } catch (error) {
    console.error('Locking failed:', error)
    toast.error(`Failed to create Hodlocker: ${(error as Error).message}`)
    throw error
  }
}

// Watches for when locked coins can be redeemed
export const startBackgroundUnlockWatchman = async (
  hodlocker: HodlockerToken[]
): Promise<void> => {
  console.debug('Starting unlock watchman...')

  const walletClient = new WalletClient('json-api', API_ENDPOINT)

  try {
    const currentBlockHeight = await walletClient.getHeight()
    // Explicit number check
    if (currentBlockHeight?.height == null || Number.isNaN(currentBlockHeight.height)) {
      throw new Error('Failed to fetch current block height')
    }

    await Promise.all(hodlocker.map(async (hodlock) => {
      const { token, keyID, lockUntilHeight } = hodlock

      // Explicit number check
      if (currentBlockHeight.height < lockUntilHeight || Number.isNaN(currentBlockHeight.height)) {
        console.debug(`Contract ${token.txid as TXIDHexString} still locked until height ${lockUntilHeight}`)
        return
      }

      try {
        const contract = Locksmith.fromLockingScript(token.lockingScript)
        const atomicBeef = Utils.toArray(token.atomicBeefTX, 'hex')
        const tx = Transaction.fromAtomicBEEF(atomicBeef)
        const parsedFromTx = new bsv.Transaction(tx.toHex())

        if (!parsedFromTx.inputs?.length || parsedFromTx.inputs[0]?.prevTxId == null) {
          throw new Error(`Invalid transaction inputs for ${token.txid as TXIDHexString}`)
        }

        const unlockingScript = await contract.getUnlockingScript(async (self: SmartContract) => {
          const locksmithSelf = self as Locksmith
          const bsvtx = new bsv.Transaction()
          bsvtx.from({
            txId: token.txid,
            outputIndex: token.outputIndex,
            script: token.lockingScript,
            satoshis: token.satoshis
          })
          bsvtx.inputs[0].sequenceNumber = 0xfffffffe
          bsvtx.nLockTime = lockUntilHeight

          const hashType = bsv.crypto.Signature.SIGHASH_NONE |
                         bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
                         bsv.crypto.Signature.SIGHASH_FORKID
          const scriptInstance = bsv.Script.fromHex(token.lockingScript)
          const preimage = bsv.Transaction.Sighash.sighashPreimage(
            bsvtx,
            hashType,
            0,
            scriptInstance,
            new bsv.crypto.BN(token.satoshis)
          )
          const preimageHash = bsv.crypto.Hash.sha256(preimage)

          const sdkSignature = await walletClient.createSignature({
            protocolID: PROTOCOL_ID,
            keyID,
            counterparty: 'self',
            data: Array.from(preimageHash)
          })
          // Explicit string check
          if (sdkSignature?.signature === undefined) {
            throw new Error('Failed to create signature')
          }

          const signatureBuf = Buffer.from(sdkSignature.signature)
          const signature = bsv.crypto.Signature.fromDER(signatureBuf)
          signature.nhashtype = hashType

          const publicKeyResp = await walletClient.getPublicKey({
            protocolID: PROTOCOL_ID,
            keyID,
            counterparty: 'self'
          })
          // Explicit string check
          if (publicKeyResp?.publicKey === undefined || publicKeyResp.publicKey === '') {
            throw new Error('Failed to fetch public key')
          }

          locksmithSelf.to = { tx: bsvtx, inputIndex: 0 }
          locksmithSelf.from = { tx: parsedFromTx, outputIndex: 0 }
          locksmithSelf.unlock(
            Sig(toByteString(signature.toTxFormat().toString('hex'))),
            PubKey(toByteString(publicKeyResp.publicKey))
          )
        })

        const broadcastActionParams: CreateActionArgs = {
          description: 'Unlock Locksmith contract',
          inputBEEF: atomicBeef,
          lockTime: lockUntilHeight,
          inputs: [{
            outpoint: `${token.txid as TXIDHexString}.${token.outputIndex as PositiveIntegerOrZero}`,
            unlockingScript: unlockingScript.toHex(),
            sequenceNumber: 0xfffffffe,
            inputDescription: 'Unlocking Locksmith contract'
          }],
          options: { acceptDelayedBroadcast: true }
        }

        const newToken = await walletClient.createAction(broadcastActionParams)
        if (newToken?.txid == null || newToken?.tx == null) {
          throw new Error(`Failed to create unlock transaction for ${token.txid as TXIDHexString}`)
        }

        await new SHIPBroadcaster(['tm_hodlocker'], { networkPreset: 'local' })
          .broadcast(Transaction.fromAtomicBEEF(newToken.tx))

        console.info(`Successfully unlocked ${token.txid as TXIDHexString}, new txid: ${newToken.txid}`)
      } catch (error) {
        console.error(`Failed to unlock ${token.txid as TXIDHexString}:`, error)
      }
    }))
  } catch (error) {
    console.error('Watchman execution failed:', error)
    throw error
  }
}

/**
 * Truncates a string to a specified length, adding "..." if it exceeds the limit.
 * @param str - The input string to truncate
 * @param length - Maximum length before truncation
 * @returns Truncated string with ellipsis if needed
 */
export const truncate = (str: string, length: number): string => {
  // Explicit nullish and length check
  if (str === '' || str == null || str.length <= length || Number.isNaN(length)) return str
  return `${str.slice(0, length)}...`
}
