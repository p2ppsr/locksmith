import React, { useState } from 'react'
import pushdrop from 'pushdrop'
import { getPublicKey, createAction, getTransactionOutputs, createSignature } from '@babbage/wrapped-sdk'
import bsv from 'babbage-bsv'
import crypto from 'crypto'
import { Lockup } from './lockup'
import art from './lockup.json'
Lockup.loadArtifact(art)

const getUTXO = (rawtx, idx) => {
  const bsvtx = new bsv.Transaction(rawtx)
  return {
    satoshis: bsvtx.outputs[idx].satoshis,
    vout: idx,
    txid: bsvtx.hash,
    script: bsvtx.outputs[idx].script.toHex()
  }
}

const App = () => {
  const handleClick = async () => {
    const random = crypto.randomBytes(16).toString('base64')
    const publicKey = await getPublicKey({
      protocolID: 'locksmith',
      keyID: random
    })
    const pkh = bsv.crypto.Hash.sha256ripemd160(
      Buffer.from(publicKey, 'hex')
    ).toString('hex')
    const outputScript = await pushdrop.create({
      fields: [
        'test'
      ],
      disableSignature: true,
      lockBefore: false,
      customLock: new Lockup(pkh, 777777).lockingScript.toHex()
    })
    const act = await createAction({
      description: 'test lock',
      outputs: [{
        script: outputScript,
        satoshis: 3301,
        basket: 'locksmith',
        customInstructions: JSON.stringify({
          keyID: random,
          height: 777777
        })
      }]
    })
    console.log(act.txid)
  }

  const handleGet = async () => {
    const outputs = await getTransactionOutputs({
      spendable: true,
      basket: 'locksmith',
      includeEnvelope: true
    })
    const instructions = JSON.parse(outputs[0].customInstructions)
    const lockedUTXO = getUTXO(outputs[0].envelope.rawTx, outputs[0].vout)
    const bsvtx = bsv.Transaction()
    bsvtx.addInput(new bsv.Transaction.Input({
      prevTxId: outputs[0].txid,
      outputIndex: outputs[0].vout,
      script: new bsv.Script()
    }), bsv.Script(lockedUTXO.script), lockedUTXO.satoshis)
    bsvtx.inputs[0].sequenceNumber = 3301
    bsvtx.lockUntilBlockHeight(instructions.height)

    const sighashType = bsv.crypto.Signature.SIGHASH_NONE | bsv.crypto.Signature.SIGHASH_ANYONECANPAY | bsv.crypto.Signature.SIGHASH_FORKID
    const scriptCode = bsv.Script.fromHex(outputs[0].outputScript)
    const value = new bsv.crypto.BN(outputs[0].amount)
    // create preImage of current transaction with valid nLockTime
    const preimg = bsv.Transaction.sighash.sighashPreimage(bsvtx, sighashType, 0, scriptCode, value)
    const hashbuf = bsv.crypto.Hash.sha256(preimg)
    let signature = await createSignature({
      data: hashbuf,
      protocolID: 'locksmith',
      keyID: instructions.keyID,
      description: 'Unlock a locksmith token'
    })
    signature = bsv.crypto.Signature.fromBuffer(Buffer.from(signature))
    signature.nhashtype = sighashType
    const publicKey = await getPublicKey({
      protocolID: 'locksmith',
      keyID: instructions.keyID
    })
    const script = bsv.Script.fromASM(
      `${signature.toString('hex')} ${publicKey} ${preimg.toString('hex')}`
    ).toHex()
    const act = await createAction({
      description: 'unlock',
      // Need custom nLockTime support
      inputs: {
        [outputs[0].txid]: {
          ...outputs[0].envelope,
          outputsToRedeem: [{
            index: outputs[0].vout,
            unlockingScript: script
            // Need custom sequence number support (sequence=3301)
          }]
        }
      }
    })
    console.log(act.txid)
  }

  return (
    <center style={{ margin: '1em' }}>
      <button onClick={handleClick}>go</button>
      <button onClick={handleGet}>get</button>
    </center>
  )
}

export default App
