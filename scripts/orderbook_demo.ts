import { logger } from '../src/logger';
import axios from 'axios';
import { ethers, Wallet } from 'ethers';
import { ApiMarketName, ApiSide } from '../src/types';
import { Perpetual } from '../src/perpetual';
import BigNumber from 'bignumber.js';
import { jsonifyPerpetualOrder, waitTx } from '../src/utils';
import { NULL_ADDRESS } from '../src/constants';
import {
  defaultHttpServiceConfig,
  DEPLOYER_PRIVATE_KEY,
  DELEVERAGING_PRIVATE_KEY,
  OPERATOR_PRIVATE_KEY,
} from '../src/config';
import { WalletProvider } from '../src/wallet_provider';

const baseUrl = `http://localhost:3000`;

async function getRequest(url: string, query: any) {
  const res = await axios.get(url, { params: query });
  const quoteRes = res.data;
  logger.info(quoteRes);
}

async function getOrders(query) {
  const url = `${baseUrl}/orderbook/v1/order`;
  await getRequest(url, query);
}

async function getTradeHistory(query) {
  const url = `${baseUrl}/orderbook/v1/tradesHistory`;
  await getRequest(url, query);
}

async function requestByRoute(route) {
  const url = `${baseUrl}${route}`;
  const res = await axios.get(url);
  const quoteRes = res.data;
  logger.info(quoteRes);
  return quoteRes;
}

async function getBalance(account: string) {
  await requestByRoute(`/account/v1/${account}`);
}

async function postOrder(orderData) {
  const url = `${baseUrl}/orderbook/v1/order`;
  try {
    const res = await axios.post(url, orderData);
    const quoteRes = res.data;
    logger.info(quoteRes);
  } catch (error: any) {
    logger.fatal(`${error.response.data.error}`);
  }
}

async function prepareMoney(perpetual: Perpetual, wallets: Wallet[]) {
  const mintAmount = ethers.utils.parseUnits('10000', 6); // 1000 margin token

  // the first one has permission to mint token
  const mintWallet = wallets[0];
  // mint margin token first
  for (const wallet of wallets) {
    await waitTx(
      perpetual.contracts.marginToken
        .connect(mintWallet)
        .mint(wallet.address, mintAmount)
    );
  }

  // deposit margin token to perpetual
  const max = ethers.constants.MaxUint256;
  for (const wallet of wallets) {
    await waitTx(
      perpetual.contracts.marginToken
        .connect(wallet)
        .approve(perpetual.contracts.perpetualProxy.address, max)
    );
    await waitTx(
      perpetual.contracts.perpetualProxy
        .connect(wallet)
        .deposit(wallet.address, mintAmount)
    );
  }
}

async function prepareOrders(
  perpetual: Perpetual,
  makerWallet: Wallet,
  takerWallet: Wallet
) {
  const market = ApiMarketName.PBTC_USDC;
  const mintAmount = new BigNumber(
    ethers.utils.parseUnits('10000', 6).toString()
  ); // 1000 margin token

  const orders = [];

  //////////////////////////// sell orders //////////////////////////////
  {
    const prices = ['19259', '18784', '18512'];
    const rates = [1, 2, 3];
    const sellOrders = await Promise.all(
      prices.map((price, ind) => {
        return perpetual.api.createPerpetualOrder({
          market,
          side: ApiSide.SELL,
          amount: mintAmount.times(rates[ind]).div(price).toString(),
          price,
          maker: makerWallet.address,
          taker: NULL_ADDRESS,
          limitFee: new BigNumber(0),
        });
      })
    );
    orders.push(...sellOrders);
  }

  //////////////////////////// buy orders //////////////////////////////
  {
    const prices = ['18227', '18036', '17890'];
    const rates = [1, 2, 3];

    const buyOrders = await Promise.all(
      prices.map((price, ind) => {
        return perpetual.api.createPerpetualOrder({
          market,
          side: ApiSide.BUY,
          amount: mintAmount.times(rates[ind]).div(price).toString(),
          price,
          maker: takerWallet.address,
          taker: NULL_ADDRESS,
          limitFee: new BigNumber(0),
        });
      })
    );

    orders.push(...buyOrders);
  }

  await Promise.all(
    orders.map(order => postOrder(jsonifyPerpetualOrder(order)))
  );
}

async function fillOrder(perpetual: Perpetual, takerWallet: Wallet) {
  const market = ApiMarketName.PBTC_USDC;
  const marginAmount = ethers.utils.parseUnits('10000', 6).toString(); // 1000 margin token
  const price = new BigNumber('19325');
  const amount = new BigNumber(marginAmount)
    .times(2)
    .div(price.toString().toString()); // position amount
  const takerOrder = await perpetual.api.createPerpetualOrder({
    market,
    side: ApiSide.BUY,
    amount,
    price,
    maker: takerWallet.address,
    taker: NULL_ADDRESS,
    limitFee: new BigNumber(0),
  });

  await postOrder(jsonifyPerpetualOrder(takerOrder));
}

async function main() {
  const url = defaultHttpServiceConfig.ethereumRpcUrl;
  const provider = new ethers.providers.JsonRpcProvider(url);
  const usersPrivateKey = [
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  ];
  const walletProvider = new WalletProvider(provider);
  walletProvider.unlockAll([
    DEPLOYER_PRIVATE_KEY,
    DELEVERAGING_PRIVATE_KEY,
    OPERATOR_PRIVATE_KEY,
    ...usersPrivateKey,
  ] as string[]);

  const market = ApiMarketName.PBTC_USDC;
  const perpetual = new Perpetual(
    walletProvider,
    market,
    defaultHttpServiceConfig.chainId
  );
  const sellerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const buyerWallet = new ethers.Wallet(usersPrivateKey[0], provider);
  const takerWallet = new ethers.Wallet(usersPrivateKey[1], provider);

  await prepareMoney(perpetual, [sellerWallet, buyerWallet, takerWallet]);
  await prepareOrders(perpetual, sellerWallet, buyerWallet);

  // fill orderbook, taker will buy all ask orders in orderbook actually
  await fillOrder(perpetual, takerWallet);

  await getTradeHistory({});
  await getBalance(takerWallet.address);
}

main().catch(err => logger.error(err.stack));
