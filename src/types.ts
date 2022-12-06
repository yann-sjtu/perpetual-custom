import { BigNumber as EtherBigNumber, ethers } from 'ethers';
import BigNumber from 'bignumber.js';

export type address = string;
export type BigNumberable = BigNumber | number | string;

export const BASE_DECIMALS = 18;

export interface SignedIntStruct {
  value: string;
  isPositive: boolean;
}

export interface BalanceStruct {
  marginIsPositive: boolean;
  positionIsPositive: boolean;
  margin: string;
  position: string;
}

export interface Index {
  timestamp: BigNumber;
  baseValue: BaseValue;
}
export interface FundingRateBounds {
  maxAbsValue: FundingRate;
  maxAbsDiffPerSecond: FundingRate;
}

export interface FundingRateStruct {
  timestamp: BigNumber;
  isPositive: boolean;
  value: BigNumber;
}

export class BaseValue {
  readonly value: BigNumber;

  constructor(value: BigNumberable) {
    this.value = new BigNumber(value);
  }

  public toSolidity(): string {
    return this.value.abs().shiftedBy(BASE_DECIMALS).toFixed(0);
  }

  static fromSolidity(
    solidityValue: BigNumberable,
    isPositive = true
  ): BaseValue {
    // Help to detect errors in the parsing and typing of Solidity data.
    if (typeof isPositive !== 'boolean') {
      throw new Error(
        'Error in BaseValue.fromSolidity: isPositive was not a boolean'
      );
    }

    let value = new BigNumber(solidityValue).shiftedBy(-BASE_DECIMALS);
    if (!isPositive) {
      value = value.negated();
    }
    return new BaseValue(value);
  }

  public toSoliditySignedInt(): SignedIntStruct {
    return {
      value: this.toSolidity(),
      isPositive: this.isPositive(),
    };
  }

  public div(value: BigNumberable): BaseValue {
    return new BaseValue(this.value.div(value));
  }

  /**
   * Return the BaseValue, rounded down to the nearest Solidity-representable value.
   */
  public roundedDown(): BaseValue {
    return new BaseValue(
      this.value.decimalPlaces(BASE_DECIMALS, BigNumber.ROUND_DOWN)
    );
  }

  public plus(value: BigNumberable): BaseValue {
    return new BaseValue(this.value.plus(value));
  }

  public minus(value: BigNumberable): BaseValue {
    return new BaseValue(this.value.minus(value));
  }

  public abs(): BaseValue {
    return new BaseValue(this.value.abs());
  }

  public negated(): BaseValue {
    return new BaseValue(this.value.negated());
  }

  public isPositive(): boolean {
    return this.value.isPositive();
  }

  public times(value: BigNumberable): BaseValue {
    return new BaseValue(this.value.times(value));
  }

  public isNegative(): boolean {
    return this.value.isNegative();
  }
}

export class Price extends BaseValue {}

export class Fee extends BaseValue {
  static fromBips(value: BigNumberable): Fee {
    return new Fee(new BigNumber('1e-4').times(value));
  }
}

export class FundingRate extends BaseValue {
  /**
   * Given a daily rate, returns funding rate represented as a per-second rate.
   *
   * Note: Funding interest does not compound, as the interest affects margin balances but
   * is calculated based on position balances.
   */
  static fromEightHourRate(rate: BigNumberable): FundingRate {
    return new FundingRate(new BigNumber(rate).div(8 * 60 * 60));
  }
}

export enum OrderStatus {
  Null = 0,
  Approved = 1,
  Canceled = 2,
}

export interface OrderState {
  status: OrderStatus;
  filledAmount: BigNumber;
}

export interface Order {
  isBuy: boolean;
  isDecreaseOnly: boolean;
  amount: BigNumber;
  limitPrice: Price;
  triggerPrice: Price;
  limitFee: Fee;
  maker: address;
  taker: address;
  expiration: BigNumber;
  salt: BigNumber;
}

export interface SignedOrder extends Order {
  typedSignature: string;
}

export enum SigningMethod {
  Compatibility = 'Compatibility', // picks intelligently between UnsafeHash and Hash
  UnsafeHash = 'UnsafeHash', // raw hash signed
  Hash = 'Hash', // hash prepended according to EIP-191
  TypedData = 'TypedData', // order hashed according to EIP-712
  MetaMask = 'MetaMask', // order hashed according to EIP-712 (MetaMask-only)
  MetaMaskLatest = 'MetaMaskLatest', // ... according to latest version of EIP-712 (MetaMask-only)
  CoinbaseWallet = 'CoinbaseWallet', // ... according to latest version of EIP-712 (CoinbaseWallet)
}

