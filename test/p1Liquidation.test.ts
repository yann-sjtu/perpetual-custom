import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  mintAndDeposit,
  buy,
  sell,
  expectBalances,
  expectPositions,
  expectThrow,
  getTestPerpetual,
} from './helpers';
import { BigNumber } from 'bignumber.js';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { mineAvgBlock } from './evm';
import { TestPerpetual } from './modules/test_perpetual';
import { Price, address, BigNumberable, BaseValue } from '../src/types';

describe('P1Liquidation', () => {
  const initialPrice = new Price(100);
  const longBorderlinePrice = new Price(55);
  const longUndercollateralizedPrice = new Price('50.999999');
  const longUnderwaterPrice = new Price('49.999999');
  const shortBorderlinePrice = new Price('139.534883');
  const shortUndercollateralizedPrice = new Price('139.634883');
  const shortUnderwaterPrice = new Price('150.000001');
  const positionSize = new BigNumber(10);

  let admin: SignerWithAddress;
  let long: SignerWithAddress;
  let short: SignerWithAddress;
  let thirdParty: SignerWithAddress;
  let globalOperator: SignerWithAddress;
  let perpetual: TestPerpetual;

  async function deployFixture() {
    const signers = await ethers.getSigners();
    admin = signers[0];
    long = signers[1];
    short = signers[2];
    thirdParty = signers[3];
    globalOperator = signers[4];

    perpetual = await getTestPerpetual(ethers.provider);

    // Set up initial balances:
    // +---------+--------+----------+-------------------+
    // | account | margin | position | collateralization |
    // |---------+--------+----------+-------------------|
    // | long    |   -500 |       10 |              200% |
    // | short   |   1500 |      -10 |              150% |
    // +---------+--------+----------+-------------------+
    await Promise.all([
      perpetual.testing.chainlinkAggregator.setAnswer(initialPrice, admin),
      perpetual.contracts.perpetualProxy
        .connect(admin)
        .setGlobalOperator(globalOperator.address, true),
      mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(500).toFixed(0),
        admin,
        long
      ),
      mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(500).toFixed(0),
        admin,
        short
      ),
    ]);

    await buy(
      perpetual,
      long.address,
      short.address,
      positionSize,
      new BigNumber(100)
    );
  }

  beforeEach(async () => {
    await loadFixture(deployFixture);
  });

  describe('trade()', () => {
    it('Fails if the caller is not the perpetual contract', async () => {
      await expect(
        perpetual.liquidation.trade(
          long.address,
          short.address,
          long.address,
          shortUndercollateralizedPrice,
          positionSize,
          false
        )
      ).to.be.revertedWith('msg.sender must be PerpetualV1');
    });
  });

  describe('trade(), via PerpetualV1', () => {
    it('Succeeds partially liquidating a long position', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      const liquidationAmount = positionSize.div(2);
      await expect(liquidate(long.address, short.address, liquidationAmount))
        .to.emit(perpetual.contracts.p1Liquidation, 'LogLiquidated')
        .withArgs(
          long.address,
          short.address,
          liquidationAmount.toFixed(0),
          true,
          longUndercollateralizedPrice.toSolidity()
        );

      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(-250), new BigNumber(1250)],
        [new BigNumber(5), new BigNumber(-5)]
      );
    });

    it('Succeeds partially liquidating a short position', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      const liquidationAmount = positionSize.div(2);
      await expect(liquidate(short.address, long.address, liquidationAmount))
        .to.emit(perpetual.contracts.p1Liquidation, 'LogLiquidated')
        .withArgs(
          short.address,
          long.address,
          liquidationAmount.toFixed(0),
          false,
          shortUndercollateralizedPrice.toSolidity()
        );
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(250), new BigNumber(750)],
        [new BigNumber(5), new BigNumber(-5)]
      );
    });
    it('Succeeds fully liquidating an undercollateralized long position', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      await liquidate(long.address, short.address, positionSize);
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(0), new BigNumber(1000)],
        [new BigNumber(0), new BigNumber(0)]
      );
    });

    it('Succeeds fully liquidating an undercollateralized short position', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await liquidate(short.address, long.address, positionSize);
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(1000), new BigNumber(0)],
        [new BigNumber(0), new BigNumber(0)]
      );
    });

    it('Succeeds fully liquidating an underwater long position', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUnderwaterPrice,
        admin
      );
      await liquidate(long.address, short.address, positionSize);
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(0), new BigNumber(1000)],
        [new BigNumber(0), new BigNumber(0)]
      );
    });
    it('Succeeds fully liquidating an underwater short position', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUnderwaterPrice,
        admin
      );
      const txResult = await liquidate(
        short.address,
        long.address,
        positionSize
      );
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(1000), new BigNumber(0)],
        [new BigNumber(0), new BigNumber(0)]
      );
    });

    it('Succeeds with all-or-nothing', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      await liquidate(long.address, short.address, positionSize, {
        allOrNothing: true,
      });
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(0), new BigNumber(1000)],
        [new BigNumber(0), new BigNumber(0)]
      );
    });
    it('Succeeds when the amount is zero and the maker is long', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      await liquidate(long.address, short.address, 0);
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(-500), new BigNumber(1500)],
        [new BigNumber(10), new BigNumber(-10)]
      );
    });

    it('Succeeds when the amount is zero and the maker is short', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await liquidate(short.address, long.address, 0);
      await expectBalances(
        perpetual,
        [long.address, short.address],
        [new BigNumber(-500), new BigNumber(1500)],
        [new BigNumber(10), new BigNumber(-10)]
      );
    });

    it('Succeeds even if amount is greater than the maker position', async () => {
      // Cover some of the short position.
      await mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(10000).toFixed(0),
        admin,
        thirdParty
      );
      await buy(
        perpetual,
        short.address,
        thirdParty.address,
        new BigNumber(1),
        new BigNumber(150)
      );

      // New balances:
      // | account | margin | position |
      // |---------+--------+----------|
      // | long    |   -500 |       10 |
      // | short   |   1350 |       -9 |

      // Liquidate the short position.
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await liquidate(short.address, long.address, positionSize);

      // The actual amount executed should be bounded by the maker position.
      await expectBalances(
        perpetual,
        [long.address, short.address, thirdParty.address],
        [new BigNumber(850), new BigNumber(0), new BigNumber(10150)],
        [new BigNumber(1), new BigNumber(0), new BigNumber(-1)]
      );
    });

    it('Succeeds even if amount is greater than the taker position', async () => {
      // Sell off some of the long position.
      await mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(10000).toFixed(0),
        admin,
        thirdParty
      );
      await sell(
        perpetual,
        long.address,
        thirdParty.address,
        new BigNumber(1),
        new BigNumber(150)
      );

      // New balances:
      // | account | margin | position |
      // |---------+--------+----------|
      // | long    |   -350 |        9 |
      // | short   |   1500 |      -10 |

      // Liquidate the short position.
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await liquidate(short.address, long.address, positionSize);

      // Liquidiation amount should NOT be bounded by the taker position.
      await expectBalances(
        perpetual,
        [long.address, short.address, thirdParty.address],
        [new BigNumber(1150), new BigNumber(0), new BigNumber(9850)],
        [new BigNumber(-1), new BigNumber(0), new BigNumber(1)]
      );
    });

    it('Cannot liquidate a long position that is not undercollateralized', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longBorderlinePrice,
        admin
      );
      await expectThrow(
        liquidate(long.address, short.address, positionSize),
        'Cannot liquidate since maker is not undercollateralized'
      );
    });

    it('Cannot liquidate a short position that is not undercollateralized', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortBorderlinePrice,
        admin
      );
      await expect(
        liquidate(short.address, long.address, positionSize)
      ).to.be.revertedWith(
        'Cannot liquidate since maker is not undercollateralized'
      );
    });

    it('Cannot liquidate a long position if isBuy is false', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      await expect(
        liquidate(long.address, short.address, positionSize, { isBuy: false })
      ).to.be.revertedWith(
        "liquidation must not increase maker's position size"
      );
    });

    it('Cannot liquidate a short position if isBuy is true', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await expect(
        liquidate(short.address, long.address, positionSize, { isBuy: true })
      ).to.be.revertedWith(
        "liquidation must not increase maker's position size"
      );
    });

    it('With all-or-nothing, fails if amount is greater than the maker position', async () => {
      // Attempt to liquidate the short position.
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await expect(
        liquidate(short.address, long.address, positionSize.plus(1), {
          allOrNothing: true,
        })
      ).to.be.revertedWith(
        'allOrNothing is set and maker position is less than amount'
      );
    });

    it('With all-or-nothing, succeeds even if amount is greater than taker position', async () => {
      // Sell off some of the long position.
      await mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(10000).toFixed(0),
        admin,
        thirdParty
      );
      await sell(perpetual, long.address, thirdParty.address, 1, 150);

      // Liquidate the short position.
      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await liquidate(short.address, long.address, positionSize, {
        allOrNothing: true,
      });
    });

    it('Succeeds liquidating a long against a long', async () => {
      // Turn the short into a long.
      await mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(10000).toFixed(0),
        admin,
        thirdParty
      );
      await buy(
        perpetual,
        short.address,
        thirdParty.address,
        positionSize.times(2),
        new BigNumber(50)
      );

      // Sanity check.
      await expectPositions(
        perpetual,
        [long.address, short.address],
        [positionSize, positionSize],
        false // positionsSumToZero
      );

      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      await liquidate(long.address, short.address, positionSize);
    });

    it('Succeeds liquidating a short against a short', async () => {
      // Turn the long into a short.
      await mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        new BigNumber(10000).toFixed(0),
        admin,
        thirdParty
      );

      await sell(
        perpetual,
        long.address,
        thirdParty.address,
        positionSize.times(2),
        500
      );

      // Sanity check.
      await expectPositions(
        perpetual,
        [long.address, short.address],
        [positionSize.negated(), positionSize.negated()],
        false // positionsSumToZero
      );

      await perpetual.testing.chainlinkAggregator.setAnswer(
        shortUndercollateralizedPrice,
        admin
      );
      await liquidate(short.address, long.address, positionSize);
    });

    it('Cannot liquidate if the sender is not a global operator', async () => {
      await perpetual.testing.chainlinkAggregator.setAnswer(
        longUndercollateralizedPrice,
        admin
      );
      const error = 'Sender is not a global operator';
      await expect(
        liquidate(long.address, short.address, positionSize, {
          sender: thirdParty.address,
        })
      ).to.be.revertedWith(error);
      await expect(
        liquidate(long.address, short.address, positionSize, {
          sender: admin.address,
        })
      ).to.be.revertedWith(error);
    });

    describe('when an account has no positive value', async () => {
      beforeEach(async () => {
        // Short begins with -10 position, 1500 margin.
        // Set a negative funding rate and accumulate 2000 margin worth of interest.
        await perpetual.testing.funder.setFunding(new BaseValue(-2), admin);
        await mineAvgBlock();
        await perpetual.contracts.perpetualProxy
          .connect(short)
          .deposit(short.address, 0);
        const balance = await perpetual.getAccountBalance(short.address);
        expect(balance.position).to.equal(-10);
        expect(balance.margin).to.equal(-500);
      });

      it('Cannot directly liquidate the account', async () => {
        await expect(
          liquidate(short.address, long.address, positionSize)
        ).to.be.revertedWith(
          'Cannot liquidate when maker position and margin are both negative'
        );
      });

      it('Succeeds liquidating after bringing margin up to zero', async () => {
        // Avoid additional funding.
        await perpetual.testing.funder.setFunding(new BaseValue(0), admin);

        // Deposit margin into the target account to bring it to zero margin.
        await perpetual.contracts.perpetualProxy
          .connect(long)
          .withdraw(long.address, long.address, 500);
        await perpetual.contracts.perpetualProxy
          .connect(long)
          .deposit(short.address, 500);

        // Liquidate the underwater account.
        await liquidate(short.address, long.address, positionSize);

        // Check balances.
        await expectBalances(
          perpetual,
          [long.address, short.address],
          [new BigNumber(1000), new BigNumber(0)],
          [new BigNumber(0), new BigNumber(0)]
        );
      });
    });
  });

  async function liquidate(
    maker: address,
    taker: address,
    amount: BigNumberable,
    args: {
      allOrNothing?: boolean;
      isBuy?: boolean;
      sender?: address;
    } = {}
  ) {
    let { isBuy } = args;
    if (typeof isBuy !== 'boolean') {
      // By default, infer isBuy from the sign of the maker position.
      isBuy = (
        await perpetual.contracts.perpetualProxy.getAccountBalance(maker)
      ).positionIsPositive;
    }
    return perpetual.trade
      .initiate()
      .liquidate(maker, taker, amount, isBuy, !!args.allOrNothing)
      .commit({ from: args.sender || globalOperator.address });
  }
});
