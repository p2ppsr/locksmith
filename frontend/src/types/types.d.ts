declare module 'react-toastify'
declare module '@bsv/sdk'

// Interfaces used, it is necessary to declare them here
export interface Token {
  inputs: Record<string, OptionalEnvelopeEvidenceApi> | undefined
  mapiResponses: MapiResponseApi[] | undefined
  proof: Buffer | TscMerkleProofApi | undefined
  rawTX: string
  satoshis: number
  txid: string
  outputIndex: number
  lockingScript: string
}
