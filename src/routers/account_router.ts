import Router from '@koa/router';
import { Perpetual } from '../perpetual';
import { AccountHandler } from '../handlers/account_handler';
import { AccountService } from '../services/account_service';

export function createAccountRouter(accountService: AccountService) {
  const router = new Router();
  const accountHandler = new AccountHandler(accountService);
  router.get(
    '/:address',
    accountHandler.getAccountBalance.bind(accountHandler)
  );

  router.post('/drop', accountHandler.drop.bind(accountHandler));
  return router;
}
