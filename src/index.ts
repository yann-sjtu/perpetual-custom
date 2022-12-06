import * as dotenv from 'dotenv';
dotenv.config();

import { logger } from './logger';
import { defaultHttpServiceConfig } from './config';
import { ethers } from 'ethers';

import { getAppAsync, getDefaultAppDependenciesAsync } from './app';

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    defaultHttpServiceConfig.ethereumRpcUrl
  );
  const dependencies = await getDefaultAppDependenciesAsync(
    provider,
    defaultHttpServiceConfig
  );
  await getAppAsync(dependencies, defaultHttpServiceConfig);
})().catch(err => logger.error(err.stack));
