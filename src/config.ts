import { ChainId, HttpServiceConfig } from './types';
import { ethers } from 'ethers';
import * as _ from 'lodash';
import { BigNumber } from 'bignumber.js';
import * as validateUUID from 'uuid-validate';
import {
  HEALTHCHECK_PATH,
  ORDERBOOK_PATH,
  DEFAULT_LOCAL_POSTGRES_URI,
  DEFAULT_LOCAL_REDIS_URI,
  DEFAULT_LOGGER_INCLUDE_TIMESTAMP,
  NULL_ADDRESS,
} from './constants';

import * as dotenv from 'dotenv';
dotenv.config();

enum EnvVarType {
  AddressList,
  StringList,
  Integer,
  Port,
  KeepAliveTimeout,
  ChainId,
  ETHAddressHex,
  UnitAmount,
  Url,
  UrlList,
  WhitelistAllTokens,
  Boolean,
  NonEmptyString,
  APIKeys,
  PrivateKeys,
  RfqMakerAssetOfferings,
  RateLimitConfig,
  LiquidityProviderRegistry,
  JsonStringList,
}

// Network port to listen on
export const HTTP_PORT = _.isEmpty(process.env.HTTP_PORT)
  ? 3000
  : assertEnvVarType('HTTP_PORT', process.env.HTTP_PORT, EnvVarType.Port);

export const HTTP_IP = _.isEmpty(process.env.HTTP_IP)
  ? '127.0.0.1'
  : assertEnvVarType('HTTP_IP', process.env.HTTP_IP, EnvVarType.Url);

// Ignore orders greater than x seconds when responding to SRA requests
export const SRA_ORDER_EXPIRATION_BUFFER_SECONDS: number = _.isEmpty(
  process.env.SRA_ORDER_EXPIRATION_BUFFER_SECONDS
)
  ? 10
  : assertEnvVarType(
      'SRA_ORDER_EXPIRATION_BUFFER_SECONDS',
      process.env.SRA_ORDER_EXPIRATION_BUFFER_SECONDS,
      EnvVarType.KeepAliveTimeout
    );

// Ethereum RPC Url list
export const ETHEREUM_RPC_URL = assertEnvVarType(
  'ETHEREUM_RPC_URL',
  process.env.ETHEREUM_RPC_URL,
  EnvVarType.Url
);

// Some private keys and their account addresses
export const OPERATOR_PRIVATE_KEY = assertEnvVarType(
  'OPERATOR_PRIVATE_KEY',
  process.env.OPERATOR_PRIVATE_KEY,
  EnvVarType.NonEmptyString
);
export const DELEVERAGING_PRIVATE_KEY = assertEnvVarType(
  'DELEVERAGING_PRIVATE_KEY',
  process.env.DELEVERAGING_PRIVATE_KEY,
  EnvVarType.NonEmptyString
);
export const DEPLOYER_PRIVATE_KEY = assertEnvVarType(
  'DEPLOYER_PRIVATE_KEY',
  process.env.DEPLOYER_PRIVATE_KEY,
  EnvVarType.NonEmptyString
);

export const OPERATOR_ACCOUNT =
  ethers.utils.computeAddress(OPERATOR_PRIVATE_KEY);
export const DEPLOYER_ACCOUNT =
  ethers.utils.computeAddress(DEPLOYER_PRIVATE_KEY);
export const DELEVERAGING_ACCOUNT = ethers.utils.computeAddress(
  DELEVERAGING_PRIVATE_KEY
);

// The fee recipient for orders
export const FEE_RECIPIENT_ADDRESS = _.isEmpty(
  process.env.FEE_RECIPIENT_ADDRESS
)
  ? NULL_ADDRESS
  : assertEnvVarType(
      'FEE_RECIPIENT_ADDRESS',
      process.env.FEE_RECIPIENT_ADDRESS,
      EnvVarType.ETHAddressHex
    );

