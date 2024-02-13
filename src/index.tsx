import React, { useState } from 'react'
import TextField from '@mui/material/TextField'
import { lock, unlock } from './deploy'

export const App: React.FC = () => {
  const [satoshis, setSatoshis] = useState('')
  const [lockBlockCount, setLockBlockCount] = useState('')

  const handleClick = async () => {
    await lock(satoshis, lockBlockCount)
    await unlock()
  }

  return (
    <center style={{ margin: '1em' }}>

      <TextField
        type='number' min={1000} autoFocus
        label='satoshis:'
        value={satoshis}
        onChange={e => {
          setSatoshis(e.target.value)
        }}
      />
      <TextField
        type='number' min={1}
        label='how many blocks to lock for:'
        value={lockBlockCount}
        onChange={e => {
          setLockBlockCount(e.target.value)
        }}
      />
      <button onClick={handleClick}>lock</button>
    </center>
  )
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <App />
);
