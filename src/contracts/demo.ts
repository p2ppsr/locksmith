import {
    Addr,
    assert,
    method,
    prop,
    PubKey,
    pubKey2Addr,
    Sig,
    SmartContract,
} from 'scrypt-ts'

/*
 * A simple Pay to Public Key Hash (P2PKH) contract.
 */
export class P2PKH extends SmartContract {
    // Address of the recipient.
    @prop()
    readonly address: Addr

    @prop()
    satoshis: bigint

    @prop()
    lockUntilHeight: bigint

    constructor(address: Addr, satoshis: bigint, lockUntilHeight: bigint) {
        super(...arguments)
        assert(lockUntilHeight < 500000000, 'must use blockHeight locktime')
        this.address = address
        this.satoshis = satoshis
        this.lockUntilHeight = lockUntilHeight
        console.log('Demo:address:', address)
    }

    @method()
    public unlock(sig: Sig, pubKey: PubKey) {
        console.log('Demo:this.ctx.locktime:', this.ctx.locktime)
        console.log('Demo:this.ctx.sequence:', this.ctx.sequence)
        assert(this.ctx.locktime < 500000000, 'must use blockHeight locktime')
        assert(this.ctx.sequence < 0xffffffff, 'must use sequence locktime')
        assert(
            this.ctx.locktime >= this.lockUntilHeight,
            'lockUntilHeight not reached'
        )        // Check if the passed public key belongs to the specified address.
        assert(
            pubKey2Addr(pubKey) == this.address,
            'pubKey does not belong to address'
        )
        // Check signature validity.
        assert(this.checkSig(sig, pubKey), 'signature check failed')
    }
}
