import { HexString, PositiveInteger, PubKeyHex } from '@bsv/sdk'

export interface HodlockerRecord {
  txid: string
  outputIndex: PositiveInteger
  address: PubKeyHex
  lockUntilHeight: PositiveInteger // Convert bigint to number for MongoDB storage
  message: string
  createdAt: Date
}

export interface UTXOReference {
  txid: HexString
  outputIndex: PositiveInteger
  address: PubKeyHex
  lockUntilHeight: PositiveInteger
  message: string
}
