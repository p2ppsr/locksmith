'use strict'
const __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
  const c = arguments.length; let r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc; let d
  if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function') r = Reflect.decorate(decorators, target, key, desc)
  else for (let i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r
  return c > 3 && r && Object.defineProperty(target, key, r), r
}
Object.defineProperty(exports, '__esModule', { value: true })
exports.Lockup = void 0
const scrypt_ts_1 = require('scrypt-ts')
class Lockup extends scrypt_ts_1.SmartContract {
  constructor (pkhash, lockUntilHeight) {
    super(...arguments);
    (0, scrypt_ts_1.assert)(lockUntilHeight < 500000000, 'must use blockHeight locktime')
    this.lockUntilHeight = lockUntilHeight
    this.pkhash = pkhash
  }

  redeem (sig, pubkey) {
    (0, scrypt_ts_1.assert)(this.ctx.locktime < 500000000, 'must use blockHeight locktime');
    (0, scrypt_ts_1.assert)(this.ctx.sequence < 0xffffffff, 'must use sequence locktime');
    (0, scrypt_ts_1.assert)(this.ctx.locktime >= this.lockUntilHeight, 'lockUntilHeight not reached');
    (0, scrypt_ts_1.assert)((0, scrypt_ts_1.hash160)(pubkey) == this.pkhash, 'public key hashes are not equal');
    // Check signature validity.
    (0, scrypt_ts_1.assert)(this.checkSig(sig, pubkey), 'signature check failed')
  }
}
exports.Lockup = Lockup
__decorate([
  (0, scrypt_ts_1.prop)()
], Lockup.prototype, 'lockUntilHeight', void 0)
__decorate([
  (0, scrypt_ts_1.prop)()
], Lockup.prototype, 'pkhash', void 0)
__decorate([
  (0, scrypt_ts_1.method)()
], Lockup.prototype, 'redeem', null)
// # sourceMappingURL=lockup.js.map
