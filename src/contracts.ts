import {
  P1Orders,
  P1Orders__factory,
  PerpetualV1,
  PerpetualV1__factory,
  PerpetualProxy,
  PerpetualProxy__factory,
  MockToken,
  MockToken__factory,
  P1MakerOracle,
  P1MakerOracle__factory,
  P1FundingOracle,
  P1FundingOracle__factory,
  P1ChainlinkOracle,
  P1ChainlinkOracle__factory,
  P1LiquidatorProxy,
  P1LiquidatorProxy__factory,
  P1Deleveraging,
  P1Deleveraging__factory,
  P1Liquidation,
  P1Liquidation__factory,
} from '../typechain-types';
import { ethers, Contract } from 'ethers';
import { DeploymentsAddress } from './addresses';
import deploymentsJSON from '../deployments/deployments.json';
import { ApiMarketName } from './types';
import { WalletProvider } from './wallet_provider';

export class Contracts {
  public p1Orders: P1Orders;
  public perpetualV1: PerpetualV1;
  public perpetualProxy: PerpetualV1;
  public marginToken: MockToken;
  public priceOracle: P1ChainlinkOracle;
  public fundingOracle: P1FundingOracle;
  public liquidatorProxy: P1LiquidatorProxy;
  public p1Deleveraging: P1Deleveraging;
  public p1Liquidation: P1Liquidation;

  public market: ApiMarketName;
  public networkId: number;

  constructor(
    public provider: WalletProvider,
    market: ApiMarketName,
    networkId: number,
    addressBook?: Record<string, string>
  ) {
    addressBook =
      addressBook ?? (deploymentsJSON as DeploymentsAddress)[networkId];
    this.loadContractFromAddressBook(addressBook, provider);
    this.market = market;
    this.networkId = networkId;
  }

  public loadContractFromAddressBook(
    addressBook: Record<string, string>,
    provider: WalletProvider
  ) {
    this.p1Orders = P1Orders__factory.connect(
      addressBook.P1Orders,
      provider.provider
    );

    this.p1Liquidation = P1Liquidation__factory.connect(
      addressBook.P1Liquidation,
      provider.provider
    );
    this.p1Deleveraging = P1Deleveraging__factory.connect(
      addressBook.P1Deleveraging,
      provider.provider
    );
    this.perpetualV1 = PerpetualV1__factory.connect(
      addressBook.PerpetualV1,
      provider.provider
    );

    this.perpetualProxy = PerpetualV1__factory.connect(
      addressBook.PerpetualProxy,
      provider.provider
    );
    this.marginToken = MockToken__factory.connect(
      addressBook.MarginToken,
      provider.provider
    );
    this.priceOracle = P1ChainlinkOracle__factory.connect(
      addressBook.P1ChainlinkOracle,
      provider.provider
    );
    this.fundingOracle = P1FundingOracle__factory.connect(
      addressBook.P1FundingOracle,
      provider.provider
    );
    this.liquidatorProxy = P1LiquidatorProxy__factory.connect(
      addressBook.P1LiquidatorProxy,
      provider.provider
    );
  }
}
