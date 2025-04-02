import { render, waitFor, fireEvent } from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import { App } from '../App' // Adjust path based on your structure
import * as utils from '../utils/utils' // Adjust path
import { LookupResolver, Transaction, Utils, WalletClient } from '@bsv/sdk'
import { Locksmith } from '@bsv/backend'
import { HodlockerToken } from '../types/types' // Adjust path
import '@testing-library/jest-dom' // Extend Jest matchers

// Mock external dependencies
jest.mock('../utils/utils', () => ({
  lock: jest.fn(),
  startBackgroundUnlockWatchman: jest.fn()
}))

jest.mock('@bsv/sdk', () => ({
  LookupResolver: jest.fn().mockImplementation(() => ({
    query: jest.fn()
  })),
  Transaction: {
    fromBEEF: jest.fn()
  },
  Utils: {
    toHex: jest.fn()
  },
  WalletClient: jest.fn().mockImplementation(() => ({
    getHeight: jest.fn()
  }))
}))

jest.mock('@bsv/backend', () => ({
  Locksmith: {
    fromLockingScript: jest.fn()
  }
}))

describe('App Component', () => {
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
    message: Buffer.from('Test message', 'utf8').toString('hex'),
    address: 'mockAddress'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(utils.lock as jest.Mock).mockResolvedValue('newTxid')
    ;(utils.startBackgroundUnlockWatchman as jest.Mock).mockResolvedValue([])
    ;(Transaction.fromBEEF as jest.Mock).mockReturnValue({
      id: () => 'mockTxid1',
      outputs: [
        { lockingScript: { toHex: () => 'mockScript' }, satoshis: 100 }
      ],
      toAtomicBEEF: () => new Uint8Array([1, 2, 3])
    })
    ;(Utils.toHex as jest.Mock).mockReturnValue('mockBeef')
    ;(Locksmith.fromLockingScript as jest.Mock).mockReturnValue({
      lockUntilHeight: 100,
      message: 'Test message',
      address: { toString: () => 'mockAddress' }
    })
  })

  it('fetches hodlocker tokens and preserves LocksmithLike typing', async () => {
    const mockOutputs = [{ beef: [1, 2, 3], outputIndex: 0 }]
    ;(LookupResolver as jest.Mock).mockReturnValue({
      query: jest
        .fn()
        .mockResolvedValue({ type: 'output-list', outputs: mockOutputs })
    })

    await act(async () => {
      render(<App />)
    })

    await waitFor(() => {
      expect(Locksmith.fromLockingScript).toHaveBeenCalledWith('mockScript')
      expect(Locksmith.fromLockingScript).toHaveReturnedWith(
        expect.objectContaining({
          lockUntilHeight: 100,
          message: 'Test message',
          address: expect.objectContaining({ toString: expect.any(Function) })
        })
      )
    })
  })

  it('prevents double redeeming of tokens', async () => {
    const mockWalletClient = {
      getHeight: jest.fn().mockResolvedValue({ height: 101 })
    }
    ;(WalletClient as jest.Mock).mockReturnValue(mockWalletClient)
    ;(utils.startBackgroundUnlockWatchman as jest.Mock).mockImplementation(
      async (
        tokens: HodlockerToken[],
        unlockedTxids: Set<string>,
        setUnlockedTxids: any
      ) => {
        tokens.forEach((token: HodlockerToken) => {
          if (!unlockedTxids.has(token.token.txid)) {
            setUnlockedTxids((prev: Set<string>) =>
              new Set(prev).add(token.token.txid)
            )
          }
        })
        return tokens // Simulate all tokens redeemed
      }
    )

    const { rerender } = await act(async () => render(<App />))

    // Simulate initial state with a redeemable token
    await act(async () => {
      rerender(<App />)
    })

    // Simulate a second render to check if it tries to redeem again
    await act(async () => {
      rerender(<App />)
    })

    await waitFor(() => {
      expect(utils.startBackgroundUnlockWatchman).toHaveBeenCalledTimes(2)
      const secondCallArgs = (utils.startBackgroundUnlockWatchman as jest.Mock)
        .mock.calls[1]
      expect(secondCallArgs[1].has('mockTxid1')).toBe(true) // unlockedTxids includes the token
    })
  })

  it('updates hodlocker state after redeeming tokens', async () => {
    const mockWalletClient = {
      getHeight: jest.fn().mockResolvedValue({ height: 101 })
    }
    ;(WalletClient as jest.Mock).mockReturnValue(mockWalletClient)
    ;(utils.startBackgroundUnlockWatchman as jest.Mock).mockResolvedValue([
      mockToken
    ])

    const component = await act(async () => render(<App />))

    await waitFor(() => {
      expect(utils.startBackgroundUnlockWatchman).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ token: { txid: 'mockTxid1' } })
        ]),
        expect.any(Set),
        expect.any(Function)
      )
      expect(component.container.querySelector('table')).toBeNull() // No locks displayed
    })
  })

  it('locks a new token correctly', async () => {
    const mockWalletClient = {
      getHeight: jest.fn().mockResolvedValue({ height: 100 })
    }
    ;(WalletClient as jest.Mock).mockReturnValue(mockWalletClient)
    ;(utils.lock as jest.Mock).mockResolvedValue('newTxid')

    const { getByLabelText, getByText } = await act(async () => render(<App />))

    await act(async () => {
      const satoshisInput = getByLabelText('satoshis:')
      const blocksInput = getByLabelText('how many blocks to lock for:')
      const messageInput = getByLabelText('Why? Just why?')
      const submitButton = getByText('Lock Coins')

      fireEvent.change(satoshisInput, { target: { value: '100' } })
      fireEvent.change(blocksInput, { target: { value: '10' } })
      fireEvent.change(messageInput, { target: { value: 'Test lock' } })
      fireEvent.click(submitButton)
    })

    await waitFor(() => {
      expect(utils.lock).toHaveBeenCalledWith(
        100,
        10,
        'Test lock',
        expect.any(Function),
        expect.any(Array)
      )
      expect(getByText('Latest Locking TXID: newTxid')).toBeInTheDocument()
    })
  })
})
