import {
  address,
  Price,
  FundingRate,
  BigNumberable,
  BaseValue,
} from '../src/types';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { fastForward } from './evm';
import {
  INTEGERS,
  FUNDING_RATE_MAX_ABS_VALUE,
  FUNDING_RATE_MAX_ABS_DIFF_PER_SECOND,
} from '../src/constants';
import { ethers } from 'hardhat';
import {
  getTestPerpetual,
  expectBaseValueEqual,
  expectBaseValueNotEqual,
  getTestContracts,
} from './helpers';
import { TestPerpetual } from './modules/test_perpetual';
import { Perpetual } from '../src/perpetual';
import { Signer } from 'ethers';

interface Context {
  perpetual: Perpetual;
  testContracts: ReturnType<typeof getTestContracts>;
}

describe('P1FundingOracle', () => {
  const minUnit = INTEGERS.ONE.shiftedBy(-18);
  const oraclePrice = new Price(100);

  let admin: address;
  let fundingRateProvider: address;
  let rando: address;
  let perpetual: TestPerpetual;

  let adminSigner: Signer;
  let fundingRateProviderSigner: Signer;
  let randoSigner: Signer;

  async function deployFixture() {
    const signers = await ethers.getSigners();
    admin = signers[0].address;
    fundingRateProvider = signers[1].address;
    rando = signers[2].address;

    adminSigner = signers[0];
    fundingRateProviderSigner = signers[1];
    randoSigner = signers[2];

    perpetual = await getTestPerpetual(ethers.provider);
    await perpetual.testing.chainlinkAggregator.setAnswer(
      oraclePrice,
      adminSigner
    );
  }

  beforeEach(async () => {
    await loadFixture(deployFixture);
  });

  describe('constants', () => {
    it('the bounds are set as expected', async () => {
      const bounds = await perpetual.fundingOracle.getBounds();
      expectBaseValueEqual(bounds.maxAbsValue, FUNDING_RATE_MAX_ABS_VALUE);
      expectBaseValueEqual(
        bounds.maxAbsDiffPerSecond,
        FUNDING_RATE_MAX_ABS_DIFF_PER_SECOND
      );
    });
  });

  describe('setFundingRateProvider', () => {
    it('sets the funding rate provider', async () => {
      // Check that provider can't set the rate at first.
      await expect(
        perpetual.fundingOracle.setFunding(
          new FundingRate('1e-10'),
          randoSigner
        )
      ).to.be.revertedWith(
        'The funding rate can only be set by the funding rate provider'
      );

      // Set the provider.
      await expect(
        perpetual.contracts.fundingOracle
          .connect(adminSigner)
          .setFundingRateProvider(fundingRateProvider)
      )
        .to.emit(perpetual.contracts.fundingOracle, 'LogFundingRateProviderSet')
        .withArgs(fundingRateProvider);

      // Check that the provider can set the rate after.
      await perpetual.fundingOracle.setFunding(
        new FundingRate('1e-10'),
        fundingRateProviderSigner
      );

      // Check getter.
      const providerAfter =
        await perpetual.contracts.fundingOracle._FUNDING_RATE_PROVIDER_();
      expect(providerAfter).to.equal(fundingRateProvider);

      // Set another provider.
      await perpetual.contracts.fundingOracle
        .connect(adminSigner)
        .setFundingRateProvider(rando);

      // Check that the provider can set the rate after.
      await perpetual.fundingOracle.setFunding(
        new FundingRate('1e-10'),
        randoSigner
      );
    });

    it('fails if the caller is not the admin', async () => {
      // Call from a random address.
      await expect(
        perpetual.contracts.fundingOracle
          .connect(randoSigner)
          .setFundingRateProvider(fundingRateProvider)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      // Set the provider as admin, and then call from the provider address.
      await perpetual.contracts.fundingOracle
        .connect(adminSigner)
        .setFundingRateProvider(fundingRateProvider);
      await expect(
        perpetual.contracts.fundingOracle
          .connect(fundingRateProviderSigner)
          .setFundingRateProvider(fundingRateProvider)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('getFunding()', () => {
    it('initially returns zero', async () => {
      await expectFunding(1000, 0);
    });

    it('gets funding as a function of time elapsed', async () => {
      // Set a funding rate.
      await perpetual.contracts.fundingOracle
        .connect(adminSigner)
        .setFundingRateProvider(fundingRateProvider);
      await perpetual.fundingOracle.setFunding(
        new FundingRate('1e-10'),
        fundingRateProviderSigner
      );

      // Check funding amount for different time periods.
      await expectFunding(1230, '1.23e-7');
      await expectFunding(12300, '1.23e-6');
      await expectFunding(123000, '1.23e-5');
    });
  });

  describe('setFundingRate()', () => {
    beforeEach(async () => {
      await perpetual.contracts.fundingOracle
        .connect(adminSigner)
        .setFundingRateProvider(fundingRateProvider);
    });

    it('sets a positive funding rate', async () => {
      await setFundingRate(new FundingRate('1e-10'));
      await setFundingRate(new FundingRate('1e-15'));
    });

    it('sets a negative funding rate', async () => {
      await setFundingRate(new FundingRate('-1e-10'));
      await setFundingRate(new FundingRate('-1e-15'));
    });

    it('sets a very small or zero funding rate', async () => {
      await setFundingRate(new FundingRate('-1e-16'));
      await setFundingRate(new FundingRate('-1e-18'));
      await setFundingRate(new FundingRate(0));
    });

    it('fails if not called by the funding rate provider', async () => {
      await expect(
        perpetual.fundingOracle.setFunding(
          new FundingRate('1e-10'),
          randoSigner
        )
      ).to.be.revertedWith(
        'The funding rate can only be set by the funding rate provider'
      );
      await expect(
        perpetual.fundingOracle.setFunding(
          new FundingRate('1e-10'),
          adminSigner
        )
      ).to.be.revertedWith(
        'The funding rate can only be set by the funding rate provider'
      );
    });
    //
    describe('funding rate bounds', () => {
      it('cannot exceed the max value', async () => {
        // Set to max value, while obeying the per-update speed limit.
        await setFundingRate(FUNDING_RATE_MAX_ABS_VALUE);

        // Try to set above max value.
        await setFundingRate(FUNDING_RATE_MAX_ABS_VALUE.plus(minUnit), {
          expectedRate: FUNDING_RATE_MAX_ABS_VALUE,
        });
      });

      it('cannot exceed the min value', async () => {
        const minFundingRate = FUNDING_RATE_MAX_ABS_VALUE.negated();

        // Set to min value, while obeying the per-update speed limit.
        await setFundingRate(minFundingRate);

        // Try to set below min value.
        await setFundingRate(minFundingRate.minus(minUnit), {
          expectedRate: minFundingRate,
        });
      });

      it('cannot increase faster than the per second limit', async () => {
        const quarterHour = 60 * 15;
        const quarterHourMaxDiff =
          FUNDING_RATE_MAX_ABS_DIFF_PER_SECOND.times(quarterHour);
        const initialRate = FundingRate.fromEightHourRate('0.00123');
        const targetRate = initialRate.plus(quarterHourMaxDiff.value);

        // Update the funding rate timestamp so we can more accurately estimate the
        // time elapsed between updates.
        await setFundingRate(initialRate);

        // Elapse less than a quarter hour. Assume this test case takes less than 15 seconds.
        await fastForward(quarterHour - 15);

        // Expect the bounded rate to be slightly lower than the requested rate.
        const boundedRate = await getBoundedFundingRate(targetRate);
        expectBaseValueNotEqual(boundedRate, targetRate);

        // Error should be at most (15 seconds) / (15 minutes) = 1 / 60.
        const actualDiff = boundedRate.minus(initialRate.value);
        const ratio = actualDiff.value.div(quarterHourMaxDiff.value).toNumber();
        expect(ratio).to.be.lessThan(1); // sanity check
        expect(ratio).to.be.gte(59 / 60 - 0.0000000001); // Allow tolerance for rounding error.
      });

      it('cannot decrease faster than the per second limit', async () => {
        const quarterHour = 60 * 15;
        const quarterHourMaxDiff =
          FUNDING_RATE_MAX_ABS_DIFF_PER_SECOND.times(quarterHour);
        const initialRate = FundingRate.fromEightHourRate('0.00123');
        const targetRate = initialRate.minus(quarterHourMaxDiff.value);

        // Update the funding rate timestamp so we can more accurately estimate the
        // time elapsed between updates.
        await setFundingRate(initialRate);

        // Elapse less than a quarter hour. Assume this test case takes less than 15 seconds.
        await fastForward(quarterHour - 15);

        // Expect the bounded rate to be slightly greater than the requested rate.
        const boundedRate = await getBoundedFundingRate(targetRate);
        expectBaseValueNotEqual(boundedRate, targetRate);

        // Error should be at most (15 seconds) / (15 minutes) = 1 / 60.
        const actualDiff = boundedRate.minus(initialRate.value);
        const ratio = actualDiff.value
          .div(quarterHourMaxDiff.value)
          .negated()
          .toNumber();
        expect(ratio).to.be.lessThan(1); // sanity check
        expect(ratio).to.be.gte(59 / 60 - 0.0000000001); // Allow tolerance for rounding error.
      });
    });
  });

  async function expectFunding(
    timeDelta: BigNumberable,
    expectedFunding: BigNumberable
  ): Promise<void> {
    const funding = await perpetual.fundingOracle.getFunding(timeDelta);
    expectBaseValueEqual(funding, new BaseValue(expectedFunding));
  }

  /**
   * Get the bounded funding rate as the funding rate provider.
   */
  async function getBoundedFundingRate(fundingRate: FundingRate) {
    return perpetual.fundingOracle.getBoundedFundingRate(
      fundingRate,
      fundingRateProviderSigner
    );
  }

  /**
   * Set the funding rate and verify the emitted logs.
   */
  async function setFundingRate(
    fundingRate: FundingRate,
    options: {
      expectedRate?: FundingRate;
    } = {}
  ): Promise<void> {
    // Elapse enough time so that the speed limit does not take effect.
    await fastForward(INTEGERS.ONE_HOUR_IN_SECONDS.toNumber());

    // Verify the return value is as expected.
    const simulatedResult = await getBoundedFundingRate(fundingRate);
    const expectedRate = options.expectedRate || fundingRate;
    expectBaseValueEqual(simulatedResult, expectedRate, 'simulated result');

    // Set the funding rate.
    await expect(
      perpetual.fundingOracle.setFunding(fundingRate, fundingRateProviderSigner)
    ).to.emit(perpetual.contracts.fundingOracle, 'LogFundingRateUpdated');

    // Check the actual rate as returned by getFunding().
    const actualRate = await perpetual.fundingOracle.getFundingRate();
    expectBaseValueEqual(actualRate, expectedRate, 'actual rate');
  }
});
