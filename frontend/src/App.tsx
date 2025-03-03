import Whatsonchain from 'whatsonchain'
import { Setup, wait } from '@bsv/wallet-toolbox'
import {
  Beef,
  CreateActionArgs,
  CreateActionResult,
  Transaction
} from '@bsv/sdk'
import { Locksmith } from '@bsv/backend'
import { bsv, Addr, toByteString } from 'scrypt-ts'
import axios from 'axios'
import React, { useState, type FormEvent } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  AppBar, Toolbar, List, ListItem, Fab, LinearProgress, Typography, IconButton, Grid
} from '@mui/material'
import { styled } from '@mui/system'
import AddIcon from '@mui/icons-material/Add'
import GitHubIcon from '@mui/icons-material/GitHub'
import useAsyncEffect from 'use-async-effect'
import { IdentityCard } from 'metanet-identity-react'
import { SHIPBroadcaster, LookupResolver, Utils, ProtoWallet } from '@bsv/sdk'

const anyoneWallet = new ProtoWallet('anyone')

const AppBarPlaceholder = styled('div')({
  height: '4em'
})

const NoItems = styled(Grid)({
  margin: 'auto',
  textAlign: 'center',
  marginTop: '5em'
})

const AddMoreFab = styled(Fab)({
  position: 'fixed',
  right: '1em',
  bottom: '1em',
  zIndex: 10
})

const LoadingBar = styled(LinearProgress)({
  margin: '1em'
})

const GitHubIconStyle = styled(IconButton)({
  color: '#ffffff'
})

async function fetchRawTransaction(txid: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api.whatsonchain.com/v1/bsv/test/tx/${txid}/hex`
    )
    return response.data
  } catch (error) {
    throw new Error(
      `Failed to fetch raw transaction: ${(error as Error).message}`
    )
  }
}

const App: React.FC = () => {
  const [createOpen, setCreateOpen] = useState<boolean>(false)
  const [createLoading, setCreateLoading] = useState<boolean>(false)
  const [locksmithsLoading, setLocksmithsLoading] = useState<boolean>(true)
  const [locksmiths, setLocksmiths] = useState<Locksmith[]>([])

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    try {
      setCreateLoading(true)

      const env = Setup.getEnv('test')
      const identityKey = env.identityKey
      const setup = await Setup.createWalletClient({
        env,
        rootKeyHex: env.devKeys[identityKey]
      })

      const woc = new Whatsonchain('testnet')
      const result = await woc.chainInfo()
      const lockBlockHeight = result.headers + 1

      Locksmith.loadArtifact()
      await Locksmith.compile()

      const address = bsv.PublicKey.fromString(identityKey).toAddress()
      const lockBlockHeightStr = lockBlockHeight.toString() 
      const locksmithObj = new Locksmith(
        Addr(address.toByteString()),
        BigInt(1),
        toByteString(lockBlockHeightStr, true)
      )
      console.log(
        `Locking Script: (${locksmithObj.lockingScript.length}) ${locksmithObj.lockingScript.toHex()}`
      )

      const createActionArgs: CreateActionArgs = {
        outputs: [
          {
            lockingScript: locksmithObj.lockingScript.toHex(),
            satoshis: 1,
            basket: 'testhl3',
            customInstructions: '1',
            outputDescription: 'Output for Locksmith contract'
          }
        ],
        labels: ['deploying locksmith contract'],
        description: 'Deploy a Locksmith contract',
        options: { acceptDelayedBroadcast: false }
      }

      // Use new `setup.wallet.createAction` method
      const createActionResult: CreateActionResult = await setup.wallet.createAction(createActionArgs)
      console.log('Create Action Result:', createActionResult)

      const txid = createActionResult.txid

      console.log('Fetching transaction for BEEF encoding...', txid)
      await wait(20000)

      const rawTx = await fetchRawTransaction(txid!)
      console.log('Fetched Raw Transaction:', rawTx)

      const tx = Transaction.fromHex(rawTx)
      const beef = Beef.fromBinary(tx.toAtomicBEEF())

      console.log('Generated Verified BEEF:', beef.toHex())

      toast.dark('Locksmith successfully created!')

      setLocksmiths((originalLocksmiths) => [
        locksmithObj,
        ...originalLocksmiths
      ])

      setCreateOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
      console.error(e)
    } finally {
      setCreateLoading(false)
    }
  }

  useAsyncEffect(async () => {
    try {
      const resolver = new LookupResolver()
      let lookupResult = await resolver.query({
        service: 'ls_locksmith',
        query: 'findAll'
      })
      if (!lookupResult || lookupResult.type !== 'output-list') {
        throw new Error('Wrong result type!')
      }
      const parsedResults: Locksmith[] = []
      for (const result of lookupResult.outputs) {
        try {
          const tx = Transaction.fromHex(result.beef.toString())
          const script = tx.outputs[result.outputIndex].lockingScript.toHex()
          const locksmith = Locksmith.fromLockingScript(script) as unknown as Locksmith

          parsedResults.push(locksmith)
        } catch (error) {
          console.error('Failed to parse Locksmith. Error:', error)
        }
      }
      setLocksmiths(parsedResults)
      setLocksmithsLoading(false)
    } catch (error) {
      console.error('Failed to load Locksmiths. Error:', error)
    } finally {
      setLocksmithsLoading(false)
    }
  }, [])

  return (
    <>
      <ToastContainer position='top-right' autoClose={5000} />
      <AppBar position='static'>
        <Toolbar>
          <Typography variant='h6'>Locksmith Overlay</Typography>
          <GitHubIconStyle onClick={() => window.open('https://github.com/p2ppsr/locksmith', '_blank')}>
            <GitHubIcon />
          </GitHubIconStyle>
        </Toolbar>
      </AppBar>
      <AppBarPlaceholder />

      {locksmiths.length >= 1 && (
        <AddMoreFab color='primary' onClick={() => { setCreateOpen(true) }}>
          <AddIcon />
        </AddMoreFab>
      )}

      {locksmithsLoading
        ? (<LoadingBar />)
        : (
          <List>
            {locksmiths.length === 0 && (
              <NoItems>
                <Typography variant='h4'>No Locksmiths</Typography>
              </NoItems>
            )}
            {locksmiths.map((locksmith, i) => (
              <ListItem key={i}>
                <Typography>{locksmith.lockUntilHeight.toString()}</Typography>
              </ListItem>
            ))}
          </List>
        )
      }
    </>
  )
}

export default App
