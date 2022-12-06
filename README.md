# dydx demo

- The project includes smart contracts and nodejs server to run on-chain and off-chain.
  the server runs to order matching and provider apis for clients to submit signed orders. the contracts
  is used for order mathcing validation on-chain and accounts settlement.

## Installation

```bash
yarn && yarn hardhat compile
```

## Demo

### 
1. 向 67f5b0C1BcDCfc49A724C027cf3605a829DA2E94 转账okt作为初始手续费
2. 修改 .env 中的 ETHEREUM_RPC_URL, 修改 hardhat.config.ts 中的 networks->localhost->url
3. `yarn hardhat run scripts/deploy.ts --network localhost`

