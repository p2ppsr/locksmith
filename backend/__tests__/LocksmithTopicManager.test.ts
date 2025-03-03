import { jest } from '@jest/globals'
import { LocksmithTopicManager } from '../src/topic-managers/LocksmithTopicManager'
import { LocksmithLookupServiceFactory } from '../src/lookup-services/LocksmithLookupServiceFactory'
import { LocksmithStorage } from '../src/lookup-services/LocksmithStorage'
import { Transaction, Utils } from '@bsv/sdk'

describe('LocksmithTopicManager', () => {
  let topicManager: LocksmithTopicManager
  let storage: LocksmithStorage

  // BEEF transaction with a valid Locksmith contract and a P2PKH output
  const mixedBeef = Buffer.from(
    '0100beef0001010000000135333ddda07a2ce9823cb3e04dafa0c39be778800bdd59a85a1868e3ffab38c4000000006b483045022100e8abadaea60f5668b60056d2b0bb49ee797d2ced582f6ddb139bc2036e90c5c1022031c8f236aac31c7ac3191f3a4af89941a8a9d46ff6b1eb94f87d9052eab9ec02412103d2673a7bf96cf9beb4a64b37343535750a1f84fab510fa5249d78f28da138dc7ffffffff020300000000000000fd0a032097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000000000143f26402f388fb0daaa556b3522e8906153b0a26953073136363335343178040065cd1d9f697605feffffff009d785479a2695979a95579885a795a79ac6b6d6d6d6d6d6c77b5020000000000001976a91475c2174e04a87b9ddcafde2b42edf9803771c40288ac0000000000',
    'hex'
  )

  beforeEach(() => {
    storage = LocksmithStorage.getInstance()
    const lookupService = LocksmithLookupServiceFactory.getInstance(storage)
    topicManager = new LocksmithTopicManager()
  })

  test('should admit only valid Locksmith contract and reject P2PKH output', async () => {
    console.log('Parsing mixed BEEF transaction...')
    const transaction = Transaction.fromBEEF(Utils.toArray(mixedBeef))
    console.log('Parsed transaction:', transaction)

    // Extract scripts
    const scripts = transaction.outputs.map(output =>
      output.lockingScript.toHex()
    )

    // Store valid Locksmith entry
    storage.storeLocksmithEntry(scripts[0], { lockUntilHeight: 100000 }) // ✅ Valid Smart Contract
    storage.storeLocksmithEntry(scripts[1], { lockUntilHeight: 0 }) // ❌ P2PKH (Invalid)

    console.log('Stored Locksmith entries:', storage.getStoredEntries())

    const result = await topicManager.identifyAdmissibleOutputs(
      Utils.toArray(mixedBeef),
      []
    )

    expect(result.outputsToAdmit).toEqual([0]) // ✅ Only first output is admitted
    expect(result.outputsToAdmit).not.toContain(1) // ❌ P2PKH is **rejected**
    expect(result.coinsToRetain).toEqual([])
  })

  test('should reject output if lockUntilHeight is missing', async () => {
    console.log('Parsing transaction with missing lockUntilHeight...')
    const transaction = Transaction.fromBEEF(Utils.toArray(mixedBeef))
    const scripts = transaction.outputs.map(output =>
      output.lockingScript.toHex()
    )

    storage.storeLocksmithEntry(scripts[0], {}) // ❌ No lockUntilHeight provided

    const result = await topicManager.identifyAdmissibleOutputs(
      Utils.toArray(mixedBeef),
      []
    )

    expect(result.outputsToAdmit).toEqual([]) // ❌ Nothing should be admitted
  })

  test('should reject output if lockUntilHeight is too large (>= 500000000)', async () => {
    console.log('Parsing transaction with invalid lockUntilHeight...')
    const transaction = Transaction.fromBEEF(Utils.toArray(mixedBeef))
    const scripts = transaction.outputs.map(output =>
      output.lockingScript.toHex()
    )

    storage.storeLocksmithEntry(scripts[0], {
      lockUntilHeight: BigInt(500000000)
    }) // ❌ Invalid lockUntilHeight

    const result = await topicManager.identifyAdmissibleOutputs(
      Utils.toArray(mixedBeef),
      []
    )

    expect(result.outputsToAdmit).toEqual([]) // ❌ Nothing should be admitted
  })

  test('should reject short scripts (≤ 150 bytes)', async () => {
    console.log('Parsing transaction with short scripts...')
    const transaction = Transaction.fromBEEF(Utils.toArray(mixedBeef))
    const scripts = transaction.outputs.map(output =>
      output.lockingScript.toHex()
    )

    const shortScript = '76a914b472a266d0bd89c13706a4132ccfb16f7c3b9fcb88ac' // A small P2PKH script (~50 bytes)

    storage.storeLocksmithEntry(shortScript, { lockUntilHeight: 100000 }) // ❌ This should be ignored

    const result = await topicManager.identifyAdmissibleOutputs(
      Utils.toArray(mixedBeef),
      []
    )

    expect(result.outputsToAdmit).not.toContain(1) // ❌ Short scripts are **rejected**
  })

  test('should admit valid output with correct lockUntilHeight', async () => {
    console.log('Parsing transaction with a valid Locksmith contract...')
    const transaction = Transaction.fromBEEF(Utils.toArray(mixedBeef))
    const scripts = transaction.outputs.map(output =>
      output.lockingScript.toHex()
    )

    storage.storeLocksmithEntry(scripts[0], { lockUntilHeight: 150000 }) // ✅ Valid lockUntilHeight

    const result = await topicManager.identifyAdmissibleOutputs(
      Utils.toArray(mixedBeef),
      []
    )

    expect(result.outputsToAdmit).toEqual([0]) // ✅ Admitted
  })
})
