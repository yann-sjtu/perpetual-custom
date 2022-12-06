import { OrderBookService } from '../services/orderbook_service';
import { NotFoundError } from '../errors';
import { SignedOrderEntity } from '../entities';
import { NULL_ADDRESS } from '../constants';
import { BigNumber } from 'bignumber.js';
import { SignedOrder, Price, Fee, ApiMarketName, ApiSide } from '../types';
import { Context } from 'koa';
import { paginationUtils, jsonifyPerpetualOrder, orderUtils } from '../utils';
import { logger } from '../logger';
import { EventManager } from '../events';

export class OrderBookHandlers {
  constructor(
    private readonly orderBook: OrderBookService,
    private readonly eventManager: EventManager
  ) {}

  public async getOrderByHashAsync(ctx: Context): Promise<void> {
    const orderIfExists = await this.orderBook.getOrderByHashIfExistsAsync(
      ctx.params.orderHash
    );
    if (orderIfExists === undefined) {
      throw new NotFoundError();
    } else {
      ctx.status = 200;
      ctx.body = orderIfExists;
    }
  }

  public async getQuotePriceAsync(ctx: Context) {
    const amount = new BigNumber(ctx.query.amount as string);
    const isBuy = ctx.query.isBuy as unknown as boolean;

    const quoteRes = await this.orderBook.quoteAsync(amount, isBuy);
    ctx.status = 200;
    ctx.body = quoteRes;
  }

  public async getMarkets(ctx: Context) {
    const marketMessage = await this.orderBook.getMarkets();
    ctx.status = 200;
    ctx.body = marketMessage;
  }

  public async getIndexPriceAsync(ctx: Context) {
    const indexPrice = await this.orderBook.getIndexPriceAsync();
    ctx.status = 200;
    ctx.body = { price: indexPrice.toFixed(2) };
  }

  public async getFundingRateAsync(ctx: Context) {
    const fundingRateRes = await this.orderBook.getFundingRate();
    ctx.status = 200;
    ctx.body = fundingRateRes;
  }

  public async ordersAsync(ctx: Context): Promise<void> {
    const orderFieldFilters = new SignedOrderEntity(ctx.query);
    const additionalFilters = {
      trader: ctx.query.trader ? ctx.query.trader.toString() : undefined,
      isUnfillable: ctx.query.unfillable === 'true',
    };
    const { page, perPage } = paginationUtils.parsePaginationConfig(ctx);
    const paginatedOrders = await this.orderBook.getOrdersAsync(
      page,
      perPage,
      orderFieldFilters,
      additionalFilters
    );
    ctx.status = 200;
    ctx.body = paginatedOrders;
  }

  public async orderbookAsync(ctx: Context): Promise<void> {
    const { page, perPage } = paginationUtils.parsePaginationConfig(ctx);
    const market = ctx.query.market as ApiMarketName;
    const orderbookResponse = await this.orderBook.getOrderBookAsync(
      page,
      perPage,
      market
    );
    ctx.status = 200;
    ctx.body = orderbookResponse;
  }

  public async tradesHistoryAsync(ctx: Context) {
    const { page, perPage } = paginationUtils.parsePaginationConfig(ctx);
    const tradesHistory = await this.orderBook.getTradesHistoryAsync(
      page,
      perPage
    );

    ctx.status = 200;
    ctx.body = tradesHistory;
  }

  public async cancelOrderAsync(ctx: Context): Promise<void> {
    if (!Array.isArray(ctx.request.body.ordersHash)) {
      throw new Error(`non array data is not supported`);
    }
    const ordersHash: string[] = ctx.request.body.ordersHash;
    const orders = await Promise.all(
      ordersHash.map(orderHash =>
        this.orderBook.getOrderByHashIfExistsAsync(orderHash)
      )
    );
    if (!orders.length) {
      logger.warn(`order has already removed from orderbook`);
    }
    await this.orderBook.cancelOrdersAsyncByHash(ordersHash);
    orders.map(order =>
      this.eventManager.emitOrder({
        order: order.order,
        metaData: {
          ...order.metaData,
          filledAmount: order.order.amount,
        },
      })
    );
    ctx.status = 200;
  }

  public async postOrderAsync(ctx: Context): Promise<void> {
    const shouldSkipConfirmation = ctx.query.skipConfirmation === 'true';
    const signedOrder = unmarshallOrder(ctx.request.body);

    const { filledAmount, isFullfilled } =
      await this.orderBook.fulfillOrderAsync(signedOrder);

    if (shouldSkipConfirmation) {
      ctx.status = 200;
    }
    const sraOrder = await this.orderBook.addOrderAsync(
      signedOrder,
      filledAmount
    );
    if (!isFullfilled) {
      // ignore fulfilled order
      this.eventManager.emitOrder(sraOrder);
    }
    logger.info(`order saved`);
    if (!shouldSkipConfirmation) {
      ctx.status = 200;
    }
  }
}

// As the order come in as JSON they need to be turned into the correct types such as BigNumber
function unmarshallOrder(signedOrderRaw: any): SignedOrder {
  const signedOrder: SignedOrder = {
    // Defaults...
    taker: NULL_ADDRESS,
    ...signedOrderRaw,
    limitPrice: new Price(signedOrderRaw.limitPrice),
    amount: new BigNumber(signedOrderRaw.amount),
    triggerPrice: new Price(signedOrderRaw.triggerPrice),
    limitFee: new Fee(signedOrderRaw.limitFee),
    expiration: new BigNumber(signedOrderRaw.expiration),
    salt: new BigNumber(signedOrderRaw.salt),
  };
  return signedOrder;
}

// function marshallOrder(signedOrderRaw: any): SignedOrder {
// }
