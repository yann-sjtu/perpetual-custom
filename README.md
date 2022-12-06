# dydx demo

- The project includes smart contracts and nodejs server to run on-chain and off-chain.
  the server runs to order matching and provider apis for clients to submit signed orders. the contracts
  is used for order mathcing validation on-chain and accounts settlement.

## Installation

```bash
yarn && yarn hardhat compile
```

## Demo

### simple demo

```
# start node
yarn hardhat node

# deploy contracts
yarn hardhat run scripts/deploy.ts --network localhost

# run demo script
yarn ts-node scripts/demo.ts
```

### server

- start worker to order matching automatically

```bash
# start node
yarn hardhat node

# deploy contracts
yarn hardhat run scripts/deploy.ts --network localhost

# start server
yarn start

# mock a orderbook
yarn ts-node scripts/orderbook_demo.ts
```

## Development
