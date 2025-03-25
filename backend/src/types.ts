import { PositiveInteger, PubKeyHex, TXIDHexString } from '@bsv/sdk'

export interface HodlockerRecord {
  txid: TXIDHexString
  outputIndex: PositiveInteger
  address: PubKeyHex
  lockUntilHeight: PositiveInteger
  message: string
  createdAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}
