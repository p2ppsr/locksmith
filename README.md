# BSV Project

Standard BSV project structure.

Helpful Links:

- [LARS (for local development)](https://github.com/bitcoin-sv/lars)
- [CARS CLI (for cloud deployment)](https://github.com/bitcoin-sv/cars-cli)
- [RUN YOUR OWN CARS NODE](https://github.com/bitcoin-sv/cars-node)
- [Specification for deployment-info.json](https://github.com/bitcoin-sv/BRCs/blob/master/apps/0102.md)

## Getting Started

- Clone this repository
- Run `npm i` to install dependencies
- Run `npm run lars` to configure the local environment according to your needs
- Use `npm run start` to spin up and start writing code
- When you're ready to publish your project, start by running `npm run cars` and configuring one (or, especially for overlays, ideally multiple) hosting provider(s)
- For each of your configurations, execute `npm run build` to create CARS project artifacts
- Deploy with `npm run deploy` and your project will be online
- Use `cars` interactively, or visit your hosting provider(s) web portals, to view logs, configure custom domains, and pay your hosting bills
- Share your new BSV project, it is now online!

## Directory Structure

The project structure is roughly as follows, although it can vary by project.

```
| - deployment-info.json
| - package.json
| - local-data/
| - frontend/
  | - package.json
  | - webpack.config.js
  | - src/...
  | - public/...
  | - build/...
| - backend/
  | - package.json
  | - tsconfig.json
  | - mod.ts
  | - src/
    | - contracts/...
    | - lookup-services/...
    | - topic-managers/...
    | - script-templates/...
  | - artifacts/
  | - dist/
```

The one constant is `deployment-info.json`.

## License

[Open BSV License](./LICENSE.txt)

# Locksmith

### "For those of us who think purposely freezing our money for a cause is cool."

### Locksmith is a Bitcoin SV (BSV) application that lets users lock a small amount of satoshis in a smart contract until a specified future block height. This time-lock is accompanied by a custom message and cannot be redeemed until the blockchain reaches the unlock height.

## Features

- Lock 10–1000 satoshis for 1–10 blocks.
- Attach a personal message to each lock.
- View current active locks and the number of blocks remaining.
- Automatically redeem funds once the lock expires.
- Lookup service and topic manager to manage the overlay.

## Tech Stack

| Layer          | Technology                                |
|----------------|--------------------------------------------|
| Frontend       | React + TypeScript + MUI                  |
| Smart Contract | sCrypt (Locksmith contract)               |
| Blockchain     | Bitcoin SV (via `@bsv/sdk`, `@bsv/overlay`) |
| Backend        | Node.js + Express + MongoDB               |
| Storage        | MongoDB (lock metadata)                   |
| Overlay        | LookupService + TopicManager via `@bsv/overlay` |

## Screenshots

The frontend allows you to lock satoshis with a reason and see other users' active locks when it is deployed using CARS (see above).
![App page](https://github.com/user-attachments/assets/9363c9a5-0535-4805-a376-a0322aeef074)

## Getting Started

### Prerequisites

- Node.js ≥ v18
- MongoDB running locally or remotely
- [BRC-100](https://github.com/bitcoin-sv/BRCs/blob/master/wallet/0100.md) Wallet integration (get your [Metanet Desktop](https://github.com/bitcoin-sv/metanet-desktop/releases) wallet)
- Docker (optional, but integral if using LARS (see above))

## Frontend Setup
```bash
cd frontend
npm install
npm run start
Visit: http://localhost:8090
```
## Backend Setup
```bash
cd backend
npm install
npm run build
npm run start
Server runs on: http://localhost:8080
```

## Contracts
### Locksmith 
Built using: ([sCrypt.io](https://scrypt.io/))
```ts
class Locksmith extends SmartContract {
  @prop() address: Addr
  @prop() lockUntilHeight: bigint
  @prop() message: ByteString

  @method(SigHash.ANYONECANPAY_NONE)
  unlock(sig: Sig, pubKey: PubKey) {
    assert(lock conditions...)
  }
}
```
## The contract enforces:
- Lock until a future block height
- Signature verification
- Message attachment for context
 
## Lock Flow
### Lock funds
- User inputs satoshis, block duration, and message.
- Transaction is created using `walletClient.createAction()`.
- Funds are locked in a smart contract and broadcast via `SHIPBroadcaster()`.

### Monitor locks
- The frontend polls the overlay every 10 seconds.
- Active locks are displayed with their remaining blocks.

### Unlock funds
- When the lock expires, the app automatically constructs and broadcasts a redeeming transaction using the `walletClient.createAction()` and the original contract and signature.

## Overlay 
[documentation](https://docs.projectbabbage.com/docs/concepts/overlays)
- Two overlay components handle indexing and filtering:
- LookupService: Tracks active locks in the MongoDB.
- TopicManager: Identifies outputs created using the Locksmith contract.

## Directory Structure
```css
locksmith/
├── frontend/
│   └── App.tsx
├── backend/
│   ├── src/
│   │   ├── contracts/Locksmith.ts
│   │   ├── lookup-services/
│   │   └── topic-managers/
├── artifacts/
├── types/
├── mod.ts
```
