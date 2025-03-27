import { LocksmithArtifact } from '@bsv/backend';
import { Locksmith } from '@bsv/backend';
import {
  WalletClient,
  Transaction,
  SHIPBroadcasterConfig,
  SHIPBroadcaster,
  Utils,
  CreateActionArgs,
} from '@bsv/sdk';
import {
  bsv,
  type SmartContract,
  Addr,
  Sig,
  PubKey,
  toByteString,
} from 'scrypt-ts';
import crypto from 'crypto';
import { toast } from 'react-toastify';
import { HodlockerToken } from '../types/types';
import { CreateActionResult } from '@babbage/sdk-ts';

const BASKET_ID = 'hodlocker10';

Locksmith.loadArtifact(LocksmithArtifact);

// This locks the passed number of sats for the passed number of blocks
export const lock = async (
  satoshis: number,
  lockBlockCount: number,
  message: string,
  setHodlocker: React.Dispatch<React.SetStateAction<HodlockerToken[]>>,
  hodlocker: HodlockerToken[]
): Promise<string | undefined> => {
  if (lockBlockCount < 0) {
    throw new Error('You need to lock to a future block or the current block, for immediate release');
  }
  if (satoshis < 3) {
    throw new Error('You need to lock at least 3 satoshis');
  }
  if (message.length < 1) {
    throw new Error(
      "You need to tell people why you are locking your coins, and why it is not a waste of your and everyone else's time and money."
    );
  }

  console.log('lock():satoshis', satoshis);
  console.log('lock():lockBlockCount', lockBlockCount);
  console.log('lock():message', message);
  console.log('lock():hodlocker', hodlocker);

  const walletClient = new WalletClient('json-api', 'non-admin.com');
  const currentBlockHeightObj = await walletClient.getHeight();
  const lockBlockHeight = currentBlockHeightObj.height + lockBlockCount;

  console.log('🔍 Current Block Height:', currentBlockHeightObj.height);
  console.log('🔒 Lock Block Height:', lockBlockHeight);

  const keyID = '1'; // 🔐 This will be randomized eventually
  const publicKeyResponse = await walletClient.getPublicKey({
    protocolID: [0, 'hodlocker'],
    keyID,
    counterparty: 'self',
  });
  const rawPublicKey = publicKeyResponse.publicKey;
  const derivedAddress = bsv.PublicKey.fromString(rawPublicKey).toAddress().toString();

  console.log(`🔑 Locking Step - Public Key: ${rawPublicKey}`);
  console.log(`🏠 Locking Step - Derived Address: ${derivedAddress}`);

  const address = bsv.PublicKey.fromString(rawPublicKey).toAddress();

  const instance = new Locksmith(
    Addr(address.toByteString()),
    BigInt(lockBlockHeight),
    toByteString(message, true)
  );

  console.log('instance.address.toString():', instance.address.toString());

  const lockingScript = instance.lockingScript.toHex();

  console.log('Locking Script (Hex):', lockingScript);

  const newHodlockerToken = await walletClient.createAction({
    description: 'Create a Hodlocker lock',
    outputs: [
      {
        basket: BASKET_ID,
        lockingScript,
        satoshis,
        outputDescription: 'Hodlocker output',
      },
    ],
    options: { randomizeOutputs: false },
  });

  if (newHodlockerToken.tx == null) {
    throw new Error('Hodlocker Transaction is undefined');
  }

  const transaction = Transaction.fromAtomicBEEF(newHodlockerToken.tx);
  const txid = transaction.id('hex');

  console.log('Transaction TXID:', txid);

  const args: SHIPBroadcasterConfig = {
    networkPreset: 'local',
  };

  const broadcaster = new SHIPBroadcaster(['tm_hodlocker'], args);
  const broadcasterResult = await broadcaster.broadcast(transaction);

  if (broadcasterResult.status === 'error') {
    console.log('broadcasterResult.description:', broadcasterResult.description);
    throw new Error('Transaction failed to broadcast');
  }

  toast.dark('✅ Hodlocker successfully created!');

  const lockUntilHeight = lockBlockHeight;
  console.log('Lock Until Height:', lockUntilHeight);

  // Store the hodlocker token and log important details for unlock
  setHodlocker((original: HodlockerToken[]) => [
    {
      token: {
        atomicBeefTX: Utils.toHex(newHodlockerToken.tx!),
        txid,
        outputIndex: 0,
        lockingScript,
        satoshis,
      },
      keyID,
      lockUntilHeight,
      message: Buffer.from(message, 'utf8').toString('hex'),
      address: address.toString(),
    } as HodlockerToken,
    ...original,
  ]);

  // Log the final state of the Hodlocker token being added
  console.log('Hodlocker Token added to state:', {
    atomicBeefTX: Utils.toHex(newHodlockerToken.tx!),
    txid,
    outputIndex: 0,
    lockingScript,
    satoshis,
    keyID,
    lockUntilHeight,
    message: Buffer.from(message, 'utf8').toString('hex'),
    address: address.toString(),
  });

  return txid;
};


