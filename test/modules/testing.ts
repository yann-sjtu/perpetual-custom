import { TestContracts } from './test_contracts';
import { TestP1Funder } from './test_p1Funder';
import { TestChainlinkAggregator } from './test_chainlinkAggregator';

export class Testing {
  public funder: TestP1Funder;
  public chainlinkAggregator: TestChainlinkAggregator;

  constructor(contracts: TestContracts) {
    this.funder = new TestP1Funder(contracts);
    this.chainlinkAggregator = new TestChainlinkAggregator(contracts);
  }
}
