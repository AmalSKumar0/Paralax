import { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import * as jose from 'jose';
import { redis, DeviceRecord, ApiKeyRecord } from '../db/redis.js';

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'paralax-default-dev-secret-change-in-prod-32-bytes!';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export async function createAdminJwt(email: string): Promise<string> {
  return await new jose.SignJWT({ email, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(JWT_SECRET);
}

export async function verifyAdminJwt(token: string): Promise<{ email: string; role: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
    return payload as unknown as { email: string; role: string };
  } catch {
    return null;
  }
}

/**
 * Admin authentication middleware.
 * Verifies the paralax_admin_token cookie or Bearer token.
 * Enforces X-Requested-With header on state-changing requests (CSRF protection).
 */
export const adminAuthMiddleware: MiddlewareHandler = async (c, next) => {
  // CSRF protection for state-changing admin requests
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (stateChangingMethods.includes(c.req.method.toUpperCase())) {
    const requestedWith = c.req.header('x-requested-with') || c.req.header('X-Requested-With');
    if (!requestedWith) {
      return c.json(
        {
          error: {
            code: 'missing_csrf_header',
            message: 'X-Requested-With header is required on state-changing admin requests',
          },
        },
        403
      );
    }
  }

  // Extract token from cookie or Authorization header
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
          message: 'Admin authentication required',
        },
      },
      401
    );
  }

  const payload = await verifyAdminJwt(token);
  if (!payload) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Invalid or expired admin session token',
        },
      },
      401
    );
  }

  c.set('adminUser', payload);
  await next();
};

/**
 * Device authentication middleware.
 * Requires X-Device-Key header, looks up key in Redis, uses constant-time compare,
 * and attaches active device to context.
 */
export const deviceAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const deviceKey = c.req.header('x-device-key') || c.req.header('X-Device-Key');
  if (!deviceKey) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Missing X-Device-Key header',
        },
      },
      401
    );
  }

  const device = await redis.findDeviceByKey(deviceKey);
  if (!device) {
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Invalid or revoked device key',
        },
      },
      401
    );
  }

  if (device.status !== 'active') {
    return c.json(
      {
        error: {
          code: 'device_inactive',
          message: `Device is currently ${device.status}`,
        },
      },
      403
    );
  }

  c.set('device', device);
  await next();
};

/**
 * Utterance authentication middleware.
 * Allows either admin cookie/token or x-api-key machine token.
 */
export const utteranceAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header('x-api-key') || c.req.header('X-Api-Key');
  if (apiKey) {
    const keyRecord = await redis.findApiKey(apiKey);
    if (keyRecord && keyRecord.status === 'active') {
      c.set('authType', 'api_key');
      c.set('apiKey', keyRecord);
      return await next();
    }
    return c.json(
      {
        error: {
          code: 'unauthorized',
          message: 'Invalid or revoked API key',
        },
      },
      401
    );
  }

  // Otherwise check admin auth
  let token = getCookie(c, 'paralax_admin_token');
  if (!token) {
    const authHeader = c.req.header('authorization') || c.req.header('Authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (token) {
    const payload = await verifyAdminJwt(token);
    if (payload) {
      c.set('authType', 'admin');
      c.set('adminUser', payload);
      return await next();
    }
  }

  return c.json(
    {
      error: {
        code: 'unauthorized',
        message: 'Authentication required via x-api-key or admin session',
      },
    },
    401
  );
};
