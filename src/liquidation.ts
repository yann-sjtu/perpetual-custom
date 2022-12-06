import { Contracts } from './contracts';
import { P1Liquidation } from '../typechain-types';
import { bnToBytes32, boolToBytes32, combineHexStrings } from './utils';
import { address, Price, BigNumberable } from './types';
import { BigNumber } from 'bignumber.js';
import { INTEGERS } from './constants';

export function makeLiquidateTradeData(
  amount: BigNumberable,
  isBuy: boolean,
  allOrNothing: boolean
): string {
  const amountData = bnToBytes32(amount);
  const isBuyData = boolToBytes32(isBuy);
  const allOrNothingData = boolToBytes32(allOrNothing);
  return combineHexStrings(amountData, isBuyData, allOrNothingData);
}

export class Liquidation {
  private contracts: Contracts;
  private liquidation: P1Liquidation;

  constructor(contracts: Contracts) {
    this.contracts = contracts;
    this.liquidation = this.contracts.p1Liquidation;
  }

  public get address(): string {
    return this.liquidation.address;
  }

  /**
   * Use eth_call to simulate the result of calling the trade() function.
   */
  public async trade(
    sender: address,
    maker: address,
    taker: address,
    price: Price,
    amount: BigNumber,
    isBuy: boolean,
    allOrNothing = false,
    traderFlags: BigNumber = INTEGERS.ZERO
  ) {
    return this.liquidation
      .connect(this.contracts.provider.getSigner(sender))
      .trade(
        sender,
        maker,
        taker,
        price.toSolidity(),
        makeLiquidateTradeData(amount, isBuy, allOrNothing),
        bnToBytes32(traderFlags)
      );
  }
}
