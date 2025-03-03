declare module '@bsv/sdk/dist/esm/src/transaction/Transaction.js' {
  export default class Transaction {
    constructor()
    // Define relevant methods and properties
  }
}

declare module '@bsv/sdk/dist/esm/src/wallet/ProtoWallet.js' {
  export default class ProtoWallet {
    constructor()
    // Define relevant methods and properties
  }
}

declare module '@bsv/sdk/dist/esm/src/script/templates/P2PKH.js' {
  export default class P2PKH {
    constructor()
    // Define relevant methods and properties
  }
}

declare module '@bsv/sdk/dist/esm/src/script/templates/PushDrop.js' {
  export default class PushDrop {
    constructor()
    // Define relevant methods and properties
  }
}

declare module '@bsv/sdk/dist/esm/src/script/templates/RPuzzle.js' {
  export default class RPuzzle {
    constructor()
    // Define relevant methods and properties
  }
}

declare module '@bsv/sdk/dist/esm/src/transaction/index.js' {
  export { default as Transaction } from './Transaction.js'
  export { default as MerklePath } from './MerklePath.js'
  export { isBroadcastResponse, isBroadcastFailure } from './Broadcaster.js'
  export { default as BeefTx } from './BeefTx.js'
  export * from './Beef.js'
  export { default as BeefParty } from './BeefParty.js'
}

declare module '@bsv/sdk/dist/esm/src/wallet/index.js' {
  export * from './Wallet.interfaces.js'
  export * from './KeyDeriver.js'
  export { default as CachedKeyDeriver } from './CachedKeyDeriver.js'
  export { default as ProtoWallet } from './ProtoWallet.js'
  export { default as WalletClient } from './WalletClient.js'
  export { default as WalletErrors } from './WalletError.js'
  export * from './WalletError.js'
  export * from './substrates/index.js'
}

declare module '@bsv/sdk/dist/esm/src/script/templates/index.js' {
  export { default as P2PKH } from './P2PKH.js'
  export { default as RPuzzle } from './RPuzzle.js'
  export { default as PushDrop } from './PushDrop.js'
}
