import { Entity, PrimaryColumn, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'trade_history' })
export class TradeHistoryEntity {
  @Column()
  public hash: string;

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  taker: string;

  @Column()
  maker: string;

  @Column()
  amount: string;

  @Column()
  price: string;

  @Column()
  timestamp: string;

  @Column({ name: 'is_buy' })
  public isBuy: boolean;

  @Column({ name: 'block_number' })
  blockNumber: number;

  constructor(
    opts: {
      hash?: string;
      taker?: string;
      maker?: string;
      isBuy?: boolean;
      amount?: string;
      price?: string;
      timestamp?: string;
      blockNumber?: number;
    } = {}
  ) {
    Object.assign(this, opts);
  }
}
