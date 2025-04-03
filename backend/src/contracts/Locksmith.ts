import {
  Addr,
  assert,
  method,
  prop,
  PubKey,
  pubKey2Addr,
  Sig,
  SmartContract,
  SigHash,
  ByteString
} from 'scrypt-ts'

/*
 * A contract to lock coins to a particular message.
 */
export class Locksmith extends SmartContract {
  @prop()
  readonly address: Addr

  @prop()
  readonly lockUntilHeight: bigint

  @prop()
  readonly message: ByteString

  constructor (address: Addr, lockUntilHeight: bigint, message: ByteString) {
    super(...arguments)
    assert(lockUntilHeight < 500000000, 'must use blockHeight locktime')
    this.address = address
    this.lockUntilHeight = lockUntilHeight
    this.message = message
  }

  // TODO: This SIGHASH type is non-ideal and should be improved for better security.
  @method(SigHash.ANYONECANPAY_NONE)
  public unlock (sig: Sig, pubKey: PubKey) {
    assert(this.ctx.locktime < 500000000, 'must use blockHeight locktime')
    assert(
      this.ctx.sequence == BigInt(0xfffffffe),
      'must use sequence locktime'
    )
    assert(
      this.ctx.locktime >= this.lockUntilHeight,
      'lockUntilHeight not reached'
    )
    assert(
      pubKey2Addr(pubKey) == this.address,
      'pubKey does not belong to address'
    )
    assert(this.checkSig(sig, pubKey), 'signature check failed')
  }
}

// Explicitly export LocksmithContract
export { Locksmith as LocksmithContract }
