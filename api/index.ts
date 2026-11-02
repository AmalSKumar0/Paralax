import { getRequestListener } from '@hono/node-server';
import { app } from '../server/app.js';

const nodeListener = getRequestListener(app.fetch);

export { app };

export default async function handler(req: any, res?: any) {
  // If invoked in standard Vercel Node.js runtime with (IncomingMessage, ServerResponse)
  if (res && typeof res.setHeader === 'function') {
    return nodeListener(req, res);
  }
  // If invoked in Web Standard / Edge runtime with Request
  return app.fetch(req);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;

