import * as WebSocket from 'ws';
import { Connection, In, MoreThanOrEqual } from 'typeorm';
import { SignedOrderEntity } from '../entities';
import { OrderBookService } from '../services/orderbook_service';
import {
  TradeHistory,
  OrderBookSubscriptionOptsWithChannel,
  WebsocketSRAOpts,
  SRAOrder,
  UpdateOrdersChannelMessageWithChannel,
  UpdateAccountBalanceChannelMessageWithChannel,
  OrdersChannelMessageTypes,
  MessageChannels,
  SignedOrder,
  WebsocketConnectionEventType,
  OrderbookWSResponse,
  OrderBookRequest,
  UpdateTradesHistoryChannelMessageWithChannel,
  MessageTypes,
  EventType,
  ApiAccount,
} from '../types';
import * as _ from 'lodash';
import { paginationUtils, orderUtils } from '../utils';
import { logger } from '../logger';
import {
  WebsocketServiceError,
  NotImplementedError,
  MalformedJSONError,
} from '../errors';
import http from 'http';
import { EventManager } from '../events';

interface WrappedWebSocket extends WebSocket {
  isAlive: boolean;
  requestIds: Set<string>;
}

type ALL_SUBSCRIPTION_OPTS = 'ALL_SUBSCRIPTION_OPTS';

const DEFAULT_OPTS: WebsocketSRAOpts = {
  pongInterval: 5000,
  path: '/',
};

export class WebsocketService {
  private readonly _server: WebSocket.Server;
  private readonly connection: Connection;
  private readonly orderBook_service: OrderBookService;
  private readonly _pongIntervalId: NodeJS.Timeout;
  private readonly eventManager: EventManager;
  private readonly _requestIdToSocket: Map<string, WrappedWebSocket> =
    new Map(); // requestId to WebSocket mapping
  private readonly _requestIdToSubscriptionOpts: Map<
    string,
    OrderBookSubscriptionOptsWithChannel
  > = new Map(); // requestId -> { base, quote }
  private static _matchesOrdersChannelSubscription(
    order: SignedOrder,
    opts: OrderBookSubscriptionOptsWithChannel
  ): boolean {
    if (opts.channel !== MessageChannels.Orders) {
      return false;
    }
    if (opts.taker && opts.taker.toLowerCase() !== order.taker.toLowerCase()) {
      return false;
    }
    if (opts.maker && opts.maker.toLowerCase() !== order.maker.toLowerCase()) {
      return false;
    }

    if (
      opts.trader &&
      ![order.maker.toLowerCase(), order.taker.toLowerCase()].includes(
        opts.trader.toLowerCase()
      )
    ) {
      return false;
    }
    return true;
  }

  private static _matchesAccountStateChannelSubscription(
    apiAccount: ApiAccount,
    opts: OrderBookSubscriptionOptsWithChannel
  ): boolean {
    if (opts.channel !== MessageChannels.AccountState) {
      return false;
    }
    if (
      opts.trader &&
      apiAccount.owner.toLowerCase() !== opts.trader.toLowerCase()
    ) {
      return false;
    }
    return true;
  }

  private static _matchesTradesHistoryChannelSubscription(
    trade: TradeHistory,
    opts: OrderBookSubscriptionOptsWithChannel
  ): boolean {
    if (opts.channel !== MessageChannels.TradeHistory) {
      return false;
    }
    if (opts.taker && opts.taker.toLowerCase() !== trade.taker.toLowerCase()) {
      return false;
    }
    if (opts.maker && opts.maker.toLowerCase() !== trade.maker.toLowerCase()) {
      return false;
    }
    if (
      opts.trader &&
      ![trade.maker.toLowerCase(), trade.taker.toLowerCase()].includes(
        opts.trader.toLowerCase()
      )
    ) {
      return false;
    }
    return true;
  }

  private static _handleError(_ws: WrappedWebSocket, err: Error): void {
    logger.error(new WebsocketServiceError());
  }
  constructor(
    server: http.Server,
    eventManager: EventManager,
    connection: Connection,
    orderBook_service: OrderBookService,
    opts?: Partial<WebsocketSRAOpts>
  ) {
    const wsOpts: WebsocketSRAOpts = {
      ...DEFAULT_OPTS,
      ...opts,
    };
    this._server = new WebSocket.Server({ server, path: wsOpts.path });
    this._server.on('connection', this._processConnection.bind(this));
    this._server.on('error', WebsocketService._handleError.bind(this));
    this._pongIntervalId = setInterval(
      this._cleanupConnections.bind(this),
      wsOpts.pongInterval
    );
    this.eventManager = eventManager;
    this.orderBook_service = orderBook_service;
    this.connection = connection;
  }

