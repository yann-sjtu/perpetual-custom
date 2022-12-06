import { BigNumber } from 'bignumber.js';
import {
  SignedOrder,
  BigNumberable,
  address,
  SIGNATURE_TYPES,
  SRAOrder,
  SRAOrderMetaData,
  Fee,
  Price,
} from './types';
import { SignedOrderEntity } from './entities';
import { logger } from './logger';
import { ethers, ContractTransaction } from 'ethers';
import { Context } from 'koa';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE, ONE_SECOND_MS } from './constants';
import { MAX_PER_PAGE, SRA_ORDER_EXPIRATION_BUFFER_SECONDS } from './config';

export const PREPEND_DEC = '\x19Ethereum Signed Message:\n32';

export const PREPEND_HEX = '\x19Ethereum Signed Message:\n\x20';

function generatePseudoRandom256BitNumber(): BigNumber {
  const MAX_DIGITS_IN_UNSIGNED_256_INT = 78;

  // BigNumber.random returns a pseudo-random number between 0 & 1 with a passed in number of
  // decimal places.
  // Source: https://mikemcl.github.io/bignumber.js/#random
  const randomNumber = BigNumber.random(MAX_DIGITS_IN_UNSIGNED_256_INT);
  const factor = new BigNumber(10).pow(MAX_DIGITS_IN_UNSIGNED_256_INT - 1);
  const randomNumberScaledTo256Bits = randomNumber.times(factor).integerValue();
  return randomNumberScaledTo256Bits;
}

function jsonifyPerpetualOrder(order: SignedOrder) {
  return {
    isBuy: order.isBuy,
    isDecreaseOnly: order.isDecreaseOnly,
    amount: order.amount.toFixed(0),
    limitPrice: order.limitPrice.value.toString(),
    triggerPrice: order.triggerPrice.value.toString(),
    limitFee: order.limitFee.value.toString(),
    maker: order.maker,
    taker: order.taker,
    expiration: order.expiration.toFixed(0),
    typedSignature: order.typedSignature,
    salt: order.salt.toFixed(0),
  };
}

function getRealExpiration(expiration: BigNumberable): BigNumber {
  return new BigNumber(expiration).eq(0)
    ? new BigNumber(0)
    : new BigNumber(Math.round(new Date().getTime() / 1000)).plus(
        new BigNumber(expiration)
      );
}

/**
 * Returns a signable EIP712 Hash of a struct, given the domain and struct hashes.
 */
export function getEIP712Hash(domainHash: string, structHash: string): string {
  return ethers.utils.solidityKeccak256(
    ['bytes2', 'bytes32', 'bytes32'],
    ['0x1901', domainHash, structHash]
  );
}

export function hashString(input: string) {
  return ethers.utils.solidityKeccak256(['string'], [input]);
}

export function boolToBytes32(b: boolean): string {
  return `0x${'0'.repeat(63)}${b ? '1' : 0}`;
}

export function stripHexPrefix(input: string) {
  if (input.startsWith('0x')) {
    return input.slice(2);
  }
  return input;
}

export function addressToBytes32(input: address): string {
  return `0x000000000000000000000000${stripHexPrefix(input)}`;
}

export function bnToBytes32(value: BigNumberable): string {
  const bn = new BigNumber(value);
  if (!bn.isInteger()) {
    throw new Error('bnToBytes32: value must be an integer');
  }
  return `0x${new BigNumber(bn).toString(16).padStart(64, '0')}`;
}

export function isValidSigType(sigType: number): boolean {
  switch (sigType) {
    case SIGNATURE_TYPES.NO_PREPEND:
    case SIGNATURE_TYPES.DECIMAL:
    case SIGNATURE_TYPES.HEXADECIMAL:
      return true;
    default:
      return false;
  }
}

export function createTypedSignature(
  signature: string,
  sigType: number
): string {
  if (!isValidSigType(sigType)) {
    throw new Error(`Invalid signature type: ${sigType}`);
  }
  return `${fixRawSignature(signature)}0${sigType}`;
}

export function combineHexStrings(...args: string[]): string {
  return `0x${args.map(stripHexPrefix).join('')}`;
}

export function signatureToVRS(signature: string): {
  v: string;
  r: string;
  s: string;
} {
  const stripped = stripHexPrefix(signature);

  if (stripped.length !== 130) {
    throw new Error(`Invalid raw signature: ${signature}`);
  }

  const r = stripped.substr(0, 64);
  const s = stripped.substr(64, 64);
  const v = stripped.substr(128, 2);

  return { v, r, s };
}

