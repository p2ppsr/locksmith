import React, { useEffect, useState } from 'react'
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
import constants from './utils/constants'

type LocksmithLike = ReturnType<typeof Locksmith.fromLockingScript> & {
  address?: { toString: () => string }
  lockUntilHeight?: number
  message?: string
  unlock?: unknown
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

  const fetchHodlockerTokens = async (): Promise<void> => {
    try {
      console.log('fetchHodlockerTokens from overlay...')
      const resolver = new LookupResolver({
        networkPreset: constants.networkPreset
      })
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
            `Failed to parse Hodlocker token for BEEF ${result.beef
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
      console.error('Failed to load Hodlocker tokens:', error)
    }
  }

  useEffect(() => {
    void fetchHodlockerTokens()
  }, [])

  useEffect(() => {
    const fetchLocks = async (): Promise<void> => {
      try {
        const currentBlockHeight = await constants.walletClient.getHeight()
        console.log('fetchLocks:currentBlockHeight:', currentBlockHeight)
        if (currentBlockHeight?.height == null) {
          throw new Error('Failed to fetch block height')
        }

        const lockList = hodlocker.map(lock => ({
          sats: lock.token.satoshis,
          left: lock.lockUntilHeight - currentBlockHeight.height,
          message: Buffer.from(lock.message, 'hex').toString('utf8')
        }))

        setLocks(lockList)

        const redeemableTokens = hodlocker.filter(
          lock => lock.lockUntilHeight <= currentBlockHeight.height
        )

        if (redeemableTokens.length > 0) {
          console.log('Redeemable tokens detected:', redeemableTokens.length)
          const redeemed = await startBackgroundUnlockWatchman(redeemableTokens)
          setHodlocker(prev =>
            prev.filter(t => !redeemed.some(r => r.token.txid === t.token.txid))
          )
          await fetchHodlockerTokens()
        }
      } catch (error) {
        console.error('Failed to fetch lock details:', error)
      }
    }

    void fetchLocks()
    const intervalId = setInterval(() => {
      void fetchLocks()
    }, 10000)

    return () => clearInterval(intervalId)
  }, [hodlocker])

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
      const safeBlockCount = Math.max(0, blocks)

      const deployTxid = await lock(
        sats,
        safeBlockCount,
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
          </center>
          <br />
          <br />
          <TextField
            disabled={loading}
            type="number"
            autoFocus
            fullWidth
            inputProps={{ min: 10, max: 1000 }}
            label="satoshis (10 -> 1000):"
            value={satoshis}
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => setSatoshis(e.target.value)}
          />
          <br />
          <br />
          <TextField
            disabled={loading}
            type="number"
            inputProps={{ min: 1, max: 10 }}
            label="how many blocks to lock for (1 -> 10):"
            value={lockBlockCount}
            fullWidth
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => setLockBlockCount(e.target.value)}
          />
          <br />
          <br />
          <TextField
            disabled={loading}
            label="Your message:"
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
            WARNING: Coins will not be accessible until after the number of
            blocks have passed. Be responsible!
          </Typography>
          <br />
          <br />
          <Button
            disabled={loading}
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
            <Typography variant="h4">Current Locks</Typography>
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
