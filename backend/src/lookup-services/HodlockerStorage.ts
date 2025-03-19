import { Collection, Db } from 'mongodb'
import { HodlockerRecord, UTXOReference } from '../types.js'

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
   * Stores a new Hodlocker record
   * @param {string} txid - Transaction ID
   * @param {number} outputIndex - Index of the UTXO
   * @param {string} address - Address of the locker
   * @param {bigint} lockUntilHeight - Block height until funds can be redeemed
   * @param {string} message - Message associated with the lock
   */
  async storeRecord(
    txid: string,
    outputIndex: number,
    address: string,
    lockUntilHeight: bigint,
    message: string
  ): Promise<void> {
    await this.records.insertOne({
      txid,
      outputIndex,
      address,
      lockUntilHeight: Number(lockUntilHeight), // Convert bigint to number
      message,
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
   * @returns {Promise<UTXOReference[]>} - List of UTXOs with lock details
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
      .then(results =>
        results.map(record => ({
          txid: record.txid,
          outputIndex: record.outputIndex,
          address: record.address,
          lockUntilHeight: record.lockUntilHeight,
          message: record.message
        }))
      )
  }
}
