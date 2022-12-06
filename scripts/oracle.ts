import axios from 'axios';
import { logger } from '../src/logger';

const baseUrl = `http://localhost:3000`;
async function request(route, query: Record<string, string> = {}) {
  const url = `${baseUrl}${route}`;
  const res = await axios.get(url, { params: query });
  const quoteRes = res.data;
  logger.info(quoteRes);
  return quoteRes;
}

async function main() {
  await request('/orderbook/v1/fundingRate');
  await request('/account/v1/0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  await request('/orderbook/v1/markets');
  await request('/orderbook/v1/order', {
    maker: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  });

  const amount = '1000000';
  const account = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  await axios.post(`${baseUrl}/account/v1/drop`, { amount, account });

  await axios.post(`${baseUrl}/orderbook/v1/cancelOrder`, {
    ordersHash: [
      '0x1f612a2386b90278c62a23dd2a23dff78564e05730377f80fc48170ecd4b2c14',
    ],
  });
}

main().catch(err => logger.error(err.stack));