export function fixRawSignature(signature: string): string {
  const { v, r, s } = signatureToVRS(signature);
  // const { v, r, s } = ethers.utils.splitSignature(signature)

  let trueV: string;
  switch (v) {
    case '00':
      trueV = '1b';
      break;
    case '01':
      trueV = '1c';
      break;
    case '1b':
    case '1c':
      trueV = v;
      break;
    default:
      throw new Error(`Invalid v value: ${v}`);
  }
  return combineHexStrings(r, s, trueV);
}

export function getPrependedHash(
  hash: string,
  sigType: SIGNATURE_TYPES
): string {
  switch (sigType) {
    case SIGNATURE_TYPES.NO_PREPEND:
      return hash;
    case SIGNATURE_TYPES.DECIMAL:
      return ethers.utils.solidityKeccak256(
        ['string', 'bytes32'],
        [PREPEND_DEC, hash]
      );
    case SIGNATURE_TYPES.HEXADECIMAL:
      return ethers.utils.solidityKeccak256(
        ['string', 'bytes32'],
        [PREPEND_HEX, hash]
      );
    default:
      throw Error(`invalid sigType ${sigType}`);
  }
}

export function ecRecoverTypedSignature(
  hash: string,
  typedSignature: string
): address {
  if (stripHexPrefix(typedSignature).length !== 66 * 2) {
    return '0x'; // return invalid address instead of throwing error
  }

  const sigType = parseInt(typedSignature.slice(-2), 16);

  let prependedHash: string;
  try {
    prependedHash = getPrependedHash(hash, sigType);
  } catch (e) {
    return '0x'; // return invalid address instead of throwing error
  }

  const signature = typedSignature.slice(0, -2);

  return ethers.utils.recoverAddress(prependedHash, signature);
}

/**
 *    * Returns true if the hash has a non-null valid signature from a particular signer.
 *       */
export function hashHasValidSignature(
  hash: string,
  typedSignature: string,
  expectedSigner: address
): boolean {
  const signer = ecRecoverTypedSignature(hash, typedSignature);
  return addressesAreEqual(signer, expectedSigner);
}

export function addressesAreEqual(
  addressOne: string,
  addressTwo: string
): boolean {
  return (
    addressOne.length > 0 &&
    addressTwo.length > 0 &&
    stripHexPrefix(addressOne).toLowerCase() ===
      stripHexPrefix(addressTwo).toLowerCase()
  );
}

// get funding rate per second
export function calculateFundingrate(
  avg_ask_prices: BigNumber[],
  avg_bid_prices: BigNumber[],
  index_prices: BigNumber[]
) {
  const MINUTES_PER_HOUR = 60;
  const NUM_OF_DATAPOINTS = avg_ask_prices.length;
  const SECONDS_PER_HOUR = 3600;
  const HOURS_PER_EPOCH = 8;
  if (NUM_OF_DATAPOINTS !== MINUTES_PER_HOUR) {
    logger.warn(
      `num of data points is not enough to estimate fundingrate, at leaest 60 data points per hour`
    );
  }

  // if (avg_ask_prices.length != NUM_OF_DATAPOINTS) {
  // throw new Error(`num of data points in ask prices is not 60`);
  // }

  if (avg_bid_prices.length != NUM_OF_DATAPOINTS) {
    throw new Error(`num of data points in bid prices is not 60`);
  }

  if (index_prices.length != NUM_OF_DATAPOINTS) {
    throw new Error(`num of data points in index prices is not 60`);
  }

  const interestRate = 1.25e-5; // per hour
  const premiumLastHour = avg_ask_prices
    .map((avg_ask_price, i) =>
      BigNumber.max(0, avg_ask_price.minus(index_prices[i])).minus(
        BigNumber.max(0, index_prices[i].minus(avg_bid_prices[i]))
      )
    )
    .reduce((res, cur) => res.plus(cur), new BigNumber(0))
    .div(NUM_OF_DATAPOINTS);

  const fundingRatePerSec = premiumLastHour
    .div(HOURS_PER_EPOCH)
    .plus(interestRate)
    .div(SECONDS_PER_HOUR);
  return fundingRatePerSec;
}

/**
 * Checks top level attributes of an object for values matching an ETH address
 * and normalizes the address by turning it to lowercase
 */
export const objectETHAddressNormalizer = <T>(obj: T) => {
  const normalized: { [key: string]: any } = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && ethers.utils.isAddress(value as string)) {
      normalized[key] = (value as string).toLowerCase();
    }
  }

  return {
    ...obj,
    ...normalized,
  };
};

