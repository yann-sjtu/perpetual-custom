import { TestContracts } from './test_contracts';
import { BigNumberable, Price } from '../../src/types';
import { BigNumber } from 'bignumber.js';
import { Signer } from 'ethers';

export class TestChainlinkAggregator {
  private testContracts: TestContracts;

  constructor(testContracts: TestContracts) {
    this.testContracts = testContracts;
  }

  public async setAnswer(newPrice: Price, adminSigner: Signer) {
    return this.testContracts.testChainlinkAggregator
      .connect(adminSigner)
      .setAnswer(newPrice.toSolidity());
  }
}