  public async destroyAsync(): Promise<void> {
    clearInterval(this._pongIntervalId);
    for (const ws of this._server.clients) {
      ws.terminate();
    }
    this._requestIdToSocket.clear();
    this._requestIdToSubscriptionOpts.clear();
    this._server.close();
  }

  public start() {
    this.eventManager.on(EventType.Order, (sraOrder: SRAOrder) => {
      this.orderUpdate(
        [sraOrder],
        this._requestIdToSubscriptionOpts,
        this._requestIdToSocket
      );
    });
    this.eventManager.on(
      EventType.OrderBook,
      (orderbook: OrderbookWSResponse) => {
        this.orderbookUpdate(orderbook);
      }
    );

    this.eventManager.on(EventType.AccountState, (apiAccount: ApiAccount) => {
      this.accountStateUpdate(
        apiAccount,
        this._requestIdToSubscriptionOpts,
        this._requestIdToSocket
      );
    });

    this.eventManager.on(
      EventType.TradeRecord,
      (tradesHistory: TradeHistory) => {
        this.tradeRecordUpdate(
          [tradesHistory],
          this._requestIdToSubscriptionOpts,
          this._requestIdToSocket
        );
      }
    );
  }

  public orderbookUpdate(orderbook: OrderbookWSResponse) {
    // TODO
    logger.info(orderbook);
  }

  public tradeRecordUpdate(
    tradesHistory: TradeHistory[],
    requestIdToSubscriptionOpts: Map<
      string,
      OrderBookSubscriptionOptsWithChannel
    >,
    requestIdToSocket: Map<string, WrappedWebSocket>
  ) {
    const response: Partial<UpdateTradesHistoryChannelMessageWithChannel> = {
      type: OrdersChannelMessageTypes.Update,
      channel: MessageChannels.TradeHistory,
      payload: tradesHistory,
    };

    for (const trade of tradesHistory) {
      // Future optimisation is to invert this structure so the order isn't duplicated over many request
      // order->requestIds it is less likely to get multiple order updates and more likely
      // to have many subscribers and a single order
      const requestIdToTradesHistory: {
        [requestId: string]: Set<TradeHistory>;
      } = {};
      for (const [requestId, subscriptionOpts] of requestIdToSubscriptionOpts) {
        if (
          WebsocketService._matchesTradesHistoryChannelSubscription(
            trade,
            subscriptionOpts
          )
        ) {
          if (requestIdToTradesHistory[requestId]) {
            const tradesHistory = requestIdToTradesHistory[requestId];
            tradesHistory.add(trade);
          } else {
            const tradesHistory = new Set<TradeHistory>();
            tradesHistory.add(trade);
            requestIdToTradesHistory[requestId] = tradesHistory;
          }
        }
      }
      for (const [requestId, tradesHistory] of Object.entries(
        requestIdToTradesHistory
      )) {
        const ws = requestIdToSocket.get(requestId);
        if (ws) {
          ws.send(
            JSON.stringify({
              ...response,
              payload: Array.from(tradesHistory).map(item => ({
                ...item,
                price: item.price.value.toString(),
                amount: item.amount.toFixed(0),
                timestamp: item.timestamp.toFixed(0),
              })),
              requestId,
            })
          );
        }
      }
    }
  }

  public orderUpdate(
    apiOrders: SRAOrder[],
    requestIdToSubscriptionOpts: Map<
      string,
      OrderBookSubscriptionOptsWithChannel
    >,
    requestIdToSocket: Map<string, WrappedWebSocket>
  ): void {
    if (this._server.clients.size === 0) {
      return;
    }
    const response: Partial<UpdateOrdersChannelMessageWithChannel> = {
      type: OrdersChannelMessageTypes.Update,
      channel: MessageChannels.Orders,
      payload: apiOrders,
    };
    for (const order of apiOrders) {
      // Future optimisation is to invert this structure so the order isn't duplicated over many request
      // order->requestIds it is less likely to get multiple order updates and more likely
      // to have many subscribers and a single order
      const requestIdToOrders: { [requestId: string]: Set<SRAOrder> } = {};
      for (const [requestId, subscriptionOpts] of requestIdToSubscriptionOpts) {
        if (
          WebsocketService._matchesOrdersChannelSubscription(
            order.order,
            subscriptionOpts
          )
        ) {
          if (requestIdToOrders[requestId]) {
            const orderSet = requestIdToOrders[requestId];
            orderSet.add(order);
          } else {
            const orderSet = new Set<SRAOrder>();
            orderSet.add(order);
            requestIdToOrders[requestId] = orderSet;
          }
        }
      }
      for (const [requestId, orders] of Object.entries(requestIdToOrders)) {
        const ws = requestIdToSocket.get(requestId);
        if (ws) {
          ws.send(
            JSON.stringify({
              ...response,
              payload: Array.from(orders),
              requestId,
            })
          );
        }
      }
    }
  }
  public accountStateUpdate(
    apiAccount: ApiAccount,
    requestIdToSubscriptionOpts: Map<
      string,
      OrderBookSubscriptionOptsWithChannel
    >,
    requestIdToSocket: Map<string, WrappedWebSocket>
  ): void {
    if (this._server.clients.size === 0) {
      return;
    }

    const response: Partial<UpdateAccountBalanceChannelMessageWithChannel> = {
      type: OrdersChannelMessageTypes.Update,
      channel: MessageChannels.AccountState,
      payload: apiAccount,
    };
    // Future optimisation is to invert this structure so the order isn't duplicated over many request
    // order->requestIds it is less likely to get multiple order updates and more likely
    // to have many subscribers and a single order
    for (const [requestId, subscriptionOpts] of requestIdToSubscriptionOpts) {
      if (
        WebsocketService._matchesAccountStateChannelSubscription(
          apiAccount,
          subscriptionOpts
        )
      ) {
        const ws = requestIdToSocket.get(requestId);
        if (ws) {
          ws.send(
            JSON.stringify({
              ...response,
              requestId,
            })
          );
        }
      }
    }
  }

