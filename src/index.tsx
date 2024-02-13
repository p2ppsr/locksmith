import React, { useState } from 'react'
import TextField from '@mui/material/TextField'
import { lock, unlock } from './deploy'
import ReactDOM from 'react-dom'

export const App: React.FC = () => {
  const [satoshis, setSatoshis] = useState('')
  const [lockBlockCount, setLockBlockCount] = useState('')

  const handleClick = async () => {
    // await lock(
    //   Number(satoshis),
    //   Number(lockBlockCount)
    // )
    await unlock()
  }

  return (
    <center style={{ margin: '1em' }}>

      <TextField
        type='number'
        autoFocus
        label='satoshis:'
        value={satoshis}
        onChange={e => {
          setSatoshis(e.target.value)
        }}
      />
      <TextField
        type='number'
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

ReactDOM.render(
  <App />,
  document.getElementById('root') as HTMLElement
)
