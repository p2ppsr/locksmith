import { lock, startBackgroundUnlockWatchman } from '../utils/utils'
import { WalletClient, Transaction, SHIPBroadcaster, Utils } from '@bsv/sdk'
import { Locksmith } from '@bsv/backend'
import { HodlockerToken } from '../types/types'

// Mock dependencies
jest.mock('@bsv/sdk')
jest.mock('@bsv/backend')
jest.mock('react-toastify', () => ({
  toast: { dark: jest.fn() }
}))

describe('Utils', () => {
  const mockToken: HodlockerToken = {
    token: {
      atomicBeefTX: 'mockBeef',
      txid: 'mockTxid1',
      outputIndex: 0,
      lockingScript: 'mockScript',
      satoshis: 100
    },
    keyID: '1',
    lockUntilHeight: 100,
    message: Buffer.from('Test', 'utf8').toString('hex'),
    address: 'mockAddress'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(WalletClient as jest.Mock).mockReturnValue({
      getHeight: jest.fn().mockResolvedValue({ height: 100 }),
      getPublicKey: jest.fn().mockResolvedValue({ publicKey: 'mockPubKey' }),
      createAction: jest
        .fn()
        .mockResolvedValue({ txid: 'newTxid', tx: new Uint8Array([1, 2, 3]) }),
      createSignature: jest.fn().mockResolvedValue({ signature: 'mockSig' })
    })
    ;(Transaction.fromAtomicBEEF as jest.Mock).mockReturnValue({
      id: () => 'mockTxid1',
      toHex: () => 'mockHex'
    })
    ;(Utils.toArray as jest.Mock).mockReturnValue([1, 2, 3])
    ;(Utils.toHex as jest.Mock).mockReturnValue('mockBeef')
    ;(Locksmith.fromLockingScript as jest.Mock).mockReturnValue({
      lockingScript: { toHex: () => 'mockScript' },
      getUnlockingScript: jest
        .fn()
        .mockResolvedValue({ toHex: () => 'mockUnlockScript' })
    })
    ;(SHIPBroadcaster as jest.Mock).mockReturnValue({
      broadcast: jest.fn().mockResolvedValue({ status: 'success' })
    })
  })

  it('locks a token successfully', async () => {
    const setHodlocker = jest.fn()
    const result = await lock(100, 10, 'Test lock', setHodlocker, [])

    expect(result).toBe('newTxid')
    expect(setHodlocker).toHaveBeenCalledWith(expect.any(Function))
    expect(WalletClient).toHaveBeenCalledWith('json-api', 'localhost')
  })

  it('startBackgroundUnlockWatchman prevents double unlocking', async () => {
    const unlockedTxids = new Set<string>()
    const setUnlockedTxids = jest.fn(fn => {
      const newSet = fn(unlockedTxids)
      unlockedTxids.clear()
      newSet.forEach((txid: string) => unlockedTxids.add(txid))
    })

    // First unlock
    const redeemed1 = await startBackgroundUnlockWatchman(
      [mockToken],
      unlockedTxids,
      setUnlockedTxids
    )
    expect(redeemed1).toHaveLength(1)
    expect(unlockedTxids.has('mockTxid1')).toBe(true)

    // Second attempt with same token
    const redeemed2 = await startBackgroundUnlockWatchman(
      [mockToken],
      unlockedTxids,
      setUnlockedTxids
    )
    expect(redeemed2).toHaveLength(0) // No double unlock
  })

  it('removes token from unlockedTxids on failure', async () => {
    const unlockedTxids = new Set<string>()
    const setUnlockedTxids = jest.fn(fn => {
      const newSet = fn(unlockedTxids)
      unlockedTxids.clear()
      newSet.forEach((txid: string) => unlockedTxids.add(txid))
    })
    ;(Locksmith.fromLockingScript as jest.Mock).mockImplementation(() => {
      throw new Error('Unlock failed')
    })

    const redeemed = await startBackgroundUnlockWatchman(
      [mockToken],
      unlockedTxids,
      setUnlockedTxids
    )
    expect(redeemed).toHaveLength(0)
    expect(unlockedTxids.has('mockTxid1')).toBe(false)
  })
})