  private _processConnection(
    ws: WrappedWebSocket,
    _req: http.IncomingMessage
  ): void {
    ws.on('pong', this._pongHandler(ws).bind(this));
    ws.on(
      WebsocketConnectionEventType.Message,
      this._messageHandler(ws).bind(this)
    );
    ws.on(
      WebsocketConnectionEventType.Close,
      this._closeHandler(ws).bind(this)
    );
    ws.isAlive = true;
    ws.requestIds = new Set<string>();
  }

  public async makeInitialResponse(
    requestId: string,
    subscriptionOpts: OrderBookSubscriptionOptsWithChannel,
    ws: WrappedWebSocket
  ) {
    if (subscriptionOpts.channel === MessageChannels.Orders) {
      const page = 1;
      const perPage = 10;

      const paginatedApiOrders = await this.orderBook_service.getOrdersAsync(
        page,
        perPage,
        {},
        {}
      );

      paginatedApiOrders.records
        .filter(record => record.metaData.filledAmount.lt(record.order.amount))
        .forEach(record =>
          this.orderUpdate(
            [record],
            new Map([[requestId, subscriptionOpts]]),
            new Map([[requestId, ws]])
          )
        );
    }

    if (subscriptionOpts.channel === MessageChannels.TradeHistory) {
      const page = 1;
      const perPage = 10;
      const paginatedTradesHistory =
        await this.orderBook_service.getTradesHistoryAsync(page, perPage);
      paginatedTradesHistory.records.forEach(record =>
        this.tradeRecordUpdate(
          [record],
          new Map([[requestId, subscriptionOpts]]),
          new Map([[requestId, ws]])
        )
      );
    }
  }

  private _processMessage(ws: WrappedWebSocket, data: WebSocket.Data): void {
    let message: OrderBookRequest;
    try {
      message = JSON.parse(data.toString());
    } catch (e) {
      throw new MalformedJSONError();
    }
    logger.info(message);

    const { requestId, payload, type, channel } = message;
    switch (type) {
      case MessageTypes.Subscribe: {
        ws.requestIds.add(requestId);
        const subscriptionOpts = { ...payload, channel };
        this._requestIdToSubscriptionOpts.set(requestId, subscriptionOpts);
        this._requestIdToSocket.set(requestId, ws);
        // add initial response
        this.makeInitialResponse(requestId, subscriptionOpts, ws);
        break;
      }
      default:
        throw new NotImplementedError(message.type);
    }
  }

  private _cleanupConnections(): void {
    // Ping every connection and if it is unresponsive
    // terminate it during the next check
    for (const ws of this._server.clients) {
      if (!(ws as WrappedWebSocket).isAlive) {
        ws.terminate();
      } else {
        (ws as WrappedWebSocket).isAlive = false;
        ws.ping();
      }
    }
  }
  private _messageHandler(
    ws: WrappedWebSocket
  ): (data: WebSocket.Data) => void {
    return (data: WebSocket.Data) => {
      try {
        this._processMessage(ws, data);
      } catch (err) {
        this._processError(ws, err);
      }
    };
  }

  private _processError(ws: WrappedWebSocket, err: Error): void {
    // const { errorBody } = errorUtils.generateError(err);
    ws.send(JSON.stringify(err.message));
    ws.terminate();
  }

  private _pongHandler(ws: WrappedWebSocket): () => void {
    return () => {
      ws.isAlive = true;
    };
  }

  private _closeHandler(ws: WrappedWebSocket): () => void {
    return () => {
      for (const requestId of ws.requestIds) {
        this._requestIdToSocket.delete(requestId);
        this._requestIdToSubscriptionOpts.delete(requestId);
      }
    };
  }
}
