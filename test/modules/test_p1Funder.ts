import { TestContracts } from './test_contracts';
import { BaseValue, BigNumberable } from '../../src/types';
import { Signer } from 'ethers';
import { BigNumber } from 'bignumber.js';

export class TestP1Funder {
  private contracts: TestContracts;

  constructor(contracts: TestContracts) {
    this.contracts = contracts;
  }

  public get address(): string {
    return this.contracts.testP1Funder.address;
  }

  public async getFunding(timeDeltaSeconds: BigNumberable): Promise<BaseValue> {
    const [isPositive, funding] = await this.contracts.testP1Funder.getFunding(
      new BigNumber(timeDeltaSeconds).toFixed(0)
    );
    return BaseValue.fromSolidity(funding.toString(), isPositive);
  }

  public async setFunding(newFunding: BaseValue, fundingRateProvider: Signer) {
    return this.contracts.testP1Funder
      .connect(fundingRateProvider)
      .setFundingRate({
        isPositive: !newFunding.isNegative(), // isPositive
        value: newFunding.toSolidity(),
      });
  }
}
