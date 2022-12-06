import { address, ApiAccount, ApiBalance } from '../types';
import { Perpetual } from '../perpetual';
import { BigNumber } from 'bignumber.js';
import { DEPLOYER_ACCOUNT } from '../config';

export class AccountService {
  constructor(protected perpetual: Perpetual) {}

  public async getAccountBalanceAsync(account: address): Promise<ApiAccount> {
    return this.perpetual.getAccount(account);
  }

  public async drop(account: string, amount: BigNumber) {
    const wallet = this.perpetual.provider.getSigner(DEPLOYER_ACCOUNT);
    await this.perpetual.contracts.marginToken
      .connect(wallet)
      .mint(account, amount.toFixed(0));
  }
}
