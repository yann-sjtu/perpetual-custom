import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { mintAndDeposit, getTestPerpetual } from './helpers';
import {
  Price,
  Order,
  Fee,
  SignedOrder,
  SigningMethod,
  OrderStatus,
  address,
} from '../src/types';
import { ADDRESSES, INTEGERS, PRICES } from '../src/constants';
import { BigNumber } from 'bignumber.js';
import { Orders } from '../src/orders';
import { Signer } from 'ethers';
import { boolToBytes32 } from '../src/utils';
import { TestChainlinkAggregator } from './modules/test_chainlinkAggregator';
import { TestPerpetual } from './modules/test_perpetual';

const orderAmount = new BigNumber('1e18');
const limitPrice = new Price('987.65432');
const defaultOrder: Order = {
  limitPrice,
  isBuy: true,
  isDecreaseOnly: false,
  amount: orderAmount,
  triggerPrice: PRICES.NONE,
  limitFee: Fee.fromBips(20),
  maker: ADDRESSES.ZERO,
  taker: ADDRESSES.ZERO,
  expiration: INTEGERS.ONE_YEAR_IN_SECONDS.times(100),
  salt: new BigNumber('425'),
};
const initialMargin = orderAmount.times(limitPrice.value).times(2);
const fullFlagOrder: Order = {
  ...defaultOrder,
  isDecreaseOnly: true,
  limitFee: new Fee(defaultOrder.limitFee.value.abs().negated()),
};

