import { Locksmith } from './contracts/Locksmith'
import artifact from './contracts/Locksmith.json'
import { bsv, SmartContract, Addr, Sig, PubKey, toByteString } from 'scrypt-ts'
import { deployContract, listContracts, redeemContract } from 'babbage-scrypt-helpers'
import { getPublicKey, createSignature } from '@babbage/sdk-ts'
import crypto from 'crypto'
import Whatsonchain from 'whatsonchain'

const BASKET_ID = 'locksmith'
const PROTOCOL_ID = 'locksmith'

const woc = new Whatsonchain('testnet')
Locksmith.loadArtifact(artifact)

// This locks the passed number of sats for the passed number of blocks
export const lock = async (
    satoshis: number,
    lockBlockCount: number,
    message: string
) => {
    if (lockBlockCount < 0) {
        throw new Error('You need to lock to a future block or the current block, for immediate release')
    }
    if (satoshis < 1000) {
        throw new Error('You need to lock at least 1000 satoshis')
    }
    if (message.length < 1) {
        throw new Error('You need to tell people why you are locking your coins, and why it is not a waste of your and everyone else\'s time and money.')
    }
    const result = await woc.chainInfo()
    const currentBlockHeight = result.headers
    const lockBlockHeight = currentBlockHeight + lockBlockCount
    const keyID = crypto.randomBytes(32).toString('base64')
    const publicKey = await getPublicKey({
        protocolID: PROTOCOL_ID,
        keyID,
    })
    const address = bsv.PublicKey.fromString(publicKey).toAddress()
    const instance = new Locksmith(
        Addr(address.toByteString()),
        BigInt(lockBlockHeight),
        toByteString(message, true)
    )
    await deployContract(
        instance,
        satoshis,
        `Lock coins for ${lockBlockCount} ${lockBlockCount === 1 ? 'block' : 'blocks'}: ${message}`,
        BASKET_ID,
        `${keyID},${lockBlockHeight}`
    )
}

/**
 * Starts a background unlock watchman, that will automatically unlock any
 * available coins from previous contracts.
 */
export const startBackgroundUnlockWatchman = async () => {
    let previousBlock = 0
    while (true) {
        const { headers: currentBlockHeight } = await woc.chainInfo()
        if (currentBlockHeight === previousBlock) {
            await new Promise(r => setTimeout(r, 60000))
            continue
        }
        const contracts = await listContracts(BASKET_ID, (lockingScript: string) => {
            return Locksmith.fromLockingScript(lockingScript) as Locksmith
        })
        for (let i = 0; i < contracts.length; i++) {
            const customInstructionsStr = contracts[i].customInstructions as string
            const customInstructions = customInstructionsStr.split(',')
            const keyID = customInstructions[0]
            const lockBlockHeight = Number(customInstructions[1])
            if (currentBlockHeight < lockBlockHeight) {
                continue
            }
            const fromTx = new bsv.Transaction(contracts[i].envelope.rawTx)
            contracts[i].contract.from = {
                tx: fromTx,
                outputIndex: contracts[i].vout
            }
            const redeemHydrator = async (self: SmartContract): Promise<void> => {
                const instance = self as Locksmith
                const bsvtx = new bsv.Transaction()
                bsvtx.from({
                    txId: contracts[i].txid,
                    outputIndex: contracts[i].vout,
                    script: fromTx.outputs[contracts[i].vout].script.toHex(),
                    satoshis: contracts[i].amount
                })
                bsvtx.inputs[0].sequenceNumber = 0xfffffffe
                bsvtx.nLockTime = lockBlockHeight
                const hashType =
                    bsv.crypto.Signature.SIGHASH_NONE |
                    bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
                    bsv.crypto.Signature.SIGHASH_FORKID
                const preimage = bsv.Transaction.Sighash.sighashPreimage(
                    bsvtx,
                    hashType,
                    0,
                    fromTx.outputs[contracts[i].vout].script,
                    new bsv.crypto.BN(parseInt(String(contracts[i].amount)))
                )
                const hashbuf = bsv.crypto.Hash.sha256(preimage)
                const SDKSignature = await createSignature({
                    protocolID: PROTOCOL_ID,
                    keyID,
                    data: hashbuf
                })
                const signature = bsv.crypto.Signature.fromString(Buffer.from(SDKSignature).toString('hex'))
                signature.nhashtype = hashType
                self.from = {
                    tx: new bsv.Transaction(contracts[0].envelope.rawTx),
                    outputIndex: contracts[0].vout
                }
                self.to = {
                    tx: bsvtx,
                    inputIndex: 0,
                }
                const publicKey = await getPublicKey({
                    protocolID: PROTOCOL_ID,
                    keyID
                })
                instance.unlock(
                    Sig(toByteString(signature.toTxFormat().toString('hex'))),
                    PubKey(toByteString(publicKey))
                )
            }
            await redeemContract(
                contracts[i],
                redeemHydrator,
                'Recover previously-locked coins',
                lockBlockHeight,
                0xfffffffe
            )
        }
        await new Promise(r => setTimeout(r, 60000))
    }
}
