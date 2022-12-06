import {
  address,
  TradeArg,
  SignedOrder,
  Price,
  Fee,
  SendOptions,
  BigNumberable,
} from './types';
import { Orders } from './orders';
import { WalletProvider } from './wallet_provider';
import {
  TransactionResponse,
  TransactionRequest,
} from '@ethersproject/abstract-provider';
import { Contracts } from './contracts';
import BigNumber from 'bignumber.js';
import { makeLiquidateTradeData } from './liquidation';
import { makeDeleverageTradeData } from './deleverage';

interface TempTradeArg {
  maker: address;
  taker: address;
  trader: address;
  data: string;
}

export class TradeOperation {
  // constants
  private orders: Orders;

  // stateful data
  private trades: TempTradeArg[];
  private committed: boolean;

  constructor(
    private provider: WalletProvider,
    private contracts: Contracts,
    orders: Orders
  ) {
    this.orders = orders;

    this.trades = [];
    this.committed = false;
  }

  // ============ Public Functions ============

  public fillSignedOrder(
    taker: address,
    order: SignedOrder,
    amount: BigNumber,
    price: Price,
    fee: Fee
  ): this {
    const tradeData = this.orders.fillToTradeData(order, amount, price, fee);
    return this.addTradeArg({
      maker: order.maker,
      taker,
      data: tradeData,
      trader: this.orders.address,
    });
  }

  public liquidate(
    maker: address,
    taker: address,
    amount: BigNumberable,
    isBuy: boolean,
    allOrNothing: boolean
  ): this {
    return this.addTradeArg({
      maker,
      taker,
      data: makeLiquidateTradeData(amount, isBuy, allOrNothing),
      trader: this.contracts.p1Liquidation.address,
    });
  }

  public deleverage(
    maker: address,
    taker: address,
    amount: BigNumberable,
    isBuy: boolean,
    allOrNothing: boolean
  ): this {
    return this.addTradeArg({
      maker,
      taker,
      data: makeDeleverageTradeData(amount, isBuy, allOrNothing),
      trader: this.contracts.p1Deleveraging.address,
    });
  }

  public async commit(options: SendOptions): Promise<TransactionResponse> {
    if (this.committed) {
      throw new Error('Operation already committed');
    }
    if (!this.trades.length) {
      throw new Error('No tradeArgs have been added to trade');
    }

    this.committed = true;

    // construct sorted address list
    const accountSet = new Set<address>();
    this.trades.forEach(t => {
      accountSet.add(t.maker);
      accountSet.add(t.taker);
    });
    const accounts: address[] = Array.from(accountSet).sort();

    // construct trade args
    const tradeArgs: TradeArg[] = this.trades.map(t => ({
      makerIndex: accounts.indexOf(t.maker),
      takerIndex: accounts.indexOf(t.taker),
      trader: t.trader,
      data: t.data,
    }));

    try {
      const wallet = this.provider.getSigner(options.from);
      const data = this.contracts.perpetualV1.interface.encodeFunctionData(
        'trade',
        [accounts, tradeArgs]
      );
      const tx: TransactionRequest = {
        to: this.contracts.perpetualProxy.address,
        data,
      };
      const txRes = await wallet.sendTransaction(tx);
      return txRes;
    } catch (error) {
      this.committed = false;
      throw error;
    }
  }

  public addTradeArg({
    maker,
    taker,
    trader,
    data,
  }: {
    maker: address;
    taker: address;
    trader: address;
    data: string;
  }): this {
    if (this.committed) {
      throw new Error('Operation already committed');
    }
    this.trades.push({
      trader,
      data,
      maker: maker.toLowerCase(),
      taker: taker.toLowerCase(),
    });
    return this;
  }
}
