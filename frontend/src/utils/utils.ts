import { LocksmithArtifact, Locksmith } from '@bsv/backend'
import {
  WalletClient,
  Transaction,
  SHIPBroadcasterConfig,
  SHIPBroadcaster,
  Utils,
  CreateActionArgs,
  SendWithResult,
  TXIDHexString,
  AtomicBEEF,
  OutpointString
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

const BASKET_ID = 'hodlocker10'

Locksmith.loadArtifact(LocksmithArtifact)

/**
 * Checks for unsuccessful createAction results and throws an error if any are found.
 *
 * @param result - The result from a createAction call.
 * @throws Error if transaction data is missing or invalid.
 */
function throwIfAnyUnsuccessfulCreateActions (result: {
  sendWithResults?: SendWithResult[]
  txid?: TXIDHexString
  tx?: AtomicBEEF
  noSendChange?: OutpointString[]
}): void {
  if (
    result.txid === undefined ||
    result.txid === null ||
    result.tx === undefined ||
    result.tx === null
  ) {
    throw new Error('Transaction creation failed: missing tx or txid')
  }
}

/**
 * Locks a specified number of satoshis until a future block height with an associated message.
 *
 * @param satoshis - Number of satoshis to lock.
 * @param lockBlockCount - Number of blocks to lock for (0 for immediate release).
 * @param message - Message justifying the lock.
 * @param setHodlocker - State setter for Hodlocker tokens.
 * @param hodlocker - Current array of Hodlocker tokens.
 * @returns The transaction ID of the lock, or undefined if it fails.
 * @throws Error if inputs are invalid, transaction fails, or results require review.
 */
export const lock = async (
  satoshis: number,
  lockBlockCount: number,
  message: string,
  setHodlocker: React.Dispatch<React.SetStateAction<HodlockerToken[]>>,
  hodlocker: HodlockerToken[]
): Promise<string | undefined> => {
  if (lockBlockCount < 0) {
    throw new Error('Lock block count must be zero or positive')
  }
  if (satoshis < 3) {
    throw new Error('Minimum lock amount is 3 satoshis')
  }
  if (message.length < 1) {
    throw new Error('Message is required to justify the lock')
  }

  const walletClient = new WalletClient('json-api', 'localhost')
  const currentBlockHeightObj = await walletClient.getHeight()
  const lockBlockHeight = currentBlockHeightObj.height + lockBlockCount
  console.log(
    'lock: currentBlockHeight:',
    currentBlockHeightObj.height,
    'lockBlockCount:',
    lockBlockCount,
    'lockUntilHeight:',
    lockBlockHeight
  )

  const keyID = '1' // TODO: Randomize in production
  const publicKeyResponse = await walletClient.getPublicKey({
    protocolID: [0, 'hodlocker'],
    keyID,
    counterparty: 'self'
  })
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

  throwIfAnyUnsuccessfulCreateActions(newHodlockerToken)

  if (newHodlockerToken.tx === undefined || newHodlockerToken.tx === null) {
    throw new Error('Failed to create Hodlocker transaction')
  }

  const transaction = Transaction.fromAtomicBEEF(newHodlockerToken.tx)
  const txid: string = transaction.id('hex')

  const args: SHIPBroadcasterConfig = {
    networkPreset: 'local'
  }
  const broadcaster = new SHIPBroadcaster(['tm_hodlocker'], args)
  const broadcasterResult = await broadcaster.broadcast(transaction)

  if (broadcasterResult.status === 'error') {
    throw new Error('Transaction broadcast failed')
  }

  toast.dark('Hodlocker successfully created!')

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

  setHodlocker(original => [newToken, ...original])

  return txid
}

/**
 * Monitors Hodlocker tokens and unlocks them when their lock height is reached.
 *
 * @param hodlocker - Array of Hodlocker tokens to monitor.
 * @returns Array of successfully redeemed tokens.
 * @throws Logs errors for individual unlock failures but continues processing.
 */
export const startBackgroundUnlockWatchman = async (
  hodlocker: HodlockerToken[]
): Promise<HodlockerToken[]> => {
  console.log('startBackgroundUnlockWatchman')
  const walletClient = new WalletClient('json-api', 'localhost')
  const redeemedTokens: HodlockerToken[] = []

  try {
    const currentBlockHeight = await walletClient.getHeight()
    console.log(
      'startBackgroundUnlockWatchman:currentBlockHeight:',
      currentBlockHeight
    )

    for (const hodlock of hodlocker) {
      const { token, keyID, lockUntilHeight } = hodlock

      if (currentBlockHeight.height < lockUntilHeight) {
        continue
      }

      try {
        const LocksmithContract = Locksmith.fromLockingScript(
          token.lockingScript
        )
        const atomicBeef = Utils.toArray(token.atomicBeefTX, 'hex')
        const tx = Transaction.fromAtomicBEEF(atomicBeef)
        const parsedFromTx = new bsv.Transaction(tx.toHex())

        if (
          parsedFromTx.inputs.length === 0 ||
          parsedFromTx.inputs[0]?.prevTxId === undefined
        ) {
          console.error(
            `❌ Invalid inputs in transaction for txid ${String(token.txid)}`
          )
          continue
        }

        const unlockingScript = await LocksmithContract.getUnlockingScript(
          async (self: SmartContract) => {
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

            const hashType =
              bsv.crypto.Signature.SIGHASH_NONE |
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
              protocolID: [0, 'hodlocker'],
              keyID,
              counterparty: 'self',
              data: Array.from(preimageHash)
            })

            const signatureBuf = Buffer.from(sdkSignature.signature)
            const signature = bsv.crypto.Signature.fromDER(signatureBuf)
            signature.nhashtype = hashType

            const publicKeyResp = await walletClient.getPublicKey({
              protocolID: [0, 'hodlocker'],
              keyID,
              counterparty: 'self'
            })
            const publicKeyHex = publicKeyResp.publicKey

            locksmithSelf.to = { tx: bsvtx, inputIndex: 0 }
            locksmithSelf.from = { tx: parsedFromTx, outputIndex: 0 }
            locksmithSelf.unlock(
              Sig(toByteString(signature.toTxFormat().toString('hex'))),
              PubKey(toByteString(publicKeyHex))
            )
          }
        )

        const broadcastActionParams: CreateActionArgs = {
          description: 'Unlock Locksmith contract',
          inputBEEF: atomicBeef,
          lockTime: lockUntilHeight,
          inputs: [
            {
              outpoint: `${String(token.txid)}.${Number(
                token.outputIndex
              )}` as const,
              unlockingScript: unlockingScript.toHex(),
              sequenceNumber: 0xfffffffe,
              inputDescription: 'Unlocking Locksmith contract'
            }
          ],
          options: {
            acceptDelayedBroadcast: true
          }
        }

        const newToken = await walletClient.createAction(broadcastActionParams)
        throwIfAnyUnsuccessfulCreateActions(newToken)

        if (newToken.txid === undefined || newToken.txid === null) {
          throw new Error(
            `Transaction creation failed for ${String(
              token.txid
            )}: txid is undefined`
          )
        }
        if (newToken.tx === undefined || newToken.tx === null) {
          throw new Error(`Transaction data missing for ${String(token.txid)}`)
        }

        await new SHIPBroadcaster(['tm_hodlocker'], {
          networkPreset: 'local'
        }).broadcast(Transaction.fromAtomicBEEF(newToken.tx))

        console.log(`✅ Successfully unlocked token ${String(token.txid)}`)
        redeemedTokens.push(hodlock)
      } catch (error) {
        console.error(
          `❌ Error unlocking contract ${String(token.txid)}:`,
          (error as Error).message
        )
        continue
      }
    }
  } catch (error) {
    console.error('❌ Error in watchman execution:', (error as Error).message)
  }

  return redeemedTokens
}

/**
 * Truncates a string to a specified length, appending "..." if needed.
 *
 * @param str - The input string to truncate.
 * @param length - Maximum length before truncation.
 * @returns The truncated string.
 */
export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}