describe('P1Orders', () => {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const maker = signers[5];
    const taker = signers[1];

    defaultOrder.maker = fullFlagOrder.maker = maker.address;
    defaultOrder.taker = fullFlagOrder.taker = taker.address;
    const admin = signers[0];
    const otherUser = signers[8];

    const perpetual = await getTestPerpetual(ethers.provider);

    const defaultSignedOrder = await perpetual.orders.getSignedOrder(
      defaultOrder,
      SigningMethod.Hash
    );
    const fullFlagSignedOrder = await perpetual.orders.getSignedOrder(
      fullFlagOrder,
      SigningMethod.Hash
    );

    // Set up initial balances:
    await Promise.all([
      mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        initialMargin.toFixed(0),
        admin,
        maker
      ),
      mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        initialMargin.toFixed(0),
        admin,
        taker
      ),
      setOraclePrice(perpetual.testing.chainlinkAggregator, limitPrice, admin),
    ]);

    return {
      maker,
      taker,
      otherUser,
      admin,
      perpetual,
      defaultOrder,
      fullFlagOrder,
      defaultSignedOrder,
      fullFlagSignedOrder,
    };
  }

  describe('off-chain helpers', () => {
    it('Signs correctly for hash', async () => {
      await loadFixture(deployFixture);
      const { perpetual, defaultOrder } = await loadFixture(deployFixture);
      const typedSignature = await perpetual.orders.signOrder(
        defaultOrder,
        SigningMethod.Hash
      );
      const validSignature = perpetual.orders.orderHasValidSignature({
        ...defaultOrder,
        typedSignature,
      });
      expect(validSignature).to.be.true;
    });
  });

  describe('approveOrder()', () => {
    it('Succeeds', async () => {
      const { fullFlagOrder, perpetual, maker } = await loadFixture(
        deployFixture
      );
      await expect(perpetual.orders.approveOrder(fullFlagOrder, maker))
        .to.emit(perpetual.orders.contracts.p1Orders, 'LogOrderApproved')
        .withArgs(
          fullFlagOrder.maker,
          perpetual.orders.getOrderHash(fullFlagOrder)
        );
      await expectStatus(perpetual.orders, fullFlagOrder, OrderStatus.Approved);
    });

    it('Succeeds in double-approving order', async () => {
      const { fullFlagOrder, perpetual, maker } = await loadFixture(
        deployFixture
      );
      await perpetual.orders.approveOrder(fullFlagOrder, maker);
      await perpetual.orders.approveOrder(fullFlagOrder, maker);
      await expectStatus(perpetual.orders, fullFlagOrder, OrderStatus.Approved);
    });

    it('Fails if caller is not the maker', async () => {
      const { fullFlagOrder, perpetual, taker } = await loadFixture(
        deployFixture
      );
      await expect(
        perpetual.orders.approveOrder(fullFlagOrder, taker)
      ).to.be.revertedWith('Order cannot be approved by non-maker');
    });

    it('Fails to approve canceled order', async () => {
      const { fullFlagOrder, perpetual, maker } = await loadFixture(
        deployFixture
      );
      await perpetual.orders.cancelOrder(fullFlagOrder, maker);
      await expect(
        perpetual.orders.approveOrder(fullFlagOrder, maker)
      ).to.be.revertedWith('Canceled order cannot be approved');
    });
  });

  describe('cancelOrder()', () => {
    it('Succeeds', async () => {
      const { fullFlagOrder, perpetual, maker } = await loadFixture(
        deployFixture
      );
      await expect(perpetual.orders.cancelOrder(fullFlagOrder, maker))
        .to.emit(perpetual.orders.contracts.p1Orders, 'LogOrderCanceled')
        .withArgs(
          fullFlagOrder.maker,
          perpetual.orders.getOrderHash(fullFlagOrder)
        );
      await expectStatus(perpetual.orders, fullFlagOrder, OrderStatus.Canceled);
    });

    it('Succeeds in double-canceling order', async () => {
      const { fullFlagOrder, perpetual, maker } = await loadFixture(
        deployFixture
      );
      await perpetual.orders.cancelOrder(fullFlagOrder, maker);
      await perpetual.orders.cancelOrder(fullFlagOrder, maker);
      await expectStatus(perpetual.orders, fullFlagOrder, OrderStatus.Canceled);
    });

    it('Fails if caller is not the maker', async () => {
      const { fullFlagOrder, perpetual, taker } = await loadFixture(
        deployFixture
      );
      await expect(
        perpetual.orders.cancelOrder(fullFlagOrder, taker)
      ).to.be.revertedWith('Order cannot be canceled by non-maker');
    });

    it('Succeeds in canceling approved order', async () => {
      const { fullFlagOrder, perpetual, maker } = await loadFixture(
        deployFixture
      );
      await perpetual.orders.approveOrder(fullFlagOrder, maker);
      await perpetual.orders.cancelOrder(fullFlagOrder, maker);
      await expectStatus(perpetual.orders, fullFlagOrder, OrderStatus.Canceled);
    });
  });

  describe('trade()', () => {
    describe('basic success cases', () => {
      it('fills a bid at the limit price', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(perpetual);
      });

      it('fills an ask at the limit price', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(perpetual, { isBuy: false });
      });

      it('fills a bid below the limit price', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(perpetual, {}, { price: limitPrice.minus(25) });
      });

      it('fills an ask above the limit price', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(
          perpetual,
          { isBuy: false },
          { price: limitPrice.plus(25) }
        );
      });

      it('fills a bid with a fee less than the limit fee', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(
          perpetual,
          {},
          {
            fee: defaultOrder.limitFee.div(2),
            price: limitPrice.minus(25),
          }
        );
      });

      it('fills an ask with a fee less than the limit fee', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(
          perpetual,
          { isBuy: false },
          {
            fee: defaultOrder.limitFee.div(2),
            price: limitPrice.plus(25),
          }
        );
      });

      it('succeeds if sender is a local operator', async () => {
        const { perpetual, otherUser, taker } = await loadFixture(
          deployFixture
        );
        await perpetual.contracts.perpetualProxy
          .connect(taker)
          .setLocalOperator(otherUser.address, true);
        await fillOrder(perpetual, {}, { sender: otherUser.address });
      });

      it('succeeds if sender is a global operator', async () => {
        const { perpetual, otherUser, admin } = await loadFixture(
          deployFixture
        );
        await perpetual.contracts.perpetualProxy
          .connect(admin)
          .setGlobalOperator(otherUser.address, true);
        await fillOrder(perpetual, {}, { sender: otherUser.address });
      });

      it('succeeds with an invalid signature for an order approved on-chain', async () => {
        const { perpetual, maker, defaultSignedOrder } = await loadFixture(
          deployFixture
        );
        await perpetual.orders.approveOrder(defaultOrder, maker);
        const order = {
          ...defaultSignedOrder,
          typedSignature: `0xff${defaultSignedOrder.typedSignature.substr(4)}`,
        };
        await fillOrder(perpetual, order);
      });

      it('succeeds repeating an order (with a different salt)', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(perpetual);
        await fillOrder(perpetual, { salt: defaultOrder.salt.plus(1) });
      });
    });
    describe('basic failure cases', () => {
      it('fails for calls not from the perpetual contract', async () => {
        const { perpetual, admin } = await loadFixture(deployFixture);
        await expect(
          perpetual.contracts.p1Orders
            .connect(admin)
            .trade(
              admin.address,
              admin.address,
              admin.address,
              '0',
              '0x',
              boolToBytes32(false)
            )
        ).to.be.revertedWith('msg.sender must be PerpetualV1');
      });

      it('fails if sender is not the taker or an authorized operator', async () => {
        const { perpetual, otherUser, defaultSignedOrder } = await loadFixture(
          deployFixture
        );
        await expect(
          fillOrder(perpetual, defaultSignedOrder, {
            sender: otherUser.address,
          })
        ).to.be.revertedWith('Sender does not have permissions for the taker');
      });

      it('fails for bad signature', async () => {
        const { perpetual, defaultSignedOrder } = await loadFixture(
          deployFixture
        );
        const order = {
          ...defaultSignedOrder,
          typedSignature: `0xffff${defaultSignedOrder.typedSignature.substr(
            6
          )}`,
        };
        await expect(fillOrder(perpetual, order)).to.be.revertedWith(
          'Order has an invalid signature'
        );
      });

      it('fails for canceled order', async () => {
        const { perpetual, maker } = await loadFixture(deployFixture);
        await perpetual.orders.cancelOrder(defaultOrder, maker);
        await expect(fillOrder(perpetual)).to.be.revertedWith(
          'Order was already canceled'
        );
      });

      it('fails for wrong taker', async () => {
        const { perpetual, defaultSignedOrder, otherUser } = await loadFixture(
          deployFixture
        );
        const tradeData = perpetual.orders.fillToTradeData(
          defaultSignedOrder,
          orderAmount,
          limitPrice,
          defaultOrder.limitFee
        );
        await expect(
          perpetual.trade
            .initiate()
            .addTradeArg({
              maker: defaultOrder.maker,
              taker: otherUser.address,
              data: tradeData,
              trader: perpetual.orders.address,
            })
            .commit({ from: otherUser.address })
        ).to.be.revertedWith('Order taker does not match taker');
      });

      it('fails if the order has expired', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await expect(
          fillOrder(perpetual, { expiration: new BigNumber(1) })
        ).to.be.revertedWith('Order has expired');
      });

      it('fails to fill a bid at a price above the limit price', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await expect(
          fillOrder(perpetual, {}, { price: limitPrice.plus(1) })
        ).to.be.revertedWith('Fill price is invalid');
      });

      it('fails to fill an ask at a price below the limit price', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await expect(
          fillOrder(perpetual, { isBuy: false }, { price: limitPrice.minus(1) })
        ).to.be.revertedWith('Fill price is invalid');
      });
      it('fails if fee is greater than limit fee', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await expect(
          fillOrder(perpetual, {}, { fee: defaultOrder.limitFee.plus(1) }),
          'Fill fee is invalid'
        );
      });

      it('fails to overfill order', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await expect(
          fillOrder(perpetual, {}, { amount: orderAmount.plus(1) })
        ).to.be.revertedWith('Cannot overfill order');
      });

      it('fails to overfill partially filled order', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        const halfAmount = orderAmount.div(2);
        await fillOrder(perpetual, {}, { amount: halfAmount });
        await expect(
          fillOrder(perpetual, {}, { amount: halfAmount.plus(1) })
        ).to.be.revertedWith('Cannot overfill order');
      });

      it('fails for an order that was already filled', async () => {
        const { perpetual } = await loadFixture(deployFixture);
        await fillOrder(perpetual);
        await expect(fillOrder(perpetual)).to.be.revertedWith(
          'Cannot overfill order'
        );
      });
    });

    describe('with triggerPrice', () => {
      it('fills a bid with the oracle price at the trigger price', async () => {
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        // limit bid |
        //        -5 | fill price
        //       -10 | trigger price, oracle price
        const triggerPrice = limitPrice.minus(10);
        const fillPrice = limitPrice.minus(5);
        const oraclePrice = limitPrice.minus(10);
        await setOraclePrice(
          testContracts.testChainlinkAggregator,
          oraclePrice,
          admin
        );
        await fillOrder(perpetual, { triggerPrice }, { price: fillPrice });
      });

      it('fills an ask with the oracle price at the trigger price', async () => {
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        //       +10 | trigger price, oracle price
        //        +5 | fill price
        // limit ask |
        const triggerPrice = limitPrice.plus(10);
        const fillPrice = limitPrice.plus(5);
        const oraclePrice = limitPrice.plus(10);
        await setOraclePrice(
          testContracts.testChainlinkAggregator,
          oraclePrice,
          admin
        );
        await fillOrder(
          perpetual,
          { triggerPrice, isBuy: false },
          { price: fillPrice }
        );
      });
      it('fills a bid with the oracle price above the trigger price', async () => {
        //       +10 | oracle price
        //           |
        // limit bid |
        //        -5 | fill price
        //       -10 | trigger price
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const triggerPrice = limitPrice.minus(10);
        const fillPrice = limitPrice.minus(5);
        const oraclePrice = limitPrice.plus(10);
        await setOraclePrice(
          testContracts.testChainlinkAggregator,
          oraclePrice,
          admin
        );
        await fillOrder(perpetual, { triggerPrice }, { price: fillPrice });
      });

      it('fills an ask with the oracle price below the trigger price', async () => {
        //       +10 | trigger price, oracle price
        //        +5 | fill price
        // limit ask |
        //           |
        //       -10 | oracle price
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const triggerPrice = limitPrice.plus(10);
        const fillPrice = limitPrice.plus(5);
        const oraclePrice = limitPrice.minus(10);
        await setOraclePrice(
          testContracts.testChainlinkAggregator,
          oraclePrice,
          admin
        );
        await fillOrder(
          perpetual,
          { triggerPrice, isBuy: false },
          { price: fillPrice }
        );
      });

      it('fails to fill a bid if the oracle price is below the trigger price', async () => {
        // limit bid |
        //       -10 | trigger price
        //       -11 | oracle price
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const triggerPrice = limitPrice.minus(10);
        await setOraclePrice(
          testContracts.testChainlinkAggregator,
          triggerPrice.minus(1),
          admin
        );
        await expect(fillOrder(perpetual, { triggerPrice })).to.be.revertedWith(
          'Trigger price has not been reached'
        );
      });

      it('fails to fill an ask if the oracle price is above the trigger price', async () => {
        //       +11 | oracle price
        //       +10 | trigger price
        // limit ask |
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const triggerPrice = limitPrice.plus(10);
        await setOraclePrice(
          testContracts.testChainlinkAggregator,
          triggerPrice.plus(1),
          admin
        );
        await expect(
          fillOrder(perpetual, { triggerPrice, isBuy: false })
        ).to.be.revertedWith('Trigger price has not been reached');
      });
    });

    describe('in decrease-only mode', () => {
      it('fills a bid', async () => {
        // Give the maker a short position.
        const { perpetual, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const { limitFee, maker, taker } = defaultOrder;
        const fee = limitFee.times(limitPrice.value);
        const cost = limitPrice.value.plus(fee.value).times(orderAmount);
        // await sell(ctx, maker, taker, orderAmount, cost);

        // Fill the order to decrease the short position to zero.
        // await fillOrder(perpetual, { isDecreaseOnly: true });
      });

      it('fills an ask', async () => {
        // Give the maker a long position.
        const { perpetual, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const { limitFee, maker, taker } = defaultOrder;
        const fee = limitFee.times(limitPrice.value).negated();
        const cost = limitPrice.value.plus(fee.value).times(orderAmount);
        // await buy(ctx, maker, taker, orderAmount, cost);

        // Fill the order to decrease the long position to zero.
        // await fillOrder(perpetual, { isBuy: false, isDecreaseOnly: true });
      });
    });
    describe('with negative limit fee', () => {
      it('fills a bid', async () => {
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const negativeFee = new Fee(
          defaultOrder.limitFee.value.abs().negated()
        );
        await fillOrder(perpetual, { limitFee: negativeFee });
      });

      it('fills an ask', async () => {
        const { perpetual, maker, testContracts, admin } = await loadFixture(
          deployFixture
        );
        const negativeFee = new Fee(
          defaultOrder.limitFee.value.abs().negated()
        );
        await fillOrder(perpetual, { isBuy: false, limitFee: negativeFee });
      });

      it('fails if fee is greater than limit fee', async () => {
        const { perpetual, maker, fullFlagSignedOrder } = await loadFixture(
          deployFixture
        );
        await expect(
          fillOrder(perpetual, fullFlagSignedOrder, {
            fee: fullFlagOrder.limitFee.plus(1),
          })
        ).to.be.revertedWith('Fill fee is invalid');
      });
    });
  });

  // ============ Helper Functions ============

  async function getModifiedOrder(
    perpetual: TestPerpetual,
    args: Partial<Order>
  ): Promise<SignedOrder> {
    const newOrder: Order = {
      ...defaultOrder,
      ...args,
    };
    return perpetual.orders.getSignedOrder(newOrder, SigningMethod.Hash);
  }

  /**
   * Fill an order.
   *
   * Check that logs and balance updates are as expected.
   */
  async function fillOrder(
    perpetual: TestPerpetual,
    orderArgs: Partial<SignedOrder> = {},
    fillArgs: {
      amount?: BigNumber;
      price?: Price;
      fee?: Fee;
      sender?: address;
    } = {}
  ) {
    const order: SignedOrder = orderArgs.typedSignature
      ? (orderArgs as SignedOrder)
      : await getModifiedOrder(perpetual, orderArgs);
    const fillAmount = (fillArgs.amount || order.amount).dp(
      0,
      BigNumber.ROUND_DOWN
    );
    const fillPrice = fillArgs.price || order.limitPrice;
    const fillFee = fillArgs.fee || order.limitFee;
    const sender = fillArgs.sender || order.taker;

    // Get initial balances.
    const [makerBalance, takerBalance] = await Promise.all([
      perpetual.contracts.perpetualProxy.getAccountBalance(order.maker),
      perpetual.contracts.perpetualProxy.getAccountBalance(order.taker),
    ]);
    const { margin: makerMargin, position: makerPosition } = makerBalance;
    const { margin: takerMargin, position: takerPosition } = takerBalance;

    // Fill the order.
    await expect(
      perpetual.trade
        .initiate()
        .fillSignedOrder(order.taker, order, fillAmount, fillPrice, fillFee)
        .commit({ from: sender })
    ).to.emit(perpetual.contracts.p1Orders, 'LogOrderFilled');
  }

  async function expectStatus(
    orders: Orders,
    order: Order,
    status: OrderStatus,
    filledAmount?: BigNumber
  ) {
    const statuses = await orders.getOrdersStatus([order]);
    expect(statuses[0].status).to.equal(status);
    if (filledAmount) {
      expect(statuses[0].filledAmount).to.equal(filledAmount);
    }
  }
});

async function setOraclePrice(
  oracle: TestChainlinkAggregator,
  price: Price,
  deployer: Signer
): Promise<void> {
  await oracle.setAnswer(price, deployer);
}
