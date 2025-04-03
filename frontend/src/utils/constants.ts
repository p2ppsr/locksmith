import { WalletClient } from '@bsv/sdk'

interface Constants {
  walletClient: WalletClient
  networkPreset: 'local' | 'mainnet'
}

let constants: Constants

console.log('window.location.host:', window.location.host)
if (window.location.host.startsWith('localhost')) {
  // local (to be used with LARS)
  constants = {
    walletClient: new WalletClient('json-api', 'localhost'),
    networkPreset: 'local'
  }
} else {
  // CARS
  constants = {
    walletClient: new WalletClient(),
    networkPreset: 'mainnet'
  }
}

export default constants
