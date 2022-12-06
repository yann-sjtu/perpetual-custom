import EventEmitter from 'events';
import { SRAOrder, EventType, TradeHistory, ApiAccount } from './types';

export class EventManager extends EventEmitter {
  public emitOrder(sraOrder: SRAOrder) {
    this.emit(EventType.Order, sraOrder);
  }

  public emitTradeRecord(tradeHistory: TradeHistory) {
    this.emit(EventType.TradeRecord, tradeHistory);
  }

  public emitAccountState(apiAccount: ApiAccount) {
    this.emit(EventType.AccountState, apiAccount);
  }
}

export const eventManager = new EventManager();
