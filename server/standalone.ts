import { createAdaptorServer } from '@hono/node-server';
import { app } from './app.js';
import { setupWebSocketServer } from './websocket/streamHandler.js';
import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.PORT || '3000', 10);

const server = createAdaptorServer({
  fetch: app.fetch,
});

setupWebSocketServer(server);

server.listen(port, '0.0.0.0', () => {
  console.log(`+----------------------------------------------------------------------+`);
  console.log(`| PARALAX IoT AI Voice Translator - Persistent Server Active           |`);
  console.log(`+----------------------------------------------------------------------+`);
  console.log(`[HTTP REST]  http://0.0.0.0:${port}`);
  console.log(`[WebSocket]  ws://0.0.0.0:${port}/ws/device/stream`);
  console.log(`------------------------------------------------------------------------`);
});

export { server };
