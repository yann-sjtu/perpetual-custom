import { Fee, FundingRate, Price } from './types';
import BigNumber from 'bignumber.js';

export const ORDERBOOK_PATH = '/orderbook/v1';
export const ACCOUNT_PATH = '/account/v1';
export const HEALTHCHECK_PATH = '/healthz';
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DEFAULT_LOCAL_POSTGRES_URI = 'postgres://api:api@localhost/api';
export const DEFAULT_LOCAL_REDIS_URI = 'redis://localhost';
export const DEFAULT_LOGGER_INCLUDE_TIMESTAMP = true;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 20;
export const ONE_SECOND_MS = 1000;
export const ONE_MINUTE_MS = ONE_SECOND_MS * 60;
export const TEN_MINUTES_MS = ONE_MINUTE_MS * 10;

const ONE_MINUTE_IN_SECONDS = new BigNumber(60);
const ONE_HOUR_IN_SECONDS = ONE_MINUTE_IN_SECONDS.times(60);
const ONE_DAY_IN_SECONDS = ONE_HOUR_IN_SECONDS.times(24);
const ONE_YEAR_IN_SECONDS = ONE_DAY_IN_SECONDS.times(365);

export const PRICES = {
  NONE: new Price(0),
  ONE: new Price(1),
};

export const FEES = {
  ZERO: new Fee(0),
  ONE_BIP: new Fee('1e-4'),
  ONE_PERCENT: new Fee('1e-2'),
};

export const INTEGERS = {
  ONE_MINUTE_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_DAY_IN_SECONDS,
  ONE_YEAR_IN_SECONDS,
  ZERO: new BigNumber(0),
  ONE: new BigNumber(1),
  ONES_255: new BigNumber(
    '115792089237316195423570985008687907853269984665640564039457584007913129639935'
  ), // 2**256-1
};

export const ADDRESSES = {
  ZERO: '0x0000000000000000000000000000000000000000',
  TEST: [
    '0x06012c8cf97bead5deae237070f9587f8e7a266d',
    '0x22012c8cf97bead5deae237070f9587f8e7a266d',
    '0x33012c8cf97bead5deae237070f9587f8e7a266d',
    '0x44012c8cf97bead5deae237070f9587f8e7a266d',
    '0x55012c8cf97bead5deae237070f9587f8e7a266d',
    '0x66012c8cf97bead5deae237070f9587f8e7a266d',
    '0x77012c8cf97bead5deae237070f9587f8e7a266d',
    '0x88012c8cf97bead5deae237070f9587f8e7a266d',
    '0x99012c8cf97bead5deae237070f9587f8e7a266d',
    '0xaa012c8cf97bead5deae237070f9587f8e7a266d',
  ],
};

// Rate limiting is based on a 45 minute period, equal to the funding rate update interval
// of one hour, with fifteen minutes as a buffer.
const FUNDING_LIMIT_PERIOD = INTEGERS.ONE_MINUTE_IN_SECONDS.times(45);

// Funding rate limits set by the smart contract.
export const FUNDING_RATE_MAX_ABS_VALUE =
  FundingRate.fromEightHourRate('0.0075').roundedDown();
export const FUNDING_RATE_MAX_ABS_DIFF_PER_SECOND =
  FUNDING_RATE_MAX_ABS_VALUE.times(2).div(FUNDING_LIMIT_PERIOD).roundedDown();
