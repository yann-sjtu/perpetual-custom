import Router from '@koa/router';
import { ORDERBOOK_PATH, ACCOUNT_PATH } from '../constants';
import { createOrderBookRouter } from './orderbook_router';
import { rootHandler } from '../handlers/root_handler';
import { AppDependencies } from '../app';
import { createAccountRouter } from './account_router';

export function createRootRoutes(dependencies: AppDependencies) {
  const router = new Router();

  router.get('/', rootHandler);

  // dependencies
  const orderBookRouter = createOrderBookRouter(dependencies);
  router.use(
    ORDERBOOK_PATH,
    orderBookRouter.routes(),
    orderBookRouter.allowedMethods()
  );

  const accountRouter = createAccountRouter(dependencies.accountService);
  router.use(
    ACCOUNT_PATH,
    accountRouter.routes(),
    accountRouter.allowedMethods()
  );

  return router.routes();
}
