import { Contracts } from '../../src/contracts';
import { ApiMarketName } from '../../src/types';
import { WalletProvider } from '../../src/wallet_provider';
import {
  Test_P1Funder,
  Test_ChainlinkAggregator,
  Test_P1Funder__factory,
  Test_ChainlinkAggregator__factory,
} from '../../typechain-types';

export class TestContracts {
  public testP1Funder: Test_P1Funder;
  public testChainlinkAggregator: Test_ChainlinkAggregator;

  constructor(
    provider: WalletProvider,
    market: ApiMarketName,
    networkId: number,
    addressBook?: Record<string, string>
  ) {
    this.testP1Funder = Test_P1Funder__factory.connect(
      addressBook.Test_P1Funder,
      provider.provider
    );

    this.testChainlinkAggregator = Test_ChainlinkAggregator__factory.connect(
      addressBook.Test_ChainlinkAggregator,
      provider.provider
    );
  }
}
