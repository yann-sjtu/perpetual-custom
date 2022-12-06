import {
  BigNumberable,
  address,
  SignedOrder,
  ApiMarketName,
  ApiSide,
  SigningMethod,
  Fee,
  Price,
  Order,
  ApiOptions,
} from './types';
import { BigNumber } from 'bignumber.js';
import { generatePseudoRandom256BitNumber, getRealExpiration } from './utils';
import { Orders } from './orders';

const FOUR_WEEKS_IN_SECONDS = 60 * 60 * 24 * 28;
const DEFAULT_API_ENDPOINT = 'https://api.dydx.exchange';
const DEFAULT_API_TIMEOUT = 10000;

export class Api {
  private endpoint: string;
  private timeout: number;
  private perpetualOrders: Orders;

  constructor(perpetualOrders: Orders, apiOptions: ApiOptions = {}) {
    this.endpoint = apiOptions.endpoint || DEFAULT_API_ENDPOINT;
    this.timeout = apiOptions.timeout || DEFAULT_API_TIMEOUT;
    this.perpetualOrders = perpetualOrders;
  }
  async createPerpetualOrder({
    market,
    side,
    amount,
    price,
    maker,
    taker,
    expiration = new BigNumber(FOUR_WEEKS_IN_SECONDS),
    postOnly,
    limitFee,
    salt,
  }: {
    market: ApiMarketName;
    side: ApiSide;
    amount: BigNumberable;
    price: BigNumberable;
    maker: address;
    taker: address;
    expiration?: BigNumberable;
    postOnly?: boolean;
    limitFee?: BigNumberable;
    salt?: BigNumberable;
  }): Promise<SignedOrder> {
    if (!Object.values(ApiMarketName).includes(market)) {
      throw new Error(`market: ${market} is invalid`);
    }
    if (!Object.values(ApiSide).includes(side)) {
      throw new Error(`side: ${side} is invalid`);
    }

    const amountNumber: BigNumber = new BigNumber(amount);
    const perpetualLimitFee: Fee = limitFee
      ? new Fee(limitFee)
      : this.perpetualOrders.getFeeForOrder(amountNumber, !postOnly);

    const realExpiration: BigNumber = getRealExpiration(expiration);
    const order: Order = {
      maker,
      taker,
      limitFee: perpetualLimitFee,
      isBuy: side === ApiSide.BUY,
      isDecreaseOnly: false,
      amount: amountNumber,
      limitPrice: new Price(price),
      triggerPrice: new Price('0'),
      expiration: realExpiration,
      salt: salt ? new BigNumber(salt) : generatePseudoRandom256BitNumber(),
    };

    const typedSignature: string = await this.perpetualOrders.signOrder(
      order,
      SigningMethod.Hash
    );

    return {
      ...order,
      typedSignature,
    };
  }

  // async submitOrder(){}
}
