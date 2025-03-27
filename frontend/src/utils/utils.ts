import { LocksmithArtifact } from '@bsv/backend'
import { Locksmith } from '@bsv/backend'
import { WalletClient, Transaction, SHIPBroadcasterConfig, SHIPBroadcaster, Utils, LookupResolver, Beef, HTTPSOverlayBroadcastFacilitator, Script, CreateActionArgs } from '@bsv/sdk'
import {
  bsv,
  type SmartContract,
  Addr,
  Sig,
  PubKey,
  toByteString
} from 'scrypt-ts'
import crypto from 'crypto'
import { toast } from 'react-toastify'
import { HodlockerToken, Token } from '../types/types'

const BASKET_ID = 'hodlocker10'

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
    keyID,
    counterparty: 'self'
  })
  const rawPublicKey = publicKeyResponse.publicKey
  const derivedAddress = bsv.PublicKey.fromString(rawPublicKey).toAddress().toString()

  console.log(`🔑 Locking Step - Public Key: ${rawPublicKey}`)
  console.log(`🏠 Locking Step - Derived Address: ${derivedAddress}`)

  const address = bsv.PublicKey.fromString(rawPublicKey).toAddress()

  const instance = new Locksmith(
    Addr(address.toByteString()),
    BigInt(lockBlockHeight),
    toByteString(message, true)
  )

  console.log('instance.address.toString():', instance.address.toString())

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

  if (newHodlockerToken.tx == null) {
    throw new Error('Hodlocker Transaction is undefined')
  }
 
  const transaction = Transaction.fromAtomicBEEF(newHodlockerToken.tx)
  const txid = transaction.id('hex')

  const args: SHIPBroadcasterConfig = {
    networkPreset: 'local',
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
        atomicBeefTX: Utils.toHex(newHodlockerToken.tx!),
        txid,
        outputIndex: 0,
        lockingScript,
        satoshis
      },
      keyID,
      lockUntilHeight,
      message: Buffer.from(message, 'utf8').toString('hex'),
      address: address.toString()
    } as HodlockerToken,
    ...original
  ])

  return txid
}

