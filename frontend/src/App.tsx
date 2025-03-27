import React, { useEffect, useState } from 'react'
import {
  TextField,
  Button,
  Typography,
  LinearProgress,
  Container
} from '@mui/material'
import { lock, startBackgroundUnlockWatchman, truncate } from './utils/utils'
import useAsyncEffect from 'use-async-effect'
//import checkForMetaNetClient from './utils/checkForMetaNetClient'
import { NoMncModal } from 'metanet-react-prompt'

import { LookupResolver, Transaction, Utils, WalletClient } from '@bsv/sdk'
import { HodlockerToken, Token } from './types/types'
import { Locksmith } from '@bsv/backend'

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
  const [watchmanStarted, setWatchmanStarted] = useState(false)

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
    const fetchHodlockerTokens = async () => {
      try {
        console.log('fetchHodlockerTokens from overlay...')
        let lookupResult: any = undefined

        try {
          const resolver = new LookupResolver({ networkPreset: 'local' })
          lookupResult = await resolver.query({
            service: 'ls_hodlocker',
            query: { findAll: true }
          })

          // Check if the lookup returned a valid output-list
          if (!lookupResult || lookupResult.type !== 'output-list') {
            throw new Error('Wrong result type!')
          }
        } catch (e) {
          console.error('❌ Lookup error:', e)
        }

        if (!lookupResult || lookupResult.outputs.length === 0) {
          console.warn('⚠️ Still no locked tokens found after findAll()!')
          return
        }

        const parsedResults: HodlockerToken[] = []

        for (const result of lookupResult.outputs) {
          try {
            // Extract transaction details
            const tx = Transaction.fromBEEF(result.beef)
            const txid = tx.id('hex')
            console.log(`Parsed transaction: ${txid}`)

            const outputs = tx.outputs
            const outputIndex = Number(result.outputIndex)
            const output = outputs[outputIndex]

            const script = output.lockingScript.toHex()
            // console.log('Locking Script:', truncate(script, 80))

            const satoshis = output.satoshis
            // console.log('Satoshis:', satoshis)

            // ✅ Explicitly cast to `Locksmith`
            const locksmith = Locksmith.fromLockingScript(script) as Locksmith
            // console.log('Locksmith:', locksmith)

            const atomicBeefTX = Utils.toHex(tx.toAtomicBEEF())
            // console.log('atomicBeefTX:', atomicBeefTX)

            // ✅ Extract properties from Locksmith
            const address = locksmith.address ?? '' // Extract address
            const lockUntilHeight = Number(locksmith.lockUntilHeight ?? 0) // Convert to number
            const message = locksmith.message ?? '' // Extract message

            // console.log('Address:', address)
            // console.log('Lock Until Height:', lockUntilHeight)
            console.log('Message:', message)

            // Push updated token data into parsedResults
            parsedResults.push({
              token: {
                atomicBeefTX,
                txid,
                outputIndex,
                lockingScript: script,
                satoshis
              } as Token,
              keyID: '1', // No keyID in Locksmith, keep empty
              lockUntilHeight,
              message,
              address
            })
          } catch (error) {
            console.error('❌ Failed to parse Hodlocker token:', error)
          }
        }

        // Ensure the update triggers a re-render
        console.log('Updating state with Hodlocker tokens')
        setHodlocker([...parsedResults])
      } catch (error) {
        console.error('❌ Failed to load Hodlocker tokens:', error)
      }
    }

    fetchHodlockerTokens()
  }, [])

  useEffect(() => {
    const fetchLocks = async () => {
      console.log('Updated hodlockerToken:', hodlocker)
      //setWatchmanStarted(false)
      try {
        const walletClient = new WalletClient('json-api', 'non-admin.com')
        const currentBlockHeight = await walletClient.getHeight()
        console.log('🔍 Current Block Height:', currentBlockHeight.height)

        const lockList = hodlocker.map(lock => ({
          sats: lock.token.satoshis,
          left: lock.lockUntilHeight - currentBlockHeight.height,
          message: Buffer.from(lock.message, 'hex').toString('utf8')
        }))

        setLocks(lockList)
        console.log('🔍 lockList:', lockList)
        console.log('🔍 locks:', locks)

        // Check if any locks have become redeemable
        const redeemableTokens = hodlocker.filter(
          lock => lock.lockUntilHeight <= currentBlockHeight.height
        )

        console.log('🔍 Checking for redeemable tokens:', redeemableTokens)
        //console.log('⏳ watchmanStarted:', watchmanStarted)

        // Only call startBackgroundUnlockWatchman if it's not already started
        await startBackgroundUnlockWatchman(redeemableTokens) // Make sure to await this call, so it's not called again before it finishes

        // if (redeemableTokens.length > 0) {
        //   console.log(
        //     `🔓 Found ${redeemableTokens.length} redeemable tokens, unlocking...`
        //   )
        //   //setWatchmanStarted(true) // Update state to prevent duplicate calls
        //  } else if (redeemableTokens.length === 0) {
        //   console.log('⏳ No redeemable tokens yet.')
        // }
      } catch (error) {
        console.error(
          '❌ Failed to fetch lock details:',
          (error as Error).message
        )
      }
    }

    // Initial check and then check every 10s
    fetchLocks()
    const interval = setInterval(fetchLocks, 10000) // Check every 10s

    return () => clearInterval(interval) // Cleanup on unmount
  }, [hodlocker])

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    const walletClient = new WalletClient('json-api', 'non-admin.com')

    console.log('handleSubmit:message:', message)
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
      //const lockList = await list(walletClient, hodlocker)
      // if (lockList !== null) {
      // setLocks(
      //   lockList as Array<{ sats: number; left: number; message: string }>
      // )
      // }
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
