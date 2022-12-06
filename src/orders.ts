import { BigNumber } from 'bignumber.js';
import { WalletProvider } from './wallet_provider';
import {
  Fee,
  SigningMethod,
  Order,
  address,
  SIGNATURE_TYPES,
  SignedOrder,
  Price,
  OrderState,
} from './types';
import { ethers, Signer } from 'ethers';
import {
  getEIP712Hash,
  hashString,
  addressToBytes32,
  bnToBytes32,
  createTypedSignature,
  hashHasValidSignature,
  combineHexStrings,
} from './utils';
import { Contracts } from './contracts';

const EIP712_ORDER_STRUCT_STRING =
  'Order(' +
  'bytes32 flags,' +
  'uint256 amount,' +
  'uint256 limitPrice,' +
  'uint256 triggerPrice,' +
  'uint256 limitFee,' +
  'address maker,' +
  'address taker,' +
  'uint256 expiration' +
  ')';

export const EIP712_DOMAIN_STRING =
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';

const EIP712_ORDER_STRUCT = [
  { type: 'bytes32', name: 'flags' },
  { type: 'uint256', name: 'amount' },
  { type: 'uint256', name: 'limitPrice' },
  { type: 'uint256', name: 'triggerPrice' },
  { type: 'uint256', name: 'limitFee' },
  { type: 'address', name: 'maker' },
  { type: 'address', name: 'taker' },
  { type: 'uint256', name: 'expiration' },
];

const DEFAULT_EIP712_DOMAIN_NAME = 'P1Orders';
const EIP712_DOMAIN_VERSION = '1.0';

export const ORDER_FLAGS = {
  IS_BUY: 1,
  IS_DECREASE_ONLY: 2,
  IS_NEGATIVE_LIMIT_FEE: 4,
};

export class Orders {
  constructor(
    protected provider: WalletProvider,
    public contracts: Contracts
  ) {}

  get address(): address {
    return this.contracts.p1Orders.address;
  }

  public getFeeForOrder(amount: BigNumber, isTaker = true): Fee {
    if (!isTaker) {
      return Fee.fromBips('-2.5');
    }

    // PBTC-USDC: Small order size is 0.5 BTC.
    //
    // TODO: Address fees more generally on a per-market basis.
    const isSmall = amount.lt('0.5e8');
    return isSmall ? Fee.fromBips('50.0') : Fee.fromBips('15');
  }

  /**
   * Sends order to current provider for signing. Can sign locally if the signing account is
   * loaded into web3 and SigningMethod.Hash is used.
   */
  public async signOrder(
    order: Order,
    signingMethod: SigningMethod
  ): Promise<string> {
    switch (signingMethod) {
      case SigningMethod.Hash:
      case SigningMethod.UnsafeHash:
      case SigningMethod.Compatibility: {
        const orderHash = this.getOrderHash(order);
        const rawSignature = await this.provider
          .getSigner(order.maker)
          .signMessage(ethers.utils.arrayify(orderHash));
        const hashSig = createTypedSignature(
          rawSignature,
          SIGNATURE_TYPES.DECIMAL
        );
        if (signingMethod === SigningMethod.Hash) {
          return hashSig;
        }
        const unsafeHashSig = createTypedSignature(
          rawSignature,
          SIGNATURE_TYPES.NO_PREPEND
        );
        if (signingMethod === SigningMethod.UnsafeHash) {
          return unsafeHashSig;
        }
        if (hashHasValidSignature(orderHash, unsafeHashSig, order.maker)) {
          return unsafeHashSig;
        }
        return hashSig;
      }
      // case SigningMethod.TypedData:
      // case SigningMethod.MetaMask:
      // case SigningMethod.MetaMaskLatest:
      // case SigningMethod.CoinbaseWallet:
      // return this.ethSignTypedOrderInternal(
      // order,
      // signingMethod,
      // );

      default:
        throw new Error(`Invalid signing method ${signingMethod}`);
    }
  }

  public async getSignedOrder(
    order: Order,
    signingMethod: SigningMethod
  ): Promise<SignedOrder> {
    const typedSignature = await this.signOrder(order, signingMethod);
    return {
      ...order,
      typedSignature,
    };
  }

