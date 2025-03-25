declare module 'react-toastify'
declare module '@bsv/sdk'

export interface HodlockerToken {
  token: Token
  keyID: string
  signature: string
  lockUntilHeight: number
  message: string
  address: string
  //contract: string
}

// Interfaces used, it is necessary to declare them here
export interface Token {
  atomicBeefTX: HexString
  txid: TXIDHexString
  outputIndex: PositiveIntegerOrZero
  lockingScript: HexString
  satoshis: SatoshiValue
}