// the operator for order settlement on chain
// export const OPERATOR_ACCOUNT = _.isEmpty(process.env.OPERATOR_ACCOUNT)
// ? NULL_ADDRESS
// : assertEnvVarType(
// 'OPERATOR_ACCOUNT',
// process.env.OPERATOR_ACCOUNT,
// EnvVarType.ETHAddressHex
// );

export const HEALTHCHECK_HTTP_PORT = _.isEmpty(
  process.env.HEALTHCHECK_HTTP_PORT
)
  ? HTTP_PORT
  : assertEnvVarType(
      'HEALTHCHECK_HTTP_PORT',
      process.env.HEALTHCHECK_HTTP_PORT,
      EnvVarType.Port
    );

// Number of milliseconds of inactivity the servers waits for additional
// incoming data aftere it finished writing last response before a socket will
// be destroyed.
// Ref: https://nodejs.org/api/http.html#http_server_keepalivetimeout
export const HTTP_KEEP_ALIVE_TIMEOUT = _.isEmpty(
  process.env.HTTP_KEEP_ALIVE_TIMEOUT
)
  ? 76 * 1000
  : assertEnvVarType(
      'HTTP_KEEP_ALIVE_TIMEOUT',
      process.env.HTTP_KEEP_ALIVE_TIMEOUT,
      EnvVarType.KeepAliveTimeout
    );

// Limit the amount of time the parser will wait to receive the complete HTTP headers.
// NOTE: This value HAS to be higher than HTTP_KEEP_ALIVE_TIMEOUT.
// Ref: https://nodejs.org/api/http.html#http_server_headerstimeout
export const HTTP_HEADERS_TIMEOUT = _.isEmpty(process.env.HTTP_HEADERS_TIMEOUT)
  ? 77 * 1000
  : assertEnvVarType(
      'HTTP_HEADERS_TIMEOUT',
      process.env.HTTP_HEADERS_TIMEOUT,
      EnvVarType.KeepAliveTimeout
    );

// Log level for pino.js
export const LOG_LEVEL: string = _.isEmpty(process.env.LOG_LEVEL)
  ? 'info'
  : assertEnvVarType(
      'LOG_LEVEL',
      process.env.LOG_LEVEL,
      EnvVarType.NonEmptyString
    );

// The path for the Websocket order-watcher updates
export const WEBSOCKET_ORDER_UPDATES_PATH = _.isEmpty(
  process.env.WEBSOCKET_ORDER_UPDATES_PATH
)
  ? ORDERBOOK_PATH
  : assertEnvVarType(
      'WEBSOCKET_ORDER_UPDATES_PATH',
      process.env.WEBSOCKET_ORDER_UPDATES_PATH,
      EnvVarType.NonEmptyString
    );

export const POSTGRES_URI = _.isEmpty(process.env.POSTGRES_URI)
  ? DEFAULT_LOCAL_POSTGRES_URI
  : assertEnvVarType('POSTGRES_URI', process.env.POSTGRES_URI, EnvVarType.Url);

export const POSTGRES_READ_REPLICA_URIS: string[] | undefined = _.isEmpty(
  process.env.POSTGRES_READ_REPLICA_URIS
)
  ? undefined
  : assertEnvVarType(
      'POSTGRES_READ_REPLICA_URIS',
      process.env.POSTGRES_READ_REPLICA_URIS,
      EnvVarType.UrlList
    );

export const REDIS_URI = _.isEmpty(process.env.REDIS_URI)
  ? DEFAULT_LOCAL_REDIS_URI
  : process.env.REDIS_URI;

// Should the logger include time field in the output logs, defaults to true.
export const LOGGER_INCLUDE_TIMESTAMP = _.isEmpty(
  process.env.LOGGER_INCLUDE_TIMESTAMP
)
  ? DEFAULT_LOGGER_INCLUDE_TIMESTAMP
  : assertEnvVarType(
      'LOGGER_INCLUDE_TIMESTAMP',
      process.env.LOGGER_INCLUDE_TIMESTAMP,
      EnvVarType.Boolean
    );

