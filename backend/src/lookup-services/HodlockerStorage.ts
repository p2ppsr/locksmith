import { Collection, Db } from 'mongodb'
import { HodlockerRecord } from '../types.js'

// Define UTXOReference as a subset of HodlockerRecord without createdAt
export type UTXOReference = Omit<HodlockerRecord, 'createdAt'>

// Implements a Lookup Storage Engine for Hodlocker
export class HodlockerStorage {
  private readonly records: Collection<HodlockerRecord>

  /**
   * Constructs a new HodlockerStorage instance
   * @param {Db} db - connected MongoDB instance
   */
  constructor(private readonly db: Db) {
    this.records = db.collection<HodlockerRecord>('HodlockerRecords')
  }

  /**
   * Store a Hodlocker record
   * @param {HodlockerRecord} record - the record to store
   */
  async storeRecord(record: {
    txid: string
    outputIndex: number
    address: string
    lockUntilHeight: number
    message: string
    beef: number[]
  }): Promise<void> {
    await this.records.insertOne({
      ...record,
      createdAt: new Date()
    })
  }

  /**
   * Deletes a matching Hodlocker record after redemption
   * @param {string} txid - Transaction ID
   * @param {number} outputIndex - Output index of the UTXO
   */
  async deleteRecord(txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  /**
   * Returns all active locks for UI display
   * @returns {Promise<UTXOReference[]>}
   */
  async findAll(): Promise<UTXOReference[]> {
    return await this.records
      .find({})
      .project<UTXOReference>({
        txid: 1,
        outputIndex: 1,
        address: 1,
        lockUntilHeight: 1,
        message: 1
      })
      .toArray()
  }

  /**
   * Lookup a lock by txid and optional outputIndex
   * @param {string} txid
   * @param {number} [outputIndex]
   * @returns {Promise<HodlockerRecord | null>}
   */
  async findByTxid(
    txid: string,
    outputIndex?: number
  ): Promise<HodlockerRecord | null> {
    const query = outputIndex !== undefined ? { txid, outputIndex } : { txid }
    return await this.records.findOne(query)
  }

  /**
   * Lookup all locks by address
   * @param {string} address
   * @returns {Promise<HodlockerRecord[]>}
   */
  async findByAddress(address: string): Promise<HodlockerRecord[]> {
    return await this.records.find({ address }).toArray()
  }
}
