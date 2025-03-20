import React, { useEffect, useState } from 'react'
import {
  TextField,
  Button,
  Typography,
  LinearProgress,
  Container
} from '@mui/material'
import { lock, list, startBackgroundUnlockWatchman } from './utils/utils'
import useAsyncEffect from 'use-async-effect'
//import checkForMetaNetClient from './utils/checkForMetaNetClient'
import { NoMncModal } from 'metanet-react-prompt'

import { WalletClient } from '@bsv/sdk'
import { Token } from './types/types'
;(window as any).startBackgroundUnlockWatchman = startBackgroundUnlockWatchman

export const App: React.FC = () => {
  const [isMncMissing, setIsMncMissing] = useState<boolean>(false)
  const [satoshis, setSatoshis] = useState('')
  const [lockBlockCount, setLockBlockCount] = useState('')
  const [message, setMessage] = useState('')
  const [txid, setTxid] = useState('')
  const [loading, setLoading] = useState(false)
  const [locks, setLocks] = useState<
    Array<{ sats: number; left: number; message: string }>
  >([])
  const [hodlocker, setHodlocker] = useState<Token[]>([])

  // useAsyncEffect(async () => {
  //   const intervalId = setInterval(async () => {
  //     try {
  //       const hasMNC = await checkForMetaNetClient()
  //       setIsMncMissing(hasMNC === 0)
  //     } catch (e) {
  //       console.error('Error checking MetaNet Client:', e)
  //     }
  //   }, 1000)

  //   return () => {
  //     clearInterval(intervalId)
  //   }
  // }, [])

  useEffect(() => {
    const loadLocks = async (): Promise<void> => {
      const walletClient = new WalletClient('json-api', 'non-admin.com')
      try {
        const lockList = await list(walletClient)
        if (lockList !== null) {
          setLocks(
            lockList as Array<{ sats: number; left: number; message: string }>
          )
        }
      } catch (e) {
        console.error('Error loading locks:', e)
      }
    }

    void loadLocks()

    console.log('🚀 Starting background unlock watchman...')
    startBackgroundUnlockWatchman(async () => {
      const walletClient = new WalletClient('json-api', 'non-admin.com')

      try {
        const lockList = await list(walletClient)
        if (lockList !== null) {
          setLocks(
            lockList as Array<{ sats: number; left: number; message: string }>
          )
        }
      } catch (e) {
        console.error('Error in background unlock watchman:', e)
      }
    })
  }, [])

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    const walletClient = new WalletClient('json-api', 'non-admin.com')

    e.preventDefault()
    try {
      setLoading(true)
      const deployTxid = await lock(
        Number(satoshis),
        Number(lockBlockCount),
        message,
        setHodlocker
      )
      if (deployTxid !== undefined) {
        setTxid(deployTxid)
      }
      setLoading(false)
      setMessage('')
      setSatoshis('')
      setLockBlockCount('')
      const lockList = await list(walletClient)
      if (lockList !== null) {
        setLocks(
          lockList as Array<{ sats: number; left: number; message: string }>
        )
      }
    } catch (e) {
      setLoading(false)
      window.alert((e as Error).message)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ paddingTop: '2em' }}>
      <NoMncModal
        open={isMncMissing}
        onClose={() => {
          setIsMncMissing(false)
        }}
        appName={''}
      />
      <center style={{ margin: '1em' }}>
        <form onSubmit={handleSubmit}>
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
            label="satoshis:"
            value={satoshis}
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => {
              setSatoshis(e.target.value)
            }}
          />
          <br />
          <br />
          <TextField
            disabled={loading}
            type="number"
            label="how many blocks to lock for:"
            value={lockBlockCount}
            fullWidth
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => {
              setLockBlockCount(e.target.value)
            }}
          />
          <br />
          <br />
          <TextField
            disabled={loading}
            label="Why? Just why?"
            value={message}
            fullWidth
            rows={8}
            multiline
            onChange={(e: {
              target: { value: React.SetStateAction<string> }
            }) => {
              setMessage(e.target.value)
            }}
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
        {txid !== '' && <Typography>Locking TXID: {txid}</Typography>}
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
