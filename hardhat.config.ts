import * as dotenv from 'dotenv';

import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: '0.8.9' },
      {
        version: '0.5.16',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    localhost: {
      url: `http://16.163.139.64:8545`,
      accounts: [`${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
    okc: {
      url: 'https://exchainrpc.okex.org',
      accounts: [`${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
    okctest: {
      url: 'https://exchaintestrpc.okex.org',
      accounts: [`${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [`${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
    polygontest: {
      url: 'https://rpc-mumbai.maticvigil.com/',
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
  },
};

export default config;
