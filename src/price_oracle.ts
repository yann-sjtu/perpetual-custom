import { Contracts } from './contracts';

export class PriceOracle {
  constructor(protected contracts: Contracts) {}

  public async getPrice() {
    return this.contracts.priceOracle.getPrice({
      from: this.contracts.perpetualProxy.address,
    });
  }
}