// Run to watch when redeem is required once coins are unlocked
export const startBackgroundUnlockWatchman = async (
  hodlocker: HodlockerToken[]
): Promise<void> => {
  console.log('🕵️‍♂️ Watchman started...')

  const walletClient = new WalletClient('json-api', 'non-admin.com')

  try {
    const currentBlockHeight = await walletClient.getHeight()
    console.log('⏳ Current block height:', currentBlockHeight.height)

    for (const hodlock of hodlocker) {
      const { token, keyID, lockUntilHeight, message } = hodlock

      console.log(
        `🔄 Checking contract ${token.txid}: LockHeight=${lockUntilHeight}, CurrentHeight=${currentBlockHeight.height}, keyID=${keyID}`
      )

      if (currentBlockHeight.height < lockUntilHeight) {
        console.log(`🔒 Contract ${token.txid} still locked, skipping.`)
        continue
      }

      try {
        const LocksmithContract = Locksmith.fromLockingScript(token.lockingScript);  // Directly use Locksmith without casting

        // Convert from hex string
        const atomicBeef = Utils.toArray(token.atomicBeefTX, 'hex')
        const tx = Transaction.fromAtomicBEEF(atomicBeef)

        // Create a BSV Transaction for sCrypt Smart Contract usage
        const parsedFromTx = new bsv.Transaction(tx.toHex())
        //console.log('parsedFromTx:', JSON.stringify(parsedFromTx, null, 2))
        //console.log('🔹 Checking inputs:', parsedFromTx.inputs);
        if (!parsedFromTx.inputs || !parsedFromTx.inputs[0]?.prevTxId) {
          console.error(`❌ ERROR: prevTxId is missing in inputs for txid ${token.txid}`);
          return;  // Exit early if prevTxId is missing
        }

        // Generate unlocking script
        const unlockingScript = await LocksmithContract.getUnlockingScript(
          async (self: SmartContract) => {  // Type self as SmartContract initially
            const locksmithSelf = self as Locksmith;  // Assert the type as Locksmith here
        
            // Now you can access Locksmith-specific properties
            console.log('unlockingScript:self:', locksmithSelf);
                
            try {
              const bsvtx = new bsv.Transaction();
              //console.log('unlockingScript:bsvtx:', bsvtx);
        
              bsvtx.from({
                txId: token.txid,
                outputIndex: token.outputIndex,
                script: token.lockingScript,
                satoshis: token.satoshis
              });
              //console.log('unlockingScript:after bsvtx.from:', bsvtx);
        
              // Add output to unlock contract (no state update here)
              bsvtx.addOutput(
                new bsv.Transaction.Output({
                  script: self.lockingScript,  // Use the same locking script for unlocking
                  satoshis: token.satoshis
                })
              );
              console.log('unlockingScript:after bsvtx.addOutput:', bsvtx);
        
              // Assign the transaction details for 'from' and 'to'
              self.to = { tx: bsvtx, inputIndex: 0 };
              //console.log('unlockingScript:self.to:', self.to);
        
              // Log the parsedFromTx object before passing it
              //console.log('parsedFromTx before assignment:', JSON.stringify(parsedFromTx, null, 2));
        
              // Assign the parsedFromTx to self.from
              self.from = { tx: parsedFromTx, outputIndex: 0 };
              //console.log('self.from after assignment:', JSON.stringify(self.from, null, 2));
        
              // Check if the inputs are intact and log them
              if (self.from && self.from.tx && self.from.tx.inputs) {
                //console.log('self.from.tx.inputs:', self.from.tx.inputs);
        
                // Check if the first input contains prevTxId
                if (self.from.tx.inputs[0] && self.from.tx.inputs[0].prevTxId) {
                  //console.log('prevTxId is present:', self.from.tx.inputs[0].prevTxId);
                } else {
                  console.error('❌ prevTxId is missing or input is invalid.');
                }
              } else {
                console.error('❌ Inputs are not intact or missing in self.from.tx.inputs.');
              }
        
              // Now proceed with the unlocking script logic
              const scriptInstance = bsv.Script.fromHex(token.lockingScript);
              const hashType =
                bsv.crypto.Signature.SIGHASH_NONE |
                bsv.crypto.Signature.SIGHASH_ANYONECANPAY |
                bsv.crypto.Signature.SIGHASH_FORKID;
              console.log('hashType:', hashType);
        
              // Log the parsed transaction before accessing it
              //console.log('self.from.tx before accessing prevTxId:', JSON.stringify(self.from.tx, null, 2));
        
              // Check if `inputs` and `prevTxId` exist
              if (self.from.tx && self.from.tx.inputs && self.from.tx.inputs.length > 0 && self.from.tx.inputs[0].prevTxId) {
                console.log('prevTxId:', self.from.tx.inputs[0].prevTxId);
              } else {
                console.error('❌ ERROR: prevTxId is missing or undefined.');
                return;  // Exit if prevTxId is missing
              }
        
              // Continue with generating preimage and unlocking logic
              const preimage = bsv.Transaction.Sighash.sighashPreimage(
                new bsv.Transaction(),
                hashType,
                0,
                scriptInstance,
                new bsv.crypto.BN(token.satoshis)
              );
              console.log('preimage:', preimage);
        
              // Continue the rest of the logic...
            } catch (error) {
              console.error(`❌ ERROR in unlocking script creation for ${token.txid}:`, (error as Error).message);
            }
          }
        );
        
        const broadcastActionParams: CreateActionArgs = {
          inputs: [
            {
              outpoint: `${token.txid}.${token.outputIndex}`,
              unlockingScript: unlockingScript.toHex(),
              sequenceNumber: 0xffffffff,
              inputDescription: 'Unlocking Locksmith contract',
            }
          ],
          inputBEEF: atomicBeef,
          description: 'Unlock Locksmith contract',
          outputs: [
            {
              basket: 'hodlocker tokens',
              lockingScript: LocksmithContract.lockingScript.toHex(),
              satoshis: token.satoshis,
              outputDescription: 'Updated contract state'
            }
          ],
          options: { acceptDelayedBroadcast: true, randomizeOutputs: false }
        }

        // Execute the action
        try {
          const newToken = await walletClient.createAction(broadcastActionParams)

          if (!newToken.tx) {
            throw new Error('Transaction creation failed: newToken.tx is undefined')
          }

          console.log(`✅ Successfully unlocked ${token.txid}`)
        } catch (error) {
          console.error(`❌ ERROR creating action for unlocking contract ${token.txid}:`, (error as Error).message)
        }
      } catch (error) {
        console.error(`❌ ERROR unlocking contract ${token.txid}:`, (error as Error).message)
      }
    }
  } catch (error) {
    console.error('❌ ERROR in Watchman execution:', (error as Error).message)
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