export enum ApiOrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELED = 'CANCELED',
  UNTRIGGERED = 'UNTRIGGERED',
}

export enum ApiOrderType {
  PERPETUAL_CROSS = 'PERPETUAL_CROSS',
  PERPETUAL_STOP_LIMIT = 'PERPETUAL_STOP_LIMIT',
}

export enum ApiMarketName {
  PBTC_USDC = 'PBTC-USDC',
  WETH_PUSD = 'WETH-PUSD',
  PLINK_USDC = 'PLINK-USDC',
}

export enum ApiSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export interface ApiBalance {
  margin: string;
  position: string;
  indexValue: string;
  indexTimestamp: string;
  // pendingMargin: string;
  // pendingPosition: string;
}

export interface ApiMarketMessage {
  createdAt: string;
  updatedAt: string;
  market: ApiMarketName;
  oraclePrice: string;
  fundingRate: string;
  globalIndexValue: string;
  globalIndexTimeStamp: string;
}

export interface ApiAccount {
  owner: string;
  balances: {
    [market: string]: ApiBalance;
  };
}

export enum ApiOrderCancelReason {
  EXPIRED = 'EXPIRED',
  UNDERCOLLATERALIZED = 'UNDERCOLLATERALIZED',
  CANCELED_ON_CHAIN = 'CANCELED_ON_CHAIN',
  USER_CANCELED = 'USER_CANCELED',
  SELF_TRADE = 'SELF_TRADE',
  FAILED = 'FAILED',
  COULD_NOT_FILL = 'COULD_NOT_FILL',
  POST_ONLY_WOULD_CROSS = 'POST_ONLY_WOULD_CROSS',
}

export interface ApiOrder {
  // uuid: string;
  // id: string;
  // status: ApiOrderStatus;
  // accountOwner: string;
  // accountNumber: string;
  // orderType: ApiOrderType;
  // fillOrKill: boolean;
  // market: ApiMarketName;
  // side: ApiSide;
  // baseAmount: string;
  // quoteAmount: string;
  // filledAmount: string;
  // price: string;
  // cancelReason: ApiOrderCancelReason;
  isBuy: boolean;
  isDecreaseOnly: boolean;
  amount: string;
  limitPrice: string;
  triggerPrice: string;
  limitFee: string;
  maker: string;
  taker: string;
  expiration: string;
  salt: string;
}

// ============ Funding API ============

export interface ApiFundingRate {
  market: ApiMarketName;
  effectiveAt: string;
  fundingRate: string;
  fundingRate8Hr: string;
  averagePremiumComponent: string;
  averagePremiumComponent8Hr: string;
}

// Per-market response from /funding-rates
export interface ApiFundingRates {
  current: ApiFundingRate;
  predicted: ApiFundingRate | null;
}

// Per-market response from /historical-funding-rates
export interface ApiHistoricalFundingRates {
  history: ApiFundingRate[];
}

// Per-market response from /index-price
export interface ApiIndexPrice {
  price: string;
}

export interface ApiOptions {
  endpoint?: string;
  timeout?: number;
}
// ============ Initialization Options ============

export interface PerpetualOptions {
  defaultAccount?: address;
  apiOptions?: ApiOptions;
  addressBook?: Record<string, string>;
}

export enum SIGNATURE_TYPES {
  NO_PREPEND = 0,
  DECIMAL = 1,
  HEXADECIMAL = 2,
}

export enum ChainId {
  Mainnet = 1,
  Ropsten = 3,
  Rinkeby = 4,
  Kovan = 42,
  Ganache = 1337,
  BSC = 56,
  Polygon = 137,
  PolygonMumbai = 80001,
  Avalanche = 43114,
  Fantom = 250,
  Celo = 42220,
}

export interface TradeArg {
  makerIndex: number;
  takerIndex: number;
  trader: address;
  data: string;
}

export interface SendOptions {
  from: address;
}

export interface OrderbookRequest {
  baseToken: string;
  quoteToken: string;
}

export interface SRAOrderMetaData {
  orderHash: string;
  filledAmount: BigNumber;
  createdAt?: string;
  state: OrderStatus;
}

