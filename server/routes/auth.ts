import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { createAdminJwt, verifyAdminJwt } from '../middleware/auth.js';
import { redis } from '../db/redis.js';

export const authRoutes = new Hono();

// Default admin credentials for dev if not configured
const DEFAULT_DEV_HASH = '$2b$12$o9aRZiyQVAlGdrcUJfIWvuiW1NcBFlbPzckDXzfUdsbuXx9esIs4.'; // "admin123"

authRoutes.post('/login', async (c) => {
  const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // Throttle login attempts: max 5 per 15 minutes per IP
  const allowed = await redis.checkLoginThrottle(clientIp, 5, 900);
  if (!allowed) {
    return c.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many failed login attempts. Please try again in 15 minutes.',
          retry_after_sec: 900,
        },
      },
      429
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: 'invalid_request',
          message: 'Invalid JSON request body',
        },
      },
      400
    );
  }

  const { email, password } = body || {};
  if (!email || !password) {
    return c.json(
      {
        error: {
          code: 'invalid_credentials',
          message: 'Email and password are required',
        },
      },
      400
    );
  }

  const expectedEmail = process.env.ADMIN_EMAIL || 'admin@paralax.local';
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || DEFAULT_DEV_HASH;

  if (email.toLowerCase().trim() !== expectedEmail.toLowerCase().trim()) {
    return c.json(
      {
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password',
        },
      },
      401
    );
  }

  const passwordMatches = await bcrypt.compare(password, expectedHash);
  if (!passwordMatches) {
    return c.json(
      {
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password',
        },
      },
      401
    );
  }

  const token = await createAdminJwt(email);
  const isProd = process.env.NODE_ENV === 'production';

  setCookie(c, 'paralax_admin_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: 12 * 3600,
  });

  return c.json({
    success: true,
    token, // Also return in body for mobile/testing clients
    user: {
      email,
      role: 'admin',
    },
  });
});

authRoutes.post('/logout', async (c) => {
  deleteCookie(c, 'paralax_admin_token', {
    path: '/',
  });
  return c.json({ success: true, message: 'Logged out successfully' });
});

authRoutes.get('/me', async (c) => {
  let token = getCookie(c, 'paralax_admin_token');
  if (!token) {
    const authHeader = c.req.header('authorization') || c.req.header('Authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'No active session',
        },
      },
      401
    );
  }

  const user = await verifyAdminJwt(token);
  if (!user) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Session has expired or is invalid',
        },
      },
      401
    );
  }

  return c.json({
    authenticated: true,
    user: {
      email: user.email,
      role: user.role,
    },
  });
});
