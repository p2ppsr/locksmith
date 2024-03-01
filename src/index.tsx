import React, { useEffect, useState } from 'react'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { lock, startBackgroundUnlockWatchman } from './deploy'
import ReactDOM from 'react-dom'

export const App: React.FC = () => {
  const [satoshis, setSatoshis] = useState('')
  const [lockBlockCount, setLockBlockCount] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    startBackgroundUnlockWatchman()
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    try {
      await lock(
        Number(satoshis),
        Number(lockBlockCount),
        message
      )
    } catch (e) {
      window.alert(e.message)
    }
  }

  return (
    <center style={{ margin: '1em' }}>
      <form onSubmit={handleSubmit}>
        <center>
          <Typography variant='h3'>Locksmith</Typography>
          <Typography variant='h5'>OJBK</Typography>
        </center>
        <br />
        <br />
        <TextField
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
        <Button type='submit' variant='contained' size='large' color='primary'>Lock Coins</Button>
      </form>
    </center>
  )
}

ReactDOM.render(
  <App />,
  document.getElementById('root') as HTMLElement
)
