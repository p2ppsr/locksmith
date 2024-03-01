import React, { useEffect, useState } from 'react'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import { lock, list, startBackgroundUnlockWatchman } from './utils'
import ReactDOM from 'react-dom'

export const App: React.FC = () => {
  const [satoshis, setSatoshis] = useState('')
  const [lockBlockCount, setLockBlockCount] = useState('')
  const [message, setMessage] = useState('')
  const [txid, setTxid] = useState('')
  const [loading, setLoading] = useState(false)
  const [locks, setLocks] = useState([])

  useEffect(() => {
    (async () => {
      const lockList = await list()
      setLocks(lockList)
    })()
    startBackgroundUnlockWatchman(async () => {
      const lockList = await list()
      setLocks(lockList)
    })
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    try {
      setLoading(true)
      const deployTxid = await lock(
        Number(satoshis),
        Number(lockBlockCount),
        message
      )
      setTxid(deployTxid)
      setLoading(false)
      setMessage('')
      setSatoshis('')
      setLockBlockCount('')
      const lockList = await list()
      setLocks(lockList)
    } catch (e) {
      setLoading(false)
      window.alert(e.message)
    }
  }

  return (
    <center style={{ margin: '1em' }}>
      <form onSubmit={handleSubmit}>
        <center>
          <Typography variant='h3'>Locksmith</Typography>
          <Typography variant='h5'>For those of us who think purposely freezing our money for a cause is cool.</Typography>
        </center>
        <br />
        <br />
        <TextField
          disabled={loading}
          type='number'
          autoFocus
          fullWidth
          label='satoshis:'
          value={satoshis}
          onChange={e => {
            setSatoshis(e.target.value)
          }}
        />
        <br />
        <br />
        <TextField
          disabled={loading}
          type='number'
          label='how many blocks to lock for:'
          value={lockBlockCount}
          fullWidth
          onChange={e => {
            setLockBlockCount(e.target.value)
          }}
        />
        <br />
        <br />
        <TextField
          disabled={loading}
          label='Why? Just why?'
          value={message}
          fullWidth
          rows={8}
          multiline
          onChange={e => {
            setMessage(e.target.value)
          }}
        />
        <br />
        <br />
        <Typography>WARNING: Your coins will not be accessible until after the number of blocks have passed. Be responsible!</Typography>
        <br />
        <br />
        <Button disabled={loading} type='submit' variant='contained' size='large' color='primary'>Lock Coins</Button>
        <br />
        <br />
        {loading && <LinearProgress />}
      </form>
      <br />
      <br />
      {txid && <Typography>Locking TXID: {txid}</Typography>}
      <br />
      <br />
      {locks.length > 0 && (
        <div>
          <Typography variant='h4'>Your Current Locks</Typography>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <td><Typography><b>Satoshis Locked</b></Typography></td>
                <td><Typography><b>Blocks Left</b></Typography></td>
                <td><Typography><b>Message</b></Typography></td>
              </tr>
            </thead>
            <tbody>
              {locks.map((x, i) => (
                <tr key={i}>
                  <td><Typography>{x.sats}</Typography></td>
                  <td><Typography>{x.left}</Typography></td>
                  <td><Typography>{x.message}</Typography></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </center>
  )
}

ReactDOM.render(
  <App />,
  document.getElementById('root') as HTMLElement
)
