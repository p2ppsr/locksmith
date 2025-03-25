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
   * Store a full Hodlocker token, including serialized BEEF.
   * @param {HodlockerRecord} record - the full Hodlocker token record.
   */
  async storeRecord(
    txid: string,
    outputIndex: number,
    address: string,
    lockUntilHeight: number,
    message: string
  ): Promise<void> {
    // Insert new record
    await this.records.insertOne({
      txid,
      outputIndex,
      address,
      lockUntilHeight,
      message,
      createdAt: new Date()
    })
  }

  // async storeRecord(record: HodlockerRecord): Promise<void> {
  //   await this.records.insertOne({
  //     ...record,
  //     createdAt: new Date()
  //   })
  // }

  /**
   * Deletes a matching Hodlocker token after redemption.
   * @param {string} txid - Transaction ID
   * @param {number} outputIndex - Output index of the UTXO
   */
  async deleteRecord(txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  /**
   * Returns all active locks for UI display.
   * This includes the full token but excludes the BEEF for lightweight retrieval.
   * @returns {Promise<UTXOReference[]>}
   */
  async findAll(): Promise<UTXOReference[]> {
    return await this.records
      .find({})
      .project<UTXOReference>({ txid: 1, outputIndex: 1 })
      .toArray()
      .then(results =>
        results.map(record => ({
          txid: record.txid,
          outputIndex: record.outputIndex
        }))
      )
  }
}
