import { Hono } from 'hono';
import { postgres } from '../../db/postgres.js';

export const adminConversationRoutes = new Hono();

// GET /admin/conversations
adminConversationRoutes.get('/', async (c) => {
  const deviceId = c.req.query('device_id');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const convs = await postgres.listConversations({
    deviceId,
    limit,
    offset,
  });

  return c.json({
    conversations: convs,
    items: convs,
    total: convs.length,
    limit,
    offset,
  });
});

// GET /admin/conversations/:id
adminConversationRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const conv = await postgres.getConversation(id);
  if (!conv) {
    return c.json({ error: { code: 'conversation_not_found', message: `Conversation '${id}' not found` } }, 404);
  }

  const jobs = await postgres.listConversationJobs(id);

  return c.json({
    ...conv,
    jobs,
  });
});
