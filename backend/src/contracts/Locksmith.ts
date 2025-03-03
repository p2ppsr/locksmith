import {
  Addr,
  assert,
  ByteString,
  method,
  prop,
  PubKey,
  pubKey2Addr,
  Sig,
  SmartContract,
  SigHash
} from 'scrypt-ts'

export class Locksmith extends SmartContract {
  @prop(true)
  readonly address: Addr

  @prop(true)
  readonly lockUntilHeight: bigint

  @prop(true)
  readonly message: ByteString

  constructor(address: Addr, lockUntilHeight: bigint, message: ByteString) {
    super(...arguments)
    assert(lockUntilHeight < BigInt(500000000), 'must use blockHeight locktime')
    this.address = address
    this.lockUntilHeight = lockUntilHeight
    this.message = message
  }

  @method(SigHash.ANYONECANPAY_NONE)
  public unlock(sig: Sig, pubKey: PubKey): void {
    assert(
      this.ctx.locktime < BigInt(500000000),
      'must use blockHeight locktime'
    )
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
