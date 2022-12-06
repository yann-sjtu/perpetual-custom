import { ConnectionOptions } from 'typeorm';

import { POSTGRES_READ_REPLICA_URIS, POSTGRES_URI } from './config';
import { SignedOrderEntity } from './entities';

const entities = [SignedOrderEntity];

const config: ConnectionOptions = {
  type: 'postgres',
  entities,
  synchronize: false,
  logging: true,
  logger: 'debug',
  extra: {
    max: 15,
    statement_timeout: 10000,
  },
  ...(POSTGRES_READ_REPLICA_URIS
    ? {
        replication: {
          master: { url: POSTGRES_URI },
          slaves: POSTGRES_READ_REPLICA_URIS.map(r => ({ url: r })),
        },
      }
    : { url: POSTGRES_URI }),
};

export = config;
