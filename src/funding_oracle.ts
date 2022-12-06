import { Contracts } from './contracts';
import {
  BigNumberable,
  BaseValue,
  FundingRate,
  FundingRateBounds,
} from './types';
import { BigNumber } from 'bignumber.js';
import { Signer } from 'ethers';

export class FundingOracle {
  private contracts: Contracts;

  constructor(contracts: Contracts) {
    this.contracts = contracts;
  }

  public get address(): string {
    return this.contracts.fundingOracle.address;
  }

  public async getFunding(timeDeltaSeconds: BigNumberable): Promise<BaseValue> {
    const [isPositive, funding] = await this.contracts.fundingOracle.getFunding(
      new BigNumber(timeDeltaSeconds).toFixed(0)
    );
    return BaseValue.fromSolidity(funding.toString(), isPositive);
  }

  /**
   * Get the current funding rate, represented as a per-second rate.
   */
  public async getFundingRate(): Promise<FundingRate> {
    const oneSecondFunding = await this.getFunding(1);
    return new FundingRate(oneSecondFunding.value);
  }
  public async setFunding(newFunding: BaseValue, fundingRateProvider: Signer) {
    return this.contracts.fundingOracle
      .connect(fundingRateProvider)
      .setFundingRate({
        isPositive: !newFunding.isNegative(), // isPositive
        value: newFunding.toSolidity(),
      });
  }

  // ============ Getters ============

  public async getBounds(): Promise<FundingRateBounds> {
    const results = await Promise.all([
      this.contracts.fundingOracle.MAX_ABS_VALUE(),
      this.contracts.fundingOracle.MAX_ABS_DIFF_PER_SECOND(),
    ]);
    const [maxAbsValue, maxAbsDiffPerSecond] = results.map(s => {
      return FundingRate.fromSolidity(s.toString());
    });
    return { maxAbsValue, maxAbsDiffPerSecond };
  }

  /**
   * Simulates the result of calling setFundingRate() using `eth_call`.
   */
  public async getBoundedFundingRate(
    fundingRate: FundingRate,
    fundingRateProvider: Signer
  ): Promise<FundingRate> {
    const result = await this.contracts.fundingOracle
      .connect(fundingRateProvider)
      .callStatic.setFundingRate(fundingRate.toSoliditySignedInt());
    return FundingRate.fromSolidity(result.value.toString(), result.isPositive);
  }
}