// Default chain id to use when not specified
export const CHAIN_ID: ChainId = _.isEmpty(process.env.CHAIN_ID)
  ? ChainId.Mainnet
  : assertEnvVarType('CHAIN_ID', process.env.CHAIN_ID, EnvVarType.ChainId);

export const defaultHttpServiceConfig: HttpServiceConfig = {
  httpPort: HTTP_PORT,
  httpIP: HTTP_IP,
  healthcheckHttpPort: HEALTHCHECK_HTTP_PORT,
  healthcheckPath: HEALTHCHECK_PATH,
  ethereumRpcUrl: ETHEREUM_RPC_URL,
  httpKeepAliveTimeout: HTTP_KEEP_ALIVE_TIMEOUT,
  httpHeadersTimeout: HTTP_HEADERS_TIMEOUT,
  chainId: CHAIN_ID,
};

// Max number of entities per page
export const MAX_PER_PAGE = 1000;

function assertEnvVarType(
  name: string,
  value: any,
  expectedType: EnvVarType
): any {
  let returnValue;
  switch (expectedType) {
    case EnvVarType.Port: {
      returnValue = parseInt(value, 10);
      const isWithinRange = returnValue >= 0 && returnValue <= 65535;
      if (isNaN(returnValue) || !isWithinRange) {
        throw new Error(`${name} must be between 0 to 65535, found ${value}.`);
      }
      return returnValue;
    }
    case EnvVarType.ChainId:
    case EnvVarType.KeepAliveTimeout:
    case EnvVarType.Integer: {
      returnValue = parseInt(value, 10);
      if (isNaN(returnValue)) {
        throw new Error(`${name} must be a valid integer, found ${value}.`);
      }
      return returnValue;
    }
    case EnvVarType.ETHAddressHex:
      ethers.utils.isAddress(value);
      return value;
    case EnvVarType.Url:
      // assert.isUri(name, value);
      return value;
    case EnvVarType.UrlList: {
      // assert.isString(name, value);
      const urlList = (value as string).split(',');
      // urlList.forEach((url, i) => assert.isUri(`${name}[${i}]`, url));
      return urlList;
    }
    case EnvVarType.Boolean:
      return value === 'true';
    case EnvVarType.UnitAmount: {
      returnValue = new BigNumber(parseFloat(value));
      if (returnValue.isNaN() || returnValue.isNegative()) {
        throw new Error(`${name} must be valid number greater than 0.`);
      }
      return returnValue;
    }
    case EnvVarType.AddressList: {
      // assert.isString(name, value);
      const addressList = (value as string)
        .split(',')
        .map(a => a.toLowerCase());
      addressList.forEach((a, i) => ethers.utils.isAddress(a));
      return addressList;
    }
    case EnvVarType.StringList: {
      // assert.isString(name, value);
      const stringList = (value as string).split(',');
      return stringList;
    }
    case EnvVarType.WhitelistAllTokens:
      return '*';
    case EnvVarType.NonEmptyString: {
      // assert.isString(name, value);
      if (value === '') {
        throw new Error(`${name} must be supplied`);
      }
      return value;
    }
    // case EnvVarType.RateLimitConfig:
    // assert.isString(name, value);
    // return parseUtils.parseJsonStringForMetaTransactionRateLimitConfigOrThrow(value);
    case EnvVarType.APIKeys: {
      // assert.isString(name, value);
      const apiKeys = (value as string).split(',');
      apiKeys.forEach(apiKey => {
        const isValidUUID = validateUUID(apiKey);
        if (!isValidUUID) {
          throw new Error(`API Key ${apiKey} isn't UUID compliant`);
        }
      });
      return apiKeys;
    }
    case EnvVarType.JsonStringList:
      // assert.isString(name, value);
      return JSON.parse(value);
    default:
      throw new Error(
        `Unrecognised EnvVarType: ${expectedType} encountered for variable ${name}.`
      );
  }
}
