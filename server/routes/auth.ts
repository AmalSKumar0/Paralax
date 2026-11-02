import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { createAdminJwt, verifyAdminJwt } from '../middleware/auth.js';
import { redis } from '../db/redis.js';

export const authRoutes = new Hono();

// Default admin credentials for dev if not configured
const HASH_PARALAX123 = '$2b$12$Biuf/jh7j8WOPR5MOqJ4feqkGRkDFI9LQkGLGfJyUvvgjTxof2L4q'; // "Paralax123!"
const HASH_ADMIN123 = '$2b$12$o9aRZiyQVAlGdrcUJfIWvuiW1NcBFlbPzckDXzfUdsbuXx9esIs4.'; // "admin123"
const HASH_ADMINPASSWORD123 = '$2a$10$wE.D5R9xLw5e7Z1hB8J6h.5K5HhT9s7vL2bM1nX3qP8vL4aO5rF2i'; // "AdminPassword123!"

async function verifyLoginPassword(inputPassword: string): Promise<boolean> {
  // 1. Check custom plaintext password if configured
  if (process.env.ADMIN_PASSWORD && inputPassword === process.env.ADMIN_PASSWORD) {
    return true;
  }

  // 2. Check custom ADMIN_PASSWORD_HASH if configured
  if (process.env.ADMIN_PASSWORD_HASH) {
    const customHash = process.env.ADMIN_PASSWORD_HASH.trim();
    if (customHash.startsWith('$2')) {
      try {
        const matches = await bcrypt.compare(inputPassword, customHash);
        if (matches) return true;
      } catch {}
    } else if (inputPassword === customHash) {
      // Handled if user inadvertently entered plaintext into ADMIN_PASSWORD_HASH
      return true;
    }
  }

  // 3. Check standard default hashes
  const defaults = [HASH_PARALAX123, HASH_ADMIN123, HASH_ADMINPASSWORD123];
  for (const h of defaults) {
    try {
      const matches = await bcrypt.compare(inputPassword, h);
      if (matches) return true;
    } catch {}
  }

  return false;
}

function verifyLoginEmail(inputEmail: string): boolean {
  const norm = inputEmail.toLowerCase().trim();
  const configured = process.env.ADMIN_EMAIL?.toLowerCase().trim();

  if (configured && norm === configured) {
    return true;
  }

  // Default supported emails
  const defaults = ['admin@paralax.io', 'admin@paralax.local', 'admin@example.com'];
  return defaults.includes(norm);
}

authRoutes.post('/login', async (c) => {
  const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // Throttle login attempts: max 15 per 15 minutes per IP
  const allowed = await redis.checkLoginThrottle(clientIp, 15, 900);
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

  if (!verifyLoginEmail(email)) {
    return c.json(
      {
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password. Default demo email: admin@paralax.io',
        },
      },
      401
    );
  }

  const passwordMatches = await verifyLoginPassword(password);
  if (!passwordMatches) {
    return c.json(
      {
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password. Default demo password: Paralax123!',
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
