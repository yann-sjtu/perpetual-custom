import { Perpetual } from '../../src/perpetual';
import { WalletProvider } from '../../src/wallet_provider';
import { ApiMarketName, ChainId, PerpetualOptions } from '../../src/types';
import { Testing } from './testing';
import { TestContracts } from './test_contracts';

export class TestPerpetual extends Perpetual {
  public testing: Testing;
  public testContracts: TestContracts;
  constructor(
    provider: WalletProvider,
    market: ApiMarketName,
    chainId: number = ChainId.Mainnet,
    options: PerpetualOptions = {}
  ) {
    super(provider, market, chainId, options);
    this.testContracts = new TestContracts(
      provider,
      market,
      chainId,
      options.addressBook
    );
    this.testing = new Testing(this.testContracts);
  }
}
