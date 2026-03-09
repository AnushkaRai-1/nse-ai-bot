import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { Context } from 'npm:hono';

// User roles for RBAC
export enum UserRole {
  ADMIN = 'admin',
  INSTITUTIONAL = 'institutional',
  RETAIL = 'retail',
  TRIAL = 'trial'
}

// Role permissions matrix
export const PERMISSIONS = {
  [UserRole.ADMIN]: ['read', 'write', 'delete', 'admin', 'realtime', 'advanced_ai'],
  [UserRole.INSTITUTIONAL]: ['read', 'write', 'realtime', 'advanced_ai', 'bulk_api'],
  [UserRole.RETAIL]: ['read', 'write', 'realtime', 'basic_ai'],
  [UserRole.TRIAL]: ['read', 'basic_ai']
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: string[];
  metadata?: any;
}

/**
 * Extract and verify JWT token from Authorization header
 * Implements zero-trust authentication
 */
export async function authenticateRequest(c: Context): Promise<AuthenticatedUser | null> {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    
    // Validate token format (basic check)
    if (!token || token.length < 20) {
      console.log('Invalid token format');
      return null;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Verify token with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('Authentication error:', error?.message);
      return null;
    }

    // Extract role from user metadata (default to TRIAL)
    const role = (user.user_metadata?.role as UserRole) || UserRole.TRIAL;
    const permissions = PERMISSIONS[role] || [];

    return {
      id: user.id,
      email: user.email ?? '',
      role,
      permissions,
      metadata: user.user_metadata
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const user = await authenticateRequest(c);
  
  if (!user) {
    return c.json({ error: 'Unauthorized - Invalid or missing authentication token' }, 401);
  }

  // Attach user to context
  c.set('user', user);
  await next();
}

/**
 * Middleware to require specific role
 */
export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get('user') as AuthenticatedUser;
    
    if (!user) {
      return c.json({ error: 'Unauthorized - No user context' }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ 
        error: 'Forbidden - Insufficient permissions',
        required: roles,
        current: user.role
      }, 403);
    }

    await next();
  };
}

/**
 * Middleware to require specific permission
 */
export function requirePermission(...permissions: string[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get('user') as AuthenticatedUser;
    
    if (!user) {
      return c.json({ error: 'Unauthorized - No user context' }, 401);
    }

    const hasPermission = permissions.some(p => user.permissions.includes(p));
    
    if (!hasPermission) {
      return c.json({ 
        error: 'Forbidden - Missing required permission',
        required: permissions,
        available: user.permissions
      }, 403);
    }

    await next();
  };
}

/**
 * Rate limiting based on user role
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get('user') as AuthenticatedUser;
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Higher limits for institutional users
    const multiplier = user.role === UserRole.INSTITUTIONAL ? 5 : 
                       user.role === UserRole.ADMIN ? 10 : 1;
    const limit = maxRequests * multiplier;

    const now = Date.now();
    const key = `${user.id}:${c.req.path}`;
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (record.count >= limit) {
      return c.json({ 
        error: 'Rate limit exceeded',
        limit,
        resetAt: new Date(record.resetAt).toISOString()
      }, 429);
    }

    record.count++;
    await next();
  };
}
