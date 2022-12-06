import { Context } from 'koa';
import { AccountService } from '../services/account_service';
import { BigNumber } from 'bignumber.js';

export class AccountHandler {
  constructor(private readonly accountService: AccountService) {}

  public async getAccountBalance(ctx: Context) {
    const account = ctx.params.address;

    const apiAccount = await this.accountService.getAccountBalanceAsync(
      account
    );
    ctx.status = 200;
    ctx.body = apiAccount;
  }

  public async drop(ctx: Context) {
    const { account, amount } = ctx.request.body;
    if (!account) {
      throw new Error(`account is undefined`);
    }
    let amountBigNumber;
    try {
      amountBigNumber = new BigNumber(amount);
    } catch (error) {
      throw new Error(error);
    }
    await this.accountService.drop(account, amountBigNumber);
    ctx.status = 200;
  }
}
