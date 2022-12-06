import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumber } from 'bignumber.js';
import { WalletProvider } from '../src/wallet_provider';
import { deploy } from '../scripts/helpers';
import { TestPerpetual } from './modules/test_perpetual';
import { INTEGERS } from '../src/constants';
import {
  mintAndDeposit,
  getPerpetual,
  getTestContracts,
  expectBalances,
  buy,
  sell,
  expectBaseValueEqual,
  expectMarginBalances,
  expectContractSurplus,
  getTestPerpetual,
} from './helpers';
import { mineAvgBlock } from './evm';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { Price, address, ApiMarketName, BaseValue, Index } from '../src/types';

describe('P1Settlement', () => {
  const marginAmount = new BigNumber(1000);
  const positionSize = new BigNumber(10);

  let long: address;
  let short: address;
  let otherAccountA: address;
  let otherAccountB: address;
  let otherAccountC: address;
  let perpetual: TestPerpetual;

  let adminSigner: SignerWithAddress;
  let longSigner: SignerWithAddress;
  let shortSigner: SignerWithAddress;
  let otherAccountASigner: SignerWithAddress;
  let otherAccountBSigner: SignerWithAddress;
  let otherAccountCSigner: SignerWithAddress;

  async function deployFixture() {
    const signers = await ethers.getSigners();
    long = signers[2].address;
    short = signers[3].address;
    otherAccountA = signers[4].address;
    otherAccountB = signers[5].address;
    otherAccountC = signers[6].address;

    adminSigner = signers[0];
    longSigner = signers[2];
    shortSigner = signers[3];
    otherAccountASigner = signers[4];
    otherAccountBSigner = signers[5];
    otherAccountCSigner = signers[6];

    perpetual = await getTestPerpetual(ethers.provider);

    // Set up initial balances:
    // +---------+--------+----------+
    // | account | margin | position |
    // |---------+--------+----------+
    // | long    |      0 |       10 |
    // | short   |   2000 |      -10 |
    // +---------+--------+----------+
    await Promise.all([
      perpetual.testing.chainlinkAggregator.setAnswer(
        new Price(100),
        adminSigner
      ),
      mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        marginAmount.toFixed(0),
        adminSigner,
        longSigner
      ),
      mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        marginAmount.toFixed(0),
        adminSigner,
        shortSigner
      ),
    ]);

    await buy(perpetual, long, short, positionSize, new BigNumber(100));

    // Sanity check balances.
    await expectBalances(
      perpetual,
      [long, short],
      [new BigNumber(0), new BigNumber(2000)],
      [new BigNumber(10), new BigNumber(-10)]
    );
  }

  beforeEach(async () => {
    await loadFixture(deployFixture);
  });

  describe('_loadContext()', () => {
    it('Updates the global index for a positive funding rate', async () => {
      await perpetual.testing.funder.setFunding(
        new BaseValue(0.005),
        adminSigner
      );
      let txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('0.5'), txResult.blockNumber);
      txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('1.0'), txResult.blockNumber);
    });

    it('Updates the global index for a negative funding rate', async () => {
      await perpetual.testing.funder.setFunding(
        new BaseValue(-0.005),
        adminSigner
      );
      let txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('-0.5'), txResult.blockNumber);
      txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('-1.0'), txResult.blockNumber);
    });

    it('Updates the global index over time with a variable funding rate and price', async () => {
      await perpetual.testing.funder.setFunding(
        new BaseValue(0.000001),
        adminSigner
      );
      let txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('0.0001'), txResult.blockNumber);

      await perpetual.testing.funder.setFunding(new BaseValue(4), adminSigner);
      txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('400.0001'), txResult.blockNumber);

      await perpetual.testing.chainlinkAggregator.setAnswer(
        new Price(40),
        adminSigner
      );

      txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('560.0001'), txResult.blockNumber);

      await perpetual.testing.funder.setFunding(
        new BaseValue(-10.5),
        adminSigner
      );
      txResult = await triggerIndexUpdate(otherAccountASigner);
      await expectIndexUpdated(new BaseValue('140.0001'), txResult.blockNumber);

      await perpetual.testing.chainlinkAggregator.setAnswer(
        new Price(0.00001),
        adminSigner
      ),
        (txResult = await triggerIndexUpdate(otherAccountASigner));
      await expectIndexUpdated(
        new BaseValue('139.999995'),
        txResult.blockNumber
      );
    });

    it('Maintains solvency despite rounding errors in interest calculation', async () => {
      // Set up balances:
      // +---------------+--------+----------+
      // | account       | margin | position |
      // |---------------+--------+----------+
      // | otherAccountA |     10 |        7 |
      // | otherAccountB |     10 |       -3 |
      // | otherAccountC |     10 |       -4 |
      // +---------------+--------+----------+
      await Promise.all([
        perpetual.testing.chainlinkAggregator.setAnswer(
          new Price(1),
          adminSigner
        ),
        mintAndDeposit(
          perpetual.contracts.marginToken,
          perpetual.contracts.perpetualProxy,
          10,
          adminSigner,
          otherAccountASigner
        ),
        mintAndDeposit(
          perpetual.contracts.marginToken,
          perpetual.contracts.perpetualProxy,
          10,
          adminSigner,
          otherAccountBSigner
        ),
        mintAndDeposit(
          perpetual.contracts.marginToken,
          perpetual.contracts.perpetualProxy,
          10,
          adminSigner,
          otherAccountCSigner
        ),
      ]);
      await buy(perpetual, otherAccountA, otherAccountB, 3, 0);
      await buy(perpetual, otherAccountA, otherAccountC, 4, 0);

      // Check balances.
      await expectBalances(
        perpetual,
        [otherAccountA, otherAccountB, otherAccountC],
        [10, 10, 10],
        [7, -3, -4],
        false
      );

      // Time period 1, global index is 0.7
      //
      // Settle account A, paying 5 margin in interest. New balances:
      // +---------------+--------+----------+-------------+--------------+
      // | account       | margin | position | local index | interest due |
      // |---------------+--------+----------+-------------+--------------+
      // | otherAccountA |      5 |        7 |         0.7 |            0 |
      // | otherAccountB |     10 |       -3 |           0 |          2.1 |
      // | otherAccountC |     10 |       -4 |           0 |          2.8 |
      // +---------------+--------+----------+-------------+--------------+
      await perpetual.testing.funder.setFunding(
        new BaseValue(0.7),
        adminSigner
      );
      await triggerIndexUpdate(otherAccountASigner);
      await expectMarginBalances(perpetual, [otherAccountA], [5], false);

      // Time period 1, global index is 1.4
      //
      // Settle all accounts. New balances:
      // +---------------+--------+----------+-------------+--------------+
      // | account       | margin | position | local index | interest due |
      // |---------------+--------+----------+-------------+--------------+
      // | otherAccountA |      0 |        7 |         1.4 |            0 |
      // | otherAccountB |     14 |       -3 |         1.4 |            0 |
      // | otherAccountC |     15 |       -4 |         1.4 |            0 |
      // +---------------+--------+----------+-------------+--------------+
      await triggerIndexUpdate(otherAccountASigner);
      await perpetual.testing.funder.setFunding(new BaseValue(0), adminSigner);
      await triggerIndexUpdate(otherAccountBSigner);
      await triggerIndexUpdate(otherAccountCSigner);

      // Check balances.
      await expectBalances(
        perpetual,
        [otherAccountA, otherAccountB, otherAccountC],
        [0, 14, 15],
        [7, -3, -4],
        false
      );
      await expectContractSurplus(
        perpetual,
        [long, short, otherAccountA, otherAccountB, otherAccountC],
        1
      );
    });
  });

  describe('_settleAccount()', () => {
    it('Settles interest accumulated on an account', async () => {
      // Sequence of operations:
      // +---------------+-------------+-----------+--------------+------------+
      // | operation     | long margin | long pos. | short margin | short pos. |
      // |---------------+-------------+-----------+--------------+------------|
      // | deposit       |        1000 |         0 |         1000 |          0 |
      // | trade         |           0 |        10 |         2000 |        -10 |
      // | settle(long)  |         -50 |        10 |         2000 |        -10 |
      // | settle(short) |           0 |        10 |         2050 |        -10 |
      // +---------------+-------------+-----------+--------------+------------+

      // Accumulate interest and settle the long account.
      await perpetual.testing.funder.setFunding(
        new BaseValue(0.05),
        adminSigner
      );
      const expectedInterest = new BigNumber('50'); // 0.05 * 100 * 10
      // Check account settlement log.
      await expect(triggerIndexUpdate(longSigner)).to.emit(
        perpetual.contracts.perpetualProxy,
        'LogAccountSettled'
      );
      // .withArgs(long, false, expectedInterest.toFixed(0));
      await perpetual.testing.funder.setFunding(new BaseValue(0), adminSigner);

      // Check balances after settlement of the long. Note that the short is not yet settled.
      await expectBalances(
        perpetual,
        [long, short],
        [expectedInterest.negated(), marginAmount.times(2)],
        [positionSize, positionSize.negated()],
        false, // fullSettled
        true // positionsSumToZero
      );

      // Settle the short account and check account settlement log.
      await expect(triggerIndexUpdate(shortSigner)).to.emit(
        perpetual.contracts.perpetualProxy,
        'LogAccountSettled'
      );

      // Check balances after settlement of the short account.
      await expectBalances(
        perpetual,
        [long, short],
        [
          expectedInterest.negated(),
          marginAmount.times(2).plus(expectedInterest),
        ],
        [positionSize, positionSize.negated()]
      );
    });

    it('Can settle accounts with a different frequency for each account', async () => {
      // Accumulate interest and settle the long account.
      await perpetual.testing.funder.setFunding(
        new BaseValue(0.05),
        adminSigner
      );
      for (let i = 0; i < 9; i += 1) {
        await triggerIndexUpdate(longSigner);
      }
      await perpetual.testing.funder.setFunding(new BaseValue(0), adminSigner);

      const expectedInterest = new BigNumber('450'); // 0.05 * 100 * 10 * 9

      // Check balances after settlement of the long. Note that the short is not yet settled.
      await expectBalances(
        perpetual,
        [long, short],
        [expectedInterest.negated(), marginAmount.times(2)],
        [positionSize, positionSize.negated()],
        false, // fullSettled
        true // positionsSumToZero
      );

      // Settle the short account and check account settlement log.
      await expect(triggerIndexUpdate(shortSigner)).to.emit(
        perpetual.contracts.perpetualProxy,
        'LogAccountSettled'
      );
      // .withArgs(short, true, expectedInterest.toFixed(0));

      // Check balances after settlement of the short account.
      await expectBalances(
        perpetual,
        [long, short],
        [
          expectedInterest.negated(),
          marginAmount.times(2).plus(expectedInterest),
        ],
        [positionSize, positionSize.negated()]
      );
    });

    it('Does not settle an account with no position', async () => {
      // Accumulate interest on long and short accounts.
      const localIndexBefore = await perpetual.getters.getAccountIndex(
        otherAccountA
      );
      await perpetual.testing.funder.setFunding(
        new BaseValue(0.05),
        adminSigner
      );
      await expect(triggerIndexUpdate(otherAccountASigner)).to.not.emit(
        perpetual.contracts.perpetualProxy,
        'LogAccountSettled'
      );

      // Check balance.
      const { margin, position } = await perpetual.getAccountBalance(
        otherAccountA
      );
      expect(margin).to.eq(INTEGERS.ZERO);
      expect(position).to.eq(INTEGERS.ZERO);

      // Check local index.
      const localIndexAfter = await perpetual.getters.getAccountIndex(
        otherAccountA
      );
      expect(localIndexAfter.baseValue.value).to.not.eq(
        localIndexBefore.baseValue.value
      );
      expect(localIndexAfter.timestamp).to.not.eq(localIndexBefore.timestamp);
    });
  });

  describe('_isCollateralized()', () => {
    const largeValue = new BigNumber(2).pow(120).minus(1);

    it('can handle large values', async () => {
      await mintAndDeposit(
        perpetual.contracts.marginToken,
        perpetual.contracts.perpetualProxy,
        largeValue.toFixed(0),
        adminSigner,
        otherAccountASigner
      ),
        await mineAvgBlock();
      await buy(perpetual, otherAccountA, long, 1, 100);
      await mineAvgBlock();
      await sell(perpetual, otherAccountA, long, 1, 100);
      await mineAvgBlock();
      await perpetual.contracts.perpetualProxy
        .connect(otherAccountASigner)
        .withdraw(otherAccountA, otherAccountA, largeValue.toFixed(0));
    });
  });

  // ============ Helper Functions ============

  /**
   * Triggers an index update and settles an account by making a deposit of zero.
   */
  async function triggerIndexUpdate(account: SignerWithAddress) {
    await mineAvgBlock();
    return perpetual.contracts.perpetualProxy
      .connect(account)
      .deposit(account.address, 0);
  }

  /**
   * Check the global index value emitted by the log and returned by the getter.
   */
  async function expectIndexUpdated(
    expectedBaseValue: BaseValue,
    blockNumber: number
  ): Promise<void> {
    // Construct expected Index.
    const { timestamp } = await ethers.provider.getBlock(blockNumber);
    const expectedIndex: Index = {
      timestamp: new BigNumber(timestamp),
      baseValue: expectedBaseValue,
    };

    // Check the getter function.
    const globalIndex = await perpetual.getters.getGlobalIndex();
    expectBaseValueEqual(
      globalIndex.baseValue,
      expectedIndex.baseValue,
      'index value from getter'
    );
    expect(globalIndex.timestamp, 'index timestamp from logs').to.eq(
      expectedIndex.timestamp
    );
  }
});
