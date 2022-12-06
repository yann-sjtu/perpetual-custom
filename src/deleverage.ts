import { bnToBytes32, boolToBytes32, combineHexStrings } from './utils';
import { address, Price, BigNumberable } from './types';

export function makeDeleverageTradeData(
  amount: BigNumberable,
  isBuy: boolean,
  allOrNothing: boolean
): string {
  const amountData = bnToBytes32(amount);
  const isBuyData = boolToBytes32(isBuy);
  const allOrNothingData = boolToBytes32(allOrNothing);
  return combineHexStrings(amountData, isBuyData, allOrNothingData);
}
