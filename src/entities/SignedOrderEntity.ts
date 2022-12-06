import { Entity, PrimaryColumn, ViewColumn, Column, ViewEntity } from 'typeorm';
import { OrderStatus, ApiMarketName } from '../types';

@Entity({ name: 'signed_orders' })
class ValidSignedOrderEntity {
  @PrimaryColumn({ name: 'hash' })
  public hash: string;

  @Column({ name: 'limit_fee' })
  public limitFee: string;

  @Column({ name: 'limit_price' })
  public limitPrice: string;

  @Column({ name: 'trigger_price' })
  public triggerPrice: string;

  @Column({ name: 'expiration' })
  public expiration: string;

  @Column({ name: 'amount' })
  public amount: string;

  @Column({ name: 'is_buy' })
  public isBuy: boolean;

  @Column({ name: 'is_decrease_only' })
  public isDecreaseOnly: boolean;

  @Column()
  public salt: string;

  @Column({ name: 'typed_signature' })
  public typedSignature: string;

  @Column()
  public maker: string;

  // @Column()
  // public market: ApiMarketName;

  @Column({ name: 'created_at' })
  public createdAt: string;

  @Column({ name: 'filled_amount' })
  public filledAmount: string;

  @Column({ name: 'order_state' })
  public orderState: OrderStatus;

  @Column()
  public taker: string;

  constructor(
    opts: {
      hash?: string;
      maker?: string;
      taker?: string;
      expiration?: string;
      amount?: string;
      salt?: string;
      typedSignature?: string;
      filledAmount?: string;
      limitFee?: string;
      limitPrice?: string;
      triggerPrice?: string;
      isBuy?: boolean;
      isDecreaseOnly?: boolean;
      createdAt?: string;
      orderState?: OrderStatus;
    } = {}
  ) {
    Object.assign(this, opts);
  }
}

export { ValidSignedOrderEntity as SignedOrderEntity };
