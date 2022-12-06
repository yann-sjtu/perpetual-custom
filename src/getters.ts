import { Contracts } from './contracts';
import { address, Index, BaseValue } from './types';
import { PerpetualV1, PerpetualV1__factory } from '../typechain-types';
import { BigNumber } from 'bignumber.js';

export class Getters {
  private contracts: Contracts;
  private perpetual: PerpetualV1;

  constructor(contracts: Contracts) {
    this.contracts = contracts;
    this.perpetual = this.contracts.perpetualProxy;
  }

  public async getAccountIndex(account: address): Promise<Index> {
    const result = await this.perpetual.getAccountIndex(account);
    return this.solidityIndexToIndex(result);
  }

  public async getGlobalIndex(): Promise<Index> {
    const result = await this.perpetual.getGlobalIndex();
    return this.solidityIndexToIndex(result);
  }

  private solidityIndexToIndex(solidityIndex: any[]): Index {
    const [timestamp, isPositive, value] = solidityIndex;
    return {
      timestamp: new BigNumber(timestamp),
      baseValue: BaseValue.fromSolidity(value.toString(), isPositive),
    };
  }
}
