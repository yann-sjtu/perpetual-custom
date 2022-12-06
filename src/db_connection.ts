import { Connection, ConnectionOptions, createConnection } from 'typeorm';

// import * as config from './ormconfig';

let connection: Connection;

/**
 *  * Creates the DB connnection to use in an app
 *   */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entities/User';
import { SignedOrderEntity, TradeHistoryEntity } from './entities';

export async function getDBConnectionAsync(): Promise<Connection> {
  if (!connection) {
    // connection = await createConnection(config as any as ConnectionOptions);

    connection = new DataSource({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'test',
      password: 'test',
      database: 'test',
      synchronize: true,
      logging: false,
      entities: [SignedOrderEntity, TradeHistoryEntity],
      migrations: [],
      subscribers: [],
    });
  }
  await connection.initialize();
  return connection;
}
