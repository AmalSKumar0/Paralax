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

server.listen(port, () => {
  console.log(`+----------------------------------------------------------------------+`);
  console.log(`| PARALAX IoT AI Voice Translator - Persistent Server Active           |`);
  console.log(`+----------------------------------------------------------------------+`);
  console.log(`[HTTP REST]  http://localhost:${port}`);
  console.log(`[WebSocket]  ws://localhost:${port}/ws/device/stream`);
  console.log(`------------------------------------------------------------------------`);
});

export { server };