export const paginationUtils = {
  /**
   *  Paginates locally in memory from a larger collection
   * @param records The records to paginate
   * @param page The current page for these records
   * @param perPage The total number of records to return per page
   */
  paginate: <T>(records: T[], page: number, perPage: number) => {
    return paginationUtils.paginateSerialize(
      records.slice((page - 1) * perPage, page * perPage),
      records.length,
      page,
      perPage
    );
  },
  paginateDBFilters: (page: number, perPage: number) => {
    return {
      skip: (page - 1) * perPage,
      take: perPage,
    };
  },
  paginateSerialize: <T>(
    collection: T[],
    total: number,
    page: number,
    perPage: number
  ) => {
    const paginated = {
      total,
      page,
      perPage,
      records: collection,
    };
    return paginated;
  },

  parsePaginationConfig: (ctx: Context): { page: number; perPage: number } => {
    const page =
      ctx.query.page === undefined ? DEFAULT_PAGE : Number(ctx.query.page);
    const perPage =
      ctx.query.perPage === undefined
        ? DEFAULT_PER_PAGE
        : Number(ctx.query.perPage);
    if (perPage > MAX_PER_PAGE) {
      throw new Error(`perPage should be less or equal to ${MAX_PER_PAGE}`);
    }
    return { page, perPage };
  },
};

export const orderUtils = {
  deserializeOrder: (
    signedOrderEntity: Required<SignedOrderEntity>
  ): SignedOrder => {
    const signedOrder: SignedOrder = {
      typedSignature: signedOrderEntity.typedSignature,
      maker: signedOrderEntity.maker,
      taker: signedOrderEntity.taker,
      amount: new BigNumber(signedOrderEntity.amount),
      salt: new BigNumber(signedOrderEntity.salt),
      expiration: new BigNumber(signedOrderEntity.expiration),
      limitFee: new Fee(signedOrderEntity.limitFee),
      limitPrice: new Price(signedOrderEntity.limitPrice),
      triggerPrice: new Price(signedOrderEntity.triggerPrice),
      isBuy: signedOrderEntity.isBuy,
      isDecreaseOnly: signedOrderEntity.isDecreaseOnly,
    };
    return signedOrder;
  },

  isFreshOrder: (
    apiOrder: SRAOrder,
    expirationBufferSeconds: number = SRA_ORDER_EXPIRATION_BUFFER_SECONDS
  ): boolean => {
    const dateNowSeconds = Date.now() / ONE_SECOND_MS;
    return (
      apiOrder.order.expiration.toNumber() >
      dateNowSeconds + expirationBufferSeconds
    );
  },

  deserializeOrderToSRAOrder: (
    signedOrderEntity: Required<SignedOrderEntity>
  ): SRAOrder => {
    const order = orderUtils.deserializeOrder(signedOrderEntity);
    const state = signedOrderEntity.orderState;
    const createdAt = signedOrderEntity.createdAt;
    const metaData: SRAOrderMetaData = {
      orderHash: signedOrderEntity.hash,
      filledAmount: new BigNumber(signedOrderEntity.filledAmount),
      state,
      createdAt,
    };
    return {
      order,
      metaData,
    };
  },

  compareAskOrder: (orderA: SignedOrder, orderB: SignedOrder): number => {
    const orderAPrice = orderA.limitPrice.value;
    const orderBPrice = orderB.limitPrice.value;
    if (!orderAPrice.isEqualTo(orderBPrice)) {
      return orderAPrice.comparedTo(orderBPrice);
    }
    return 1;
  },
  compareBidOrder: (orderA: SignedOrder, orderB: SignedOrder): number => {
    const orderAPrice = orderA.limitPrice.value;
    const orderBPrice = orderB.limitPrice.value;
    if (!orderAPrice.isEqualTo(orderBPrice)) {
      return orderBPrice.comparedTo(orderAPrice);
    }
    return 1;
  },

  serializeOrder: (apiOrder: SRAOrder): SignedOrderEntity => {
    const jsonifiedSignedOrder = jsonifyPerpetualOrder(apiOrder.order);
    const signedOrderEntity = new SignedOrderEntity({
      ...jsonifiedSignedOrder,
      hash: apiOrder.metaData.orderHash,
      filledAmount: apiOrder.metaData.filledAmount.toString(),
      createdAt: apiOrder.metaData.createdAt,
      orderState: apiOrder.metaData.state,
    });
    return signedOrderEntity;
  },
};

export async function waitTx(promise: Promise<ContractTransaction>) {
  const tx = await promise;
  await tx.wait();
}

export {
  generatePseudoRandom256BitNumber,
  jsonifyPerpetualOrder,
  getRealExpiration,
};
