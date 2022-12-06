import { ethers } from 'ethers';
import { BigNumber } from 'bignumber.js';
import {
  ApiMarketName,
  ChainId,
  PerpetualOptions,
  ApiBalance,
  ApiAccount,
  Balance,
} from './types';
import { Contracts } from './contracts';
import { Api } from './api';
import { Orders } from './orders';
import { Trade } from './trade';
import { PriceOracle } from './price_oracle';
import { FundingOracle } from './funding_oracle';
import { WalletProvider } from './wallet_provider';
import { Liquidation } from './liquidation';
import { Getters } from './getters';

export class Perpetual {
  public contracts: Contracts;
  public orders: Orders;
  public api: Api;
  public trade: Trade;
  public priceOracle: PriceOracle;
  public fundingOracle: FundingOracle;
  public liquidation: Liquidation;
  public getters: Getters;

  constructor(
    public provider: WalletProvider,
    market: ApiMarketName,
    chainId: number = ChainId.Mainnet,
    options: PerpetualOptions = {}
  ) {
    this.contracts = new Contracts(
      provider,
      market,
      chainId,
      options.addressBook
    );
    this.orders = new Orders(provider, this.contracts);
    this.getters = new Getters(this.contracts);
    this.api = new Api(this.orders, options.apiOptions);
    this.trade = new Trade(this.provider, this.contracts, this.orders);
    this.priceOracle = new PriceOracle(this.contracts);
    this.fundingOracle = new FundingOracle(this.contracts);
    this.liquidation = new Liquidation(this.contracts);
  }

  async getAccount(account: string): Promise<ApiAccount> {
    const [balance, accountIndex] = await Promise.all([
      this.contracts.perpetualProxy.getAccountBalance(account),
      this.contracts.perpetualProxy.getAccountIndex(account),
    ]);
    const indexValue = new BigNumber(accountIndex.value.toString());

    const margin = new BigNumber(balance.margin.toString());
    const position = new BigNumber(balance.position.toString());

    const apiBalance: ApiBalance = {
      margin: (balance.marginIsPositive ? margin : margin.negated()).toString(),
      position: (balance.positionIsPositive
        ? position
        : position.negated()
      ).toString(),
      indexValue: accountIndex.isPositive
        ? indexValue.toString()
        : indexValue.negated().toString(),
      indexTimestamp: accountIndex.timestamp.toString(),
    };

    return {
      owner: account,
      balances: { [this.contracts.market]: apiBalance },
    };
  }

  public async getAccountBalance(account: string): Promise<Balance> {
    const balance = await this.contracts.perpetualProxy.getAccountBalance(
      account
    );

    return Balance.fromSolidity({
      ...balance,
      margin: balance.margin.toString(),
      position: balance.position.toString(),
    });
  }
}