// Run to watch when redeem is required once coins are unlocked
export const startBackgroundUnlockWatchman = async (
  hodlocker: HodlockerToken[]
): Promise<void> => {
  console.log('🕵️‍♂️ Watchman started...');
  const walletClient = new WalletClient('json-api', 'non-admin.com');

  try {
    const currentBlockHeight = await walletClient.getHeight();
    console.log('⏳ Current block height:', currentBlockHeight.height);

    for (const hodlock of hodlocker) {
      const { token, keyID, lockUntilHeight } = hodlock;

      console.log(
        `🔄 Checking contract ${token.txid}: LockHeight=${lockUntilHeight}, CurrentHeight=${currentBlockHeight.height}, keyID=${keyID}`
      );

      if (currentBlockHeight.height < lockUntilHeight) {
        console.log(`🔒 Contract ${token.txid} still locked, skipping.`);
        continue;
      }

      try {
        const LocksmithContract = Locksmith.fromLockingScript(token.lockingScript);
        const atomicBeef = Utils.toArray(token.atomicBeefTX, 'hex');
        const tx = Transaction.fromAtomicBEEF(atomicBeef);
        const parsedFromTx = new bsv.Transaction(tx.toHex());

        if (!parsedFromTx.inputs?.length || !parsedFromTx.inputs[0]?.prevTxId) {
          console.error(`❌ ERROR: Invalid inputs in parsedFromTx for txid ${token.txid}`);
          continue;
        }

        const unlockingScript = await LocksmithContract.getUnlockingScript(
          async (self: SmartContract) => {
            const locksmithSelf = self as Locksmith;

            try {
              const bsvtx = new bsv.Transaction();
              bsvtx.from({
                txId: token.txid,
                outputIndex: token.outputIndex,
                script: token.lockingScript,
                satoshis: token.satoshis,
              });
              bsvtx.inputs[0].sequenceNumber = 0xfffffffe;
              bsvtx.nLockTime = lockUntilHeight;
              
              const publicKeyResp1 = await walletClient.getPublicKey({
                protocolID: [0, 'hodlocker'],
                keyID,
                counterparty: 'self',
              });
              const publicKeyHex1 = publicKeyResp1.publicKey;
              console.log('🔍 Public Key from walletClient:', publicKeyHex1);
              console.log('🔍 Expected KeyID:', keyID);
              
              const address = bsv.PublicKey.fromString(publicKeyHex1).toAddress();
              console.log('🔍 Derived Address:', address.toString());
              console.log('🔍 Raw hodlock.address:', hodlock.address);
              console.log('🔍 Type of hodlock.address:', typeof hodlock.address);
              
              let contractAddress;
              try {
                contractAddress = bsv.Address.fromString(hodlock.address);
                console.log('🔍 Contract Address Parsed:', contractAddress.toString());
                console.log('🔍 Address Match:', address.toString() === contractAddress.toString());
                console.log('🔍 Contract Hash160:', contractAddress.hashBuffer.toString('hex'));
              } catch (e) {
                console.error('❌ Error parsing contract address:', (e as Error).message);
                console.log('🔍 hodlock.address Hex Dump:', Buffer.from(hodlock.address, 'utf8').toString('hex'));
                const hash160 = hodlock.address;
                contractAddress = bsv.Address.fromPublicKeyHash(Buffer.from(hash160, 'hex'));
                console.log('🔍 Fallback Contract Address:', contractAddress.toString());
                console.log('🔍 Fallback Address Match:', address.toString() === contractAddress.toString());
              }
              
              bsvtx.addOutput(
                new bsv.Transaction.Output({
                  script: bsv.Script.buildPublicKeyHashOut(address),
                  satoshis: token.satoshis,
                })
              );
              console.log('🔍 Transaction Hex:', bsvtx.toString());
              console.log('🔍 Transaction Inputs:', bsvtx.inputs.map(i => i.prevTxId.toString('hex')));
              console.log('🔍 Transaction Outputs:', bsvtx.outputs.map(o => o.script.toASM()));
              console.log('🔍 nLockTime:', bsvtx.nLockTime);
              console.log('🔍 Sequence[0]:', bsvtx.inputs[0].sequenceNumber.toString(16));              //   counterparty: 'self',
              locksmithSelf.to = { tx: bsvtx, inputIndex: 0 };
              locksmithSelf.from = { tx: parsedFromTx, outputIndex: 0 };

              if (!locksmithSelf.from.tx.inputs?.length || !locksmithSelf.from.tx.inputs[0]?.prevTxId) {
                throw new Error(`prevTxId missing in self.from for ${token.txid}`);
              }

              const hashType = bsv.crypto.Signature.SIGHASH_NONE | bsv.crypto.Signature.SIGHASH_ANYONECANPAY | bsv.crypto.Signature.SIGHASH_FORKID;
              console.log('🔍 Hash Type:', hashType.toString(16));
              const scriptInstance = bsv.Script.fromHex(token.lockingScript);
              const preimage = bsv.Transaction.Sighash.sighashPreimage(
                bsvtx,
                hashType,
                0,
                scriptInstance,
                new bsv.crypto.BN(token.satoshis)
              );
              const preimageSingleHash = bsv.crypto.Hash.sha256(preimage);
              console.log('🔍 Preimage:', preimage.toString('hex'));
              console.log('🔍 Preimage Single Hash:', preimageSingleHash.toString('hex'));
              console.log('🔍 Hash to Sign (Array):', Array.from(preimageSingleHash));
              
              const sdkSignature = await walletClient.createSignature({
                protocolID: [0, 'hodlocker'],
                keyID,
                //counterparty: 'self',
                hashToDirectlySign: Array.from(preimageSingleHash),
              });
              console.log('🔍 Raw SDK Signature:', sdkSignature.signature);
               
              const signatureBuf = Buffer.from(sdkSignature.signature);
              console.log('🔍 Signature Buffer:', signatureBuf.toString('hex'));
              
              let signature;
              try {
                signature = bsv.crypto.Signature.fromDER(signatureBuf);
                signature.nhashtype = hashType;
                console.log('🔍 Parsed Signature:', signature.toString());
              
                const pubKeyObj = bsv.PublicKey.fromString(publicKeyHex1);
                const derivedAddr = bsv.Address.fromPublicKey(pubKeyObj);
                console.log('🔍 Signing Key Address:', derivedAddr.toString());
                console.log('🔍 Signing Key Hash160:', derivedAddr.hashBuffer.toString('hex'));
              
                const verified = bsv.crypto.ECDSA.verify(
                  preimageSingleHash,
                  signature,
                  pubKeyObj
                );
                console.log('🔍 Public Key Used for Verification:', publicKeyHex1);
                console.log('🔍 Signature Verification Result:', verified);
                if (!verified) {
                  console.error('❌ Manual signature verification failed');
                  console.log('🔍 Expected Hash (Single SHA256):', preimageSingleHash.toString('hex'));
                }
              } catch (e) {
                console.error('❌ Signature DER Parsing Failed:', (e as Error).message);
                throw new Error('Invalid signature format from walletClient');
              }              
              
               signature.nhashtype = hashType;

              let publicKeyResp;
              try {
                publicKeyResp = await walletClient.getPublicKey({
                  protocolID: [0, 'hodlocker'],
                  keyID,
                  counterparty: 'self',
                });

                if (!publicKeyResp?.publicKey) {
                  throw new Error(`Failed to retrieve public key for ${token.txid}`);
                }
              } catch (error) {
                console.error(`❌ ERROR: Failed to get public key for ${token.txid}:`, (error as Error).message);
                throw error;
              }

              const publicKeyHex = publicKeyResp.publicKey;
              console.log('✅ Public key retrieved for contract:', publicKeyHex);

              locksmithSelf.unlock(
                Sig(toByteString(signature.toTxFormat().toString('hex'))),
                PubKey(toByteString(publicKeyHex))
              );
            } catch (error) {
              console.error(`❌ ERROR in unlocking script creation for ${token.txid}:`, (error as Error).message);
              throw error;
            }
          }
        );

        const broadcastActionParams: CreateActionArgs = {
          description: 'Unlock Locksmith contract',
          inputBEEF: atomicBeef,
          inputs: [
            {
              outpoint: `${token.txid}.${token.outputIndex}`,
              unlockingScript: unlockingScript.toHex(),
              sequenceNumber: 0xfffffffe, // Match the sequence used above
              inputDescription: 'Unlocking Locksmith contract',
            },
          ],
          outputs: [
            {
              basket: 'hodlocker tokens',
              lockingScript: LocksmithContract.lockingScript.toHex(),
              satoshis: token.satoshis,
              outputDescription: 'Updated contract state',
            },
          ],
          options: {
            acceptDelayedBroadcast: true,
            randomizeOutputs: false,
          },
        };

        try {
          const newToken = await walletClient.createAction(broadcastActionParams) as CreateActionResult;
          if (!newToken.rawTx) {
            throw new Error(`Transaction creation failed for ${token.txid}: newToken.rawTx is undefined`);
          }
          console.log(`✅ Successfully unlocked ${token.txid}, new txid: ${newToken.rawTx}`);
          console.log('🔍 New Transaction Hex:', newToken.rawTx);   
        } catch (error) {
          console.error(`❌ ERROR broadcasting transaction for ${token.txid}:`, (error as Error).message);
          continue;
        }
      } catch (error) {
        console.error(`❌ ERROR unlocking contract ${token.txid}:`, (error as Error).message);
        continue;
      }
    }
  } catch (error) {
    console.error('❌ ERROR in Watchman execution:', (error as Error).message);
  }
};


/**
 * Truncates a string to a specified length, adding "..." if it exceeds the limit.
 *
 * @param str - The input string to truncate.
 * @param length - The maximum number of characters before adding ellipses.
 * @returns The truncated string with "..." if it exceeds the specified length.
 */
export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str; // No need to truncate
  return str.slice(0, length) + '...';
};