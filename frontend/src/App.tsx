import React, { useCallback, useEffect, useState } from 'react'
import {
  TextField,
  Button,
  Typography,
  LinearProgress,
  Container
} from '@mui/material'
import { lock, startBackgroundUnlockWatchman } from './utils/utils'
import { NoMncModal } from 'metanet-react-prompt'
import { LookupResolver, Transaction, Utils, WalletClient } from '@bsv/sdk'
import { HodlockerToken, Token } from './types/types'
import { Locksmith } from '@bsv/backend'

// Global throttle flag to prevent overlapping fetchLocks calls
let isFetching = false

type LocksmithLike = ReturnType<typeof Locksmith.fromLockingScript> & {
  address?: { toString: () => string }
  lockUntilHeight?: number
  message?: string
  unlock?: unknown
}

interface BlockHeight {
  height: number
}

export const App: React.FC = () => {
  const [isMncMissing, setIsMncMissing] = useState<boolean>(false)
  const [satoshis, setSatoshis] = useState<string>('')
  const [lockBlockCount, setLockBlockCount] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [txid, setTxid] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [locks, setLocks] = useState<
    Array<{ sats: number; left: number; message: string }>
  >([])
  const [hodlocker, setHodlocker] = useState<HodlockerToken[]>([])
  const [unlockedTxids, setUnlockedTxids] = useState<Set<string>>(new Set())
  // New state for wallet connection status
  const [walletStatus, setWalletStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting')

  const fetchHodlockerTokens = async (): Promise<void> => {
    try {
      console.log('fetchHodlockerTokens from overlay...')
      const resolver = new LookupResolver({ networkPreset: 'local' })
      const lookupResult = await resolver.query({
        service: 'ls_hodlocker',
        query: { findAll: true }
      })

      if (
        lookupResult?.type !== 'output-list' ||
        !Array.isArray(lookupResult?.outputs)
      ) {
        throw new Error('Invalid lookup result')
      }

      if (lookupResult.outputs.length === 0) {
        console.log('No hodlocker tokens found in backend response')
        setHodlocker([])
        return
      }
      console.log('lookupResult.outputs:', lookupResult.outputs)

      const parsedResults: HodlockerToken[] = []
      for (const result of lookupResult.outputs) {
        try {
          const tx = Transaction.fromBEEF(result.beef)
          const txid = tx.id('hex')
          const outputIndex = Number(result.outputIndex)
          const output = tx.outputs[outputIndex]

          if (output == null) {
            throw new Error(`Output ${outputIndex} not found`)
          }

          const script = output.lockingScript.toHex()
          const satoshis = output.satoshis
          const locksmith: LocksmithLike = Locksmith.fromLockingScript(script)

          const token: Token = {
            atomicBeefTX: Utils.toHex(tx.toAtomicBEEF()),
            txid,
            outputIndex,
            lockingScript: script,
            satoshis
          }

          parsedResults.push({
            token,
            keyID: '1',
            lockUntilHeight: Number(locksmith.lockUntilHeight ?? 0),
            message: locksmith.message ?? '',
            address: locksmith.address?.toString() ?? ''
          })
        } catch (error) {
          console.error(
            `❌ Failed to parse Hodlocker token for BEEF ${result.beef
              .slice(0, 10)
              .join('')}:`,
            error
          )
        }
      }

      setHodlocker(prev => {
        const existingTxids = new Set(prev.map(t => t.token.txid))
        const newTokens = parsedResults.filter(
          t => !existingTxids.has(t.token.txid)
        )
        const updatedHodlocker = [...prev, ...newTokens]
        console.log('Updated hodlocker state:', updatedHodlocker)
        return updatedHodlocker
      })
    } catch (error) {
      console.error('❌ Failed to load Hodlocker tokens:', error)
    }
  }

  useEffect(() => {
    void fetchHodlockerTokens()
  }, [])

  const waitForWallet = async (
    walletClient: WalletClient
  ): Promise<BlockHeight> => {
    const maxAttempts = 5
    const delayMs = 2000
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(
          `Attempting to fetch block height (attempt ${attempt}/${maxAttempts})...`
        )
        const height: BlockHeight = await walletClient.getHeight()
        if (height?.height != null) {
          setWalletStatus('connected')
          return height
        }
        throw new Error('Height is null or undefined')
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        console.warn(
          `Wallet not ready: ${errorMessage}. Retrying in ${delayMs}ms...`
        )
        setWalletStatus('disconnected')
        if (attempt === maxAttempts) {
          throw new Error('Wallet authentication failed after max attempts')
        }
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    throw new Error('Unexpected exit from waitForWallet')
  }

  const fetchLocks = useCallback(async (): Promise<void> => {
    if (isFetching) {
      console.log('fetchLocks: Skipped (already fetching)')
      return
    }
    isFetching = true
    try {
      console.log('fetchLocks: Starting...')
      if (hodlocker.length === 0) {
        console.log('fetchLocks: No hodlocker tokens yet, skipping locks...')
        setLocks([])
        return
      }
      const walletClient = new WalletClient('json-api', 'localhost')
      console.log('fetchLocks: Fetching block height...')
      const currentBlockHeight: BlockHeight = await waitForWallet(walletClient)
      console.log('fetchLocks:currentBlockHeight:', currentBlockHeight)
      if (currentBlockHeight.height == null) {
        throw new Error('Failed to fetch block height')
      }

      const lockList = hodlocker.map(lock => ({
        sats: lock.token.satoshis,
        left: lock.lockUntilHeight - currentBlockHeight.height,
        message: Buffer.from(lock.message, 'hex').toString('utf8')
      }))

      console.log('fetchLocks: Setting locks...', lockList)
      setLocks(lockList)

      const redeemableTokens = hodlocker.filter(
        lock => lock.lockUntilHeight <= currentBlockHeight.height
      )

      if (redeemableTokens.length > 0) {
        console.log('Redeemable tokens detected:', redeemableTokens.length)
        console.log('fetchLocks: Starting unlock watchman...')
        const redeemed = await startBackgroundUnlockWatchman(
          redeemableTokens,
          unlockedTxids,
          setUnlockedTxids
        )
        console.log('fetchLocks: Redeemed tokens:', redeemed)
        setHodlocker(prev => {
          const updated = prev.filter(
            t => !redeemed.some(r => r.token.txid === t.token.txid)
          )
          console.log('setHodlocker: Updated state:', updated)
          return updated
        })
        console.log('fetchLocks: Fetching hodlocker tokens after redeem...')
        await fetchHodlockerTokens()
      }
      console.log('fetchLocks: Completed')
    } catch (error) {
      console.error('❌ Failed to fetch lock details:', error)
    } finally {
      isFetching = false
    }
  }, [hodlocker, unlockedTxids])

  useEffect(() => {
    console.log('useEffect: Initializing fetchLocks interval')
    let isMounted = true
    let intervalId: NodeJS.Timeout | null = null

    const runFetchLocks = async () => {
      if (!isMounted) {
        console.log('fetchLocks: Skipped (unmounted)')
        return
      }
      await fetchLocks()
    }

    void runFetchLocks() // Immediate first run
    intervalId = setInterval(() => void runFetchLocks(), 10000)

    return () => {
      console.log('useEffect: Cleaning up')
      isMounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [fetchLocks])

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault()
    setLoading(true)
    try {
      const sats = Number(satoshis)
      const blocks = Number(lockBlockCount)
      console.log('handleSubmit: sats:', sats, 'blocks:', blocks)
      if (Number.isNaN(sats) || Number.isNaN(blocks)) {
        throw new Error('Invalid number input')
      }

      const deployTxid = await lock(
        sats,
        blocks,
        message,
        setHodlocker,
        hodlocker
      )
      if (deployTxid !== '' && deployTxid !== undefined) {
        setTxid(deployTxid)
      }
      setMessage('')
      setSatoshis('')
      setLockBlockCount('')
      await fetchHodlockerTokens()
    } catch (error) {
      window.alert((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ paddingTop: '2em' }}>
      <NoMncModal
        open={isMncMissing}
        onClose={() => setIsMncMissing(false)}
        appName=""
      />
      <center style={{ margin: '1em' }}>
        <form
          onSubmit={e => {
            handleSubmit(e).catch(err => console.error(err))
          }}
        >
          <center>
            <Typography variant="h3">Locksmith</Typography>
            <Typography variant="h5">
              For those of us who think purposely freezing our money for a cause
              is cool.
            </Typography>
            {/* Wallet Status Indicator */}
            <Typography
              variant="body1"
              color={walletStatus === 'disconnected' ? 'error' : 'textPrimary'}
            >
              Wallet Status:{' '}
              {walletStatus === 'connecting'
                ? 'Connecting...'
                : walletStatus === 'connected'
                ? 'Connected'
                : 'Disconnected'}
            </Typography>
          </center>
          <br />
          <br />
          <TextField
            disabled={loading || walletStatus === 'disconnected'}
            type="number"
            autoFocus
            fullWidth
            label="satoshis:"
            value={satoshis}
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => setSatoshis(e.target.value)}
          />
          <br />
          <br />
          <TextField
            disabled={loading || walletStatus === 'disconnected'}
            type="number"
            label="how many blocks to lock for:"
            value={lockBlockCount}
            fullWidth
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => setLockBlockCount(e.target.value)}
          />
          <br />
          <br />
          <TextField
            disabled={loading || walletStatus === 'disconnected'}
            label="Why? Just why?"
            value={message}
            fullWidth
            rows={8}
            multiline
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => setMessage(e.target.value)}
          />
          <br />
          <br />
          <Typography>
            WARNING: Your coins will not be accessible until after the number of
            blocks have passed. Be responsible!
          </Typography>
          <br />
          <br />
          <Button
            disabled={loading || walletStatus === 'disconnected'}
            type="submit"
            variant="contained"
            size="large"
            color="primary"
          >
            Lock Coins
          </Button>
          <br />
          <br />
          {loading && <LinearProgress />}
        </form>
        <br />
        <br />
        {txid !== '' && <Typography>Latest Locking TXID: {txid}</Typography>}
        <br />
        <br />
        {locks.length > 0 && (
          <div>
            <Typography variant="h4">Your Current Locks</Typography>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <td>
                    <Typography>
                      <b>Satoshis Locked</b>
                    </Typography>
                  </td>
                  <td>
                    <Typography>
                      <b>Blocks Left</b>
                    </Typography>
                  </td>
                  <td>
                    <Typography>
                      <b>Message</b>
                    </Typography>
                  </td>
                </tr>
              </thead>
              <tbody>
                {locks.map((x, i) => (
                  <tr key={i}>
                    <td>
                      <Typography>{x.sats}</Typography>
                    </td>
                    <td>
                      <Typography>{x.left}</Typography>
                    </td>
                    <td>
                      <Typography>{x.message}</Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </center>
    </Container>
  )
}

export default App