  /**
   * Returns the final signable EIP712 hash for approving an order.
   */
  public getOrderHash(order: Order): string {
    const structHash = ethers.utils.solidityKeccak256(
      [
        'bytes32',
        'bytes32',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bytes32',
        'bytes32',
        'uint256',
      ],
      [
        hashString(EIP712_ORDER_STRUCT_STRING),
        this.getOrderFlags(order),
        order.amount.toFixed(0),
        order.limitPrice.toSolidity(),
        order.triggerPrice.toSolidity(),
        order.limitFee.toSolidity(),
        addressToBytes32(order.maker),
        addressToBytes32(order.taker),
        order.expiration.toFixed(0),
      ]
    );
    return getEIP712Hash(this.getDomainHash(), structHash);
  }

  private getOrderFlags(order: Order): string {
    const booleanFlag =
      0 +
      (order.limitFee.isNegative() ? ORDER_FLAGS.IS_NEGATIVE_LIMIT_FEE : 0) +
      (order.isDecreaseOnly ? ORDER_FLAGS.IS_DECREASE_ONLY : 0) +
      (order.isBuy ? ORDER_FLAGS.IS_BUY : 0);
    const saltBytes = bnToBytes32(order.salt);
    return `0x${saltBytes.slice(-63)}${booleanFlag}`;
  }
  /**
   ** Returns the EIP712 domain separator hash.
   */
  public getDomainHash(): string {
    return ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32'],
      [
        hashString(EIP712_DOMAIN_STRING),
        hashString(DEFAULT_EIP712_DOMAIN_NAME),
        hashString(EIP712_DOMAIN_VERSION),
        `${this.contracts.networkId}`,
        addressToBytes32(this.address),
      ]
    );
  }

  public orderToBytes(order: Order): string {
    const solidityOrder = this.orderToSolidity(order);
    return ethers.utils.defaultAbiCoder.encode(
      EIP712_ORDER_STRUCT.map(arg => arg.type),
      EIP712_ORDER_STRUCT.map(arg => solidityOrder[arg.name])
    );
  }

  private orderToSolidity(order: Order): any {
    return {
      flags: this.getOrderFlags(order),
      amount: order.amount.toFixed(0),
      limitPrice: order.limitPrice.toSolidity(),
      triggerPrice: order.triggerPrice.toSolidity(),
      limitFee: order.limitFee.toSolidity(),
      maker: order.maker,
      taker: order.taker,
      expiration: order.expiration.toFixed(0),
    };
  }

  public fillToTradeData(
    order: SignedOrder,
    amount: BigNumber,
    price: Price,
    fee: Fee
  ): string {
    const orderData = this.orderToBytes(order);
    const signatureData = order.typedSignature + '0'.repeat(60);
    const fillData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256', 'uint256', 'bool'],
      [
        amount.toFixed(0),
        price.toSolidity(),
        fee.toSolidity(),
        fee.isNegative(),
      ]
    );
    return combineHexStrings(orderData, fillData, signatureData);
  }

  /**
   * Returns true if the order object has a non-null valid signature from the maker of the order.
   */
  public orderHasValidSignature(order: SignedOrder): boolean {
    return hashHasValidSignature(
      this.getOrderHash(order),
      order.typedSignature,
      order.maker
    );
  }

  /**
   * Gets the status and the current filled amount (in makerAmount) of all given orders.
   */
  public async getOrdersStatus(orders: Order[]): Promise<OrderState[]> {
    const orderHashes = orders.map(order => this.getOrderHash(order));
    const states = await this.contracts.p1Orders.getOrdersStatus(orderHashes);

    return states.map(state => {
      return {
        status: state.status,
        filledAmount: new BigNumber(state.filledAmount.toString()),
      };
    });
  }

  /**
   * Sends an transaction to pre-approve an order on-chain (so that no signature is required when
   * filling the order).
   */
  public async approveOrder(order: Order, signer: Signer): Promise<any> {
    const stringifiedOrder = this.orderToSolidity(order);
    return this.contracts.p1Orders
      .connect(signer)
      .approveOrder(stringifiedOrder);
  }

  /**
   * Sends an transaction to cancel an order on-chain.
   */
  public async cancelOrder(order: Order, signer: Signer): Promise<any> {
    const stringifiedOrder = this.orderToSolidity(order);
    return this.contracts.p1Orders
      .connect(signer)
      .cancelOrder(stringifiedOrder);
  }
}