export interface SRAOrder {
  order: SignedOrder;
  metaData: SRAOrderMetaData;
}

export interface PaginatedCollection<T> {
  total: number;
  page: number;
  perPage: number;
  records: T[];
}

export type OrdersResponse = PaginatedCollection<SRAOrder>;

export interface OrderbookResponse {
  bids: PaginatedCollection<SRAOrder>;
  asks: PaginatedCollection<SRAOrder>;
}
export interface OrderbookWSResponse {
  bids: SRAOrder[];
  asks: SRAOrder[];
}

export type SupportedProvider = ethers.providers.JsonRpcProvider;

export interface BaseHttpServiceConfig {
  httpPort: number;
  httpIP: string;
  healthcheckHttpPort: number;
  healthcheckPath: string;
  httpKeepAliveTimeout: number;
  httpHeadersTimeout: number;
}

export interface HttpServiceConfig extends BaseHttpServiceConfig {
  ethereumRpcUrl: string;
  chainId: ChainId;
}

export interface ContractAddresses {
  p1order: address;
  perpetualProxy: address;
}

export interface WebsocketSRAOpts {
  pongInterval: number;
  path: string;
}

export interface TradeHistory {
  hash: string;
  taker: address;
  maker: address;
  price: Price;
  amount: BigNumber;
  timestamp: BigNumber;
  blockNumber: number;
}

////////////////////
// websocket
export interface OrderBookSubscriptionOpts {
  makerToken?: address;
  takerToken?: address;
  taker?: address;
  maker?: address;
  trader?: address;
}

export interface OrderBookSubscriptionOptsWithChannel
  extends OrderBookSubscriptionOpts {
  channel: MessageChannels;
}

export interface OrderBookRequest {
  type: string;
  channel: MessageChannels;
  requestId: string;
  payload: OrderBookSubscriptionOpts;
}

export enum MessageTypes {
  Subscribe = 'subscribe',
}

export enum MessageChannels {
  Orders = 'orders',
  TradeHistory = 'trades',
  AccountState = 'accountState',
}
export interface UpdateOrdersChannelMessageWithChannel
  extends UpdateOrdersChannelMessage {
  channel: MessageChannels;
}

export interface UpdateTradesHistoryChannelMessageWithChannel
  extends UpdateTradesHistoryChannelMessage {
  channel: MessageChannels;
}

export interface UpdateAccountBalanceChannelMessageWithChannel
  extends UpdateAccountBalanceChannelMessage {
  channel: MessageChannels;
}

export type OrdersChannelMessage =
  | UpdateOrdersChannelMessage
  | UnknownOrdersChannelMessage;

export enum OrdersChannelMessageTypes {
  Update = 'update',
  Unknown = 'unknown',
}

export interface UpdateOrdersChannelMessage {
  type: OrdersChannelMessageTypes.Update;
  requestId: string;
  payload: SRAOrder[];
}
export interface UnknownOrdersChannelMessage {
  type: OrdersChannelMessageTypes.Unknown;
  requestId: string;
  payload: undefined;
}

export interface UpdateTradesHistoryChannelMessage {
  type: OrdersChannelMessageTypes.Update;
  requestId: string;
  payload: TradeHistory[];
}

export interface UpdateAccountBalanceChannelMessage {
  type: OrdersChannelMessageTypes.Update;
  requestId: string;
  payload: ApiAccount;
}

export enum WebsocketConnectionEventType {
  Close = 'close',
  Error = 'error',
  Message = 'message',
}

export enum WebsocketClientEventType {
  Connect = 'connect',
  ConnectFailed = 'connectFailed',
}

export enum EventType {
  // event of orderbook
  Order = 'Order',
  OrderBook = 'OrderBook',
  TradeRecord = 'TradeRecord',
  AccountState = 'AccountState',

  // event of account
  Deposit = 'Deposit',
  Withdraw = 'Withdraw',
}

export class Balance {
  public margin: BigNumber;
  public position: BigNumber;

  constructor(margin: BigNumberable, position: BigNumberable) {
    this.margin = new BigNumber(margin);
    this.position = new BigNumber(position);
  }

  static fromSolidity(struct: BalanceStruct): Balance {
    const marginBN = new BigNumber(struct.margin);
    const positionBN = new BigNumber(struct.position);
    return new Balance(
      struct.marginIsPositive ? marginBN : marginBN.negated(),
      struct.positionIsPositive ? positionBN : positionBN.negated()
    );
  }
}
