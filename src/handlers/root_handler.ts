import { Context } from 'koa';

export const rootHandler = (ctx: Context) => {
  ctx.body = {
    message:
      'This is the root of the 0x API. Visit https://0x.org/docs/api for documentation.',
  };
};
