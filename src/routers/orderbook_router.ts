import Router from '@koa/router';
import { OrderBookHandlers } from '../handlers/orderbook_handlers';
import { OrderBookService } from '../services/orderbook_service';
import { AppDependencies } from '../app';

export function createOrderBookRouter(dependencies: AppDependencies) {
  const router = new Router();
  const orderBookHandler = new OrderBookHandlers(
    dependencies.orderBookService,
    dependencies.eventManager
  );

  router.get('/', orderBookHandler.orderbookAsync.bind(orderBookHandler));

  router.get('/order', orderBookHandler.ordersAsync.bind(orderBookHandler));
  router.get(
    '/quote',
    orderBookHandler.getQuotePriceAsync.bind(orderBookHandler)
  );
  router.get('/markets', orderBookHandler.getMarkets.bind(orderBookHandler));
  router.get(
    '/fundingRate',
    orderBookHandler.getFundingRateAsync.bind(orderBookHandler)
  );
  router.get(
    '/tradesHistory',
    orderBookHandler.tradesHistoryAsync.bind(orderBookHandler)
  );
  router.get(
    '/order/:orderHash',
    orderBookHandler.getOrderByHashAsync.bind(orderBookHandler)
  );

  router.post('/order', orderBookHandler.postOrderAsync.bind(orderBookHandler));
  router.post(
    '/cancelOrder',
    orderBookHandler.cancelOrderAsync.bind(orderBookHandler)
  );
  return router;
}
