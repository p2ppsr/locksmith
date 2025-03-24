import { PositiveInteger, PubKeyHex, TXIDHexString } from '@bsv/sdk'

export interface HodlockerRecord {
  txid: TXIDHexString
  outputIndex: PositiveInteger
  address: PubKeyHex
  lockUntilHeight: PositiveInteger
  message: string
  createdAt: Date
  beef: number[]
}

export type UTXOReference = Omit<HodlockerRecord, 'createdAt'>
