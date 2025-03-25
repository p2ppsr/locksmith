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

import { LookupResolver, Transaction, Utils, WalletClient } from '@bsv/sdk'
import { HodlockerToken, Token } from './types/types'
import { Locksmith } from '@bsv/backend'
import { listContracts } from './utils/helpers'

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
  const [hodlocker, setHodlocker] = useState<HodlockerToken[]>([])

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

  useAsyncEffect(() => {
    const fetchHodlockerTokensDirectly = async () => {
      try {
        console.log('🔍 Fetching Hodlocker tokens via direct fetch...')

        const response = await fetch('http://localhost:8080/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service: 'ls_hodlocker',
            query: { findAll: true }
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }

        const lookupResult = await response.json()
        console.log(
          '✅ Direct fetch result:',
          JSON.stringify(lookupResult, null, 2)
        )

        // Check if lookup result is valid
        if (!lookupResult || lookupResult.type !== 'output-list') {
          throw new Error('❌ Invalid result type from lookup!')
        }

        if (!lookupResult?.outputs || lookupResult.outputs.length === 0) {
          console.warn('⚠️ No locked tokens found in lookup!')
          return
        }

        console.log(`📦 Found ${lookupResult.outputs.length} locked tokens`)

        const parsedResults: HodlockerToken[] = []

        for (const result of lookupResult.outputs) {
          try {
            console.log(`🔍 Processing result: ${JSON.stringify(result)}`)

            const tx = Transaction.fromBEEF(result.beef)
            console.log(`📜 Parsed transaction from BEEF: ${tx.id('hex')}`)

            const script = tx.outputs[
              Number(result.outputIndex)
            ].lockingScript.toHex()
            console.log('🔏 Extracted locking script:', script)

            const hodlocker = Locksmith.fromLockingScript(script)
            console.log('🔑 Hodlocker contract parsed:', hodlocker)

            const atomicBeefTX = Utils.toHex(tx.toAtomicBEEF())

            console.log('✅ Processed atomicBeefTX:', atomicBeefTX)

            parsedResults.push({
              token: {
                atomicBeefTX,
                txid: tx.id('hex'),
                outputIndex: result.outputIndex,
                lockingScript: script,
                satoshis: tx.outputs[Number(result.outputIndex)]
                  .satoshis as number
              }
            } as HodlockerToken)
          } catch (error) {
            console.error('❌ Failed to parse Hodlocker token:', error)
          }
        }

        console.log(
          `🚀 Successfully parsed ${parsedResults.length} Hodlocker tokens`
        )

        // ✅ Ensure the update triggers a re-render
        console.log('🔄 Updating state with Hodlocker tokens')
        setHodlocker([...parsedResults]) // 🔥 Ensure a new array instance is used
      } catch (error) {
        console.error('❌ Failed to load Hodlocker tokens:', error)
      }
    }

    fetchHodlockerTokensDirectly()
  }, [])

  useEffect(() => {
    console.log('📦 Updated hodlockerToken:', hodlocker)
  }, [hodlocker])

  useEffect(() => {
    if (hodlocker.length === 0) {
      console.log(
        '⚠️ Skipping startBackgroundUnlockWatchman - hodlocker is empty'
      )
      return
    }

    console.log(
      '🚀 Starting background unlock watchman with hodlocker:',
      hodlocker
    )

    startBackgroundUnlockWatchman(hodlocker, async () => {
      const walletClient = new WalletClient('json-api', 'non-admin.com')

      try {
        const lockList = await list(walletClient, hodlocker) // ✅ Pass hodlocker
        if (lockList !== null) {
          setLocks(
            lockList
              .map(lock => ({
                sats: lock.sats,
                left: lock.left,
                message: lock.message
              }))
              .sort((a, b) => a.left - b.left)
          )
        }
      } catch (e) {
        console.error('❌ Error in background unlock watchman:', e)
      }
    })
  }, [hodlocker]) // 🔄 Triggers when hodlocker updates

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    const walletClient = new WalletClient('json-api', 'non-admin.com')

    console.log('handleSubmit')
    e.preventDefault()
    try {
      setLoading(true)
      const deployTxid = await lock(
        Number(satoshis),
        Number(lockBlockCount),
        message,
        setHodlocker,
        hodlocker
      )
      if (deployTxid !== undefined) {
        setTxid(deployTxid)
      }
      setLoading(false)
      setMessage('')
      setSatoshis('')
      setLockBlockCount('')
      const lockList = await list(walletClient, hodlocker)
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
