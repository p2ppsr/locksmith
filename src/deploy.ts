import { P2PKH as Demo } from './contracts/demo'
import artifact from './contracts/demo.json'
import { bsv, SmartContract, Addr, Sig, PubKey, toByteString } from 'scrypt-ts'
import { deployContract, listContracts, redeemContract } from 'babbage-scrypt-helpers'
import { getPublicKey, createSignature } from '@babbage/sdk-ts'
import crypto from 'crypto'
import Whatsonchain from 'whatsonchain'
const BASKET_ID = 'hlloolocks1'
const PROTOCOL_ID = 'hlloolocks'

// This locks the passed number of sats for the passed number of blocks
export const lock = async (satoshis: number, lockBlockCount: number) => {
    if (lockBlockCount < 1) {
        throw new Error('You need to lock to a future block not the current block')
    }
    if (satoshis < 1000) {
        throw new Error('You need to lock at least 1000 satoshis')
    }
    const woc = new Whatsonchain('testnet')
    const result = await woc.chainInfo()
    const currentBlockHeight = result.headers
    const lockBlockHeight = currentBlockHeight + lockBlockCount
    Demo.loadArtifact(artifact)
    console.log('call getPublicKey()')
    const keyID = crypto.randomBytes(32).toString('base64')
    const publicKey = await getPublicKey({
        protocolID: PROTOCOL_ID,
        keyID,
    })
    console.log('called getPublicKey()')
    const address = bsv.PublicKey.fromString(publicKey).toAddress()
    const instance = new Demo(Addr(address.toByteString()), BigInt(satoshis), BigInt(lockBlockHeight))

    const deployTX = await deployContract(
        instance,
        satoshis,
        'Deploy a loolock smart contract',
        BASKET_ID,
        `${keyID},${lockBlockHeight}`
    )

    console.log('deployed', deployTX.txid)
}

// This function just redeems the sats associated with a single lock, being the most recent in the contracts listing
export const unlock = async () => {
    let i: number = 0

    await new Promise<void>((resolve) => {
        const redeem = async () => {

            const contracts = await listContracts(BASKET_ID, (lockingScript: string) => {
                return Demo.fromLockingScript(lockingScript) as Demo
            })

            console.log('listed contracts=', contracts)
            const customInstructionsStr = contracts[0].customInstructions as string
            const customInstructions = customInstructionsStr.split(',')
            console.log('customInstructions', customInstructions)
            const keyID = customInstructions[0]
            const lockBlockHeight = customInstructions[1]
            const woc = new Whatsonchain('testnet')
            console.log('redeem():min:', i)
            const result = await woc.chainInfo()
            const currentBlockHeight = result.headers
            console.log(currentBlockHeight, '<', lockBlockHeight)

            if (currentBlockHeight < lockBlockHeight) {
                setTimeout(redeem, 60000)
            } else {
                const redeemHydrator = async (self: SmartContract): Promise<void> => {
                    const instance = self as Demo
                    const bsvtx = new bsv.Transaction()
                    bsvtx.from({
                        txId: contracts[0].txid,
                        outputIndex: contracts[0].vout,
                        script: contracts[0].outputScript,
                        satoshis: contracts[0].amount,
                    })

                    const hashType =
                        bsv.crypto.Signature.SIGHASH_NONE |
                        bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
                        bsv.crypto.Signature.SIGHASH_FORKID

                    const hashbuf = bsv.crypto.Hash.sha256(
                        bsv.Transaction.Sighash.sighashPreimage(
                            bsvtx,
                            hashType,
                            0,
                            bsv.Script.fromBuffer(Buffer.from(contracts[0].outputScript, 'hex')),
                            new bsv.crypto.BN(parseInt(String(contracts[0].amount)))
                        )
                    )
                    const SDKSignature = await createSignature({
                        protocolID: PROTOCOL_ID,
                        keyID,
                        data: hashbuf,
                    })

                    const signature = bsv.crypto.Signature.fromString(
                        Buffer.from(SDKSignature).toString('hex')
                    )

                    signature.nhashtype = hashType

                    self.to = {
                        tx: bsvtx,
                        inputIndex: 0,
                    }

                    const publicKey = await getPublicKey({
                        protocolID: PROTOCOL_ID,
                        keyID,
                    })

                    instance.unlock(
                        Sig(toByteString(signature.toTxFormat().toString('hex'))),
                        PubKey(toByteString(publicKey))
                    )
                }

                const redeemTX = await redeemContract(
                    contracts[0],
                    redeemHydrator,
                    'Redeem a loolocks smart contract'
                )

                console.log('REDEEMED!!', redeemTX.txid)
                resolve()
            }
        }

        redeem()
    })
}

// This function redeems all the sats associated with all current locks that are identified as being unlocked.
// the contracts listing is looped for a passed in basket id and protocol id
export const redeemContracts = async (basketId: string, protocolId: string) => {
    Demo.loadArtifact(artifact)
    const contracts = await listContracts(basketId, (lockingScript: string) => {
        return Demo.fromLockingScript(lockingScript) as Demo
    })

    contracts.forEach(async (contract) => {
        console.log('contract=', contract)
        const redeemHydrator = async (self: SmartContract): Promise<void> => {
            const instance = self as Demo
            const bsvtx = new bsv.Transaction()
            bsvtx.from({
                txId: contract.txid,
                outputIndex: contract.vout,
                script: contract.outputScript,
                satoshis: contract.amount,
            })

            const hashType =
                bsv.crypto.Signature.SIGHASH_NONE |
                bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
                bsv.crypto.Signature.SIGHASH_FORKID

            const hashbuf = bsv.crypto.Hash.sha256(
                bsv.Transaction.Sighash.sighashPreimage(
                    bsvtx,
                    hashType,
                    0,
                    bsv.Script.fromBuffer(Buffer.from(contract.outputScript, 'hex')),
                    new bsv.crypto.BN(parseInt(String(contract.amount)))
                )
            )
            const customInstructionsStr = contract.customInstructions as string
            const customInstructions = customInstructionsStr.split(',')
            console.log('customInstructions', customInstructions)
            const keyID = customInstructions[0]
            /*				
            const keyID = contract.customInstructions as string
            console.log('keyID=', keyID)
            */
            const SDKSignature = await createSignature({
                protocolID: protocolId,
                keyID,
                data: hashbuf,
            })

            const signature = bsv.crypto.Signature.fromString(
                Buffer.from(SDKSignature).toString('hex')
            )

            signature.nhashtype = hashType

            self.to = {
                tx: bsvtx,
                inputIndex: 0,
            }

            const publicKey = await getPublicKey({
                protocolID: protocolId,
                keyID,
            })
            try {
                instance.unlock(
                    Sig(toByteString(signature.toTxFormat().toString('hex'))),
                    PubKey(toByteString(publicKey))
                )
            }
            catch {
            }
        }

        const redeemTX = await redeemContract(
            contract,
            redeemHydrator,
            'Redeem a loolocks smart contract'
        )
        console.log('REDEEMED!!', redeemTX.txid)
    })

}
let i = 0

// This function is used to call the redeem function every minute for the current basket id and protocol id 
const redeemLoolocks = async () => {
    console.log('redeemLoolocks():start')
    await redeemContracts(BASKET_ID, PROTOCOL_ID)
    setTimeout(async () => {
        console.log('redeemLoolocks():mins', ++i)
        await redeemContracts(BASKET_ID, PROTOCOL_ID)
    }, 60000)
}

// Main function where the lock, unlock or redeem functions are called
const main = async () => {
    console.log('main()')
    await lock(1000, 1)
    await redeemLoolocks()
}
main()