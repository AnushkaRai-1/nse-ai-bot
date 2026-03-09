import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from "./kv_store.tsx";

import { 
  requireAuth, 
  requireRole, 
  requirePermission, 
  rateLimit, 
  UserRole,
  type AuthenticatedUser 
} from "./auth.tsx";
import {
  getRealtimeQuote,
  getHistoricalData,
  getBatchQuotes,
  getIndexData,
  searchStocks,
  validateAPICredentials
} from "./market-data.tsx";
import {
  handleWebSocket,
  startMarketDataStream,
  startHeartbeat,
  getWebSocketStats
} from "./websocket.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const app = new Hono().basePath('/server');
// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ============================================================================
// Public Routes (No Authentication Required)
// ============================================================================

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: Deno.env.get('DENO_ENV') || 'development'
  });
});

// ============================================================================
// Authentication Routes
// ============================================================================

/**
 * User signup
 * Creates a new user with specified role
 */
app.post("/auth/signup", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, role } = body;

    // Input validation (OWASP guidelines)
    if (!email || !password || !name) {
      return c.json({ error: 'Missing required fields: email, password, name' }, 400);
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Password strength validation
    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Validate role (default to TRIAL)
    const userRole = role && Object.values(UserRole).includes(role) ? role : UserRole.TRIAL;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: userRole },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.error('Signup error:', error.message);
      return c.json({ error: error.message }, 400);
    }

    console.log(`New user created: ${email} with role ${userRole}`);

    return c.json({ 
      message: 'User created successfully',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        role: userRole
      }
    }, 201);
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
});

/**
 * User login
 * Returns access token for authenticated requests
 */
app.post("/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'Missing email or password' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log('Login failed for:', email, error.message);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    console.log(`User logged in: ${email}`);

    return c.json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        role: data.user?.user_metadata?.role || UserRole.TRIAL
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Internal server error during login' }, 500);
  }
});

/**
 * Get current user profile
 */
app.get("/auth/me", requireAuth, async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  
  return c.json({
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    metadata: user.metadata
  });
});

// ============================================================================
// Market Data Routes (Authenticated)
// ============================================================================

/**
 * Get real-time quote for a symbol
 * Rate limited: 100 requests per minute
 */
app.get("/market/quote/:symbol", 
  requireAuth, 
  rateLimit(100, 60000),
  async (c) => {
    try {
      const symbol = c.req.param('symbol').toUpperCase();
      
      // Input validation
      if (!/^[A-Z0-9]{1,20}$/.test(symbol)) {
        return c.json({ error: 'Invalid symbol format' }, 400);
      }

      const quote = await getRealtimeQuote(symbol);
      
      if (!quote) {
        return c.json({ error: 'Quote not found' }, 404);
      }

      return c.json(quote);
    } catch (error) {
      console.error('Quote fetch error:', error);
      return c.json({ error: 'Error fetching quote' }, 500);
    }
  }
);

/**
 * Get batch quotes (Institutional users only)
 * Rate limited: 20 requests per minute
 */
app.post("/market/quotes/batch",
  requireAuth,
  requirePermission('bulk_api'),
  rateLimit(20, 60000),
  async (c) => {
    try {
      const body = await c.req.json();
      const { symbols } = body;

      if (!Array.isArray(symbols) || symbols.length === 0) {
        return c.json({ error: 'Invalid symbols array' }, 400);
      }

      if (symbols.length > 100) {
        return c.json({ error: 'Maximum 100 symbols per request' }, 400);
      }

      // Validate all symbols
      const validSymbols = symbols.filter(s => /^[A-Z0-9]{1,20}$/.test(s.toUpperCase()));
      
      const quotes = await getBatchQuotes(validSymbols);
      
      return c.json({
        quotes: Object.fromEntries(quotes),
        count: quotes.size
      });
    } catch (error) {
      console.error('Batch quote error:', error);
      return c.json({ error: 'Error fetching batch quotes' }, 500);
    }
  }
);

/**
 * Get historical data for a symbol
 * Rate limited: 50 requests per minute
 */
app.get("/market/historical/:symbol",
  requireAuth,
  rateLimit(50, 60000),
  async (c) => {
    try {
      const symbol = c.req.param('symbol').toUpperCase();
      const from = c.req.query('from');
      const to = c.req.query('to');

      if (!from || !to) {
        return c.json({ error: 'Missing required parameters: from, to' }, 400);
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(from) || !dateRegex.test(to)) {
        return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
      }

      const data = await getHistoricalData(symbol, from, to);

      return c.json({
        symbol,
        from,
        to,
        data,
        count: data.length
      });
    } catch (error) {
      console.error('Historical data error:', error);
      return c.json({ error: 'Error fetching historical data' }, 500);
    }
  }
);

/**
 * Get index data (NIFTY, SENSEX, etc.)
 */
app.get("/market/index/:index",
  requireAuth,
  rateLimit(100, 60000),
  async (c) => {
    try {
      const index = c.req.param('index').toUpperCase();
      
      const data = await getIndexData(index);
      
      if (!data) {
        return c.json({ error: 'Index not found' }, 404);
      }

      return c.json(data);
    } catch (error) {
      console.error('Index data error:', error);
      return c.json({ error: 'Error fetching index data' }, 500);
    }
  }
);

/**
 * Search stocks by symbol or name
 */
app.get("/market/search",
  requireAuth,
  rateLimit(50, 60000),
  async (c) => {
    try {
      const query = c.req.query('q');

      if (!query || query.length < 1) {
        return c.json({ error: 'Search query required (minimum 1 character)' }, 400);
      }

      // Sanitize input
      const sanitizedQuery = query.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);

      const results = await searchStocks(sanitizedQuery);

      return c.json({
        query: sanitizedQuery,
        results,
        count: results.length
      });
    } catch (error) {
      console.error('Search error:', error);
      return c.json({ error: 'Error searching stocks' }, 500);
    }
  }
);

// ============================================================================
// Portfolio Management Routes
// ============================================================================

/**
 * Get user's portfolio
 */
app.get("/portfolio",
  requireAuth,
  async (c) => {
    try {
      const user = c.get('user') as AuthenticatedUser;
      const portfolioKey = `portfolio:${user.id}`;
      
      const portfolio = await kv.get(portfolioKey);
      
      if (!portfolio) {
        return c.json({ holdings: [], totalValue: 0 });
      }

      return c.json(JSON.parse(portfolio));
    } catch (error) {
      console.error('Portfolio fetch error:', error);
      return c.json({ error: 'Error fetching portfolio' }, 500);
    }
  }
);

/**
 * Update user's portfolio
 */
app.post("/portfolio",
  requireAuth,
  async (c) => {
    try {
      const user = c.get('user') as AuthenticatedUser;
      const body = await c.req.json();
      
      // Validate portfolio data
      if (!body.holdings || !Array.isArray(body.holdings)) {
        return c.json({ error: 'Invalid portfolio format' }, 400);
      }

      const portfolioKey = `portfolio:${user.id}`;
      await kv.set(portfolioKey, JSON.stringify(body));

      console.log(`Portfolio updated for user ${user.email}`);

      return c.json({ message: 'Portfolio updated successfully' });
    } catch (error) {
      console.error('Portfolio update error:', error);
      return c.json({ error: 'Error updating portfolio' }, 500);
    }
  }
);

/**
 * Get user's watchlist
 */
app.get("/watchlist",
  requireAuth,
  async (c) => {
    try {
      const user = c.get('user') as AuthenticatedUser;
      const watchlistKey = `watchlist:${user.id}`;
      
      const watchlist = await kv.get(watchlistKey);
      
      if (!watchlist) {
        return c.json({ symbols: [] });
      }

      return c.json(JSON.parse(watchlist));
    } catch (error) {
      console.error('Watchlist fetch error:', error);
      return c.json({ error: 'Error fetching watchlist' }, 500);
    }
  }
);

/**
 * Add symbol to watchlist
 */
app.post("/watchlist",
  requireAuth,
  async (c) => {
    try {
      const user = c.get('user') as AuthenticatedUser;
      const body = await c.req.json();
      const { symbol } = body;

      if (!symbol || typeof symbol !== 'string') {
        return c.json({ error: 'Invalid symbol' }, 400);
      }

      const watchlistKey = `watchlist:${user.id}`;
      const existing = await kv.get(watchlistKey);
      const watchlist = existing ? JSON.parse(existing) : { symbols: [] };

      if (!watchlist.symbols.includes(symbol.toUpperCase())) {
        watchlist.symbols.push(symbol.toUpperCase());
        await kv.set(watchlistKey, JSON.stringify(watchlist));
      }

      return c.json(watchlist);
    } catch (error) {
      console.error('Watchlist add error:', error);
      return c.json({ error: 'Error adding to watchlist' }, 500);
    }
  }
);

// ============================================================================
// AI Predictions Routes (Requires advanced_ai permission)
// ============================================================================

/**
 * Get AI prediction for a symbol
 */
app.get("/ai/predict/:symbol",
  requireAuth,
  requirePermission('basic_ai', 'advanced_ai'),
  rateLimit(30, 60000),
  async (c) => {
    try {
      const symbol = c.req.param('symbol').toUpperCase();
      const user = c.get('user') as AuthenticatedUser;
      
      const cacheKey = `prediction:${symbol}`;
      const cached = await kv.get(cacheKey);
      
      if (cached) {
        return c.json(JSON.parse(cached));
      }

      // Mock AI prediction (in production, call actual ML model)
      const prediction = {
        symbol,
        prediction: 'BUY',
        confidence: Math.random() * 30 + 70,
        targetPrice: Math.random() * 1000 + 500,
        timeHorizon: '30d',
        model: user.permissions.includes('advanced_ai') ? 'LSTM-DQN' : 'Basic',
        timestamp: new Date().toISOString()
      };

      await kv.set(cacheKey, JSON.stringify(prediction), 300); // Cache 5 minutes

      return c.json(prediction);
    } catch (error) {
      console.error('AI prediction error:', error);
      return c.json({ error: 'Error generating prediction' }, 500);
    }
  }
);

// ============================================================================
// Admin Routes (Admin only)
// ============================================================================

/**
 * Get server statistics
 */
app.get("/admin/stats",
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (c) => {
    try {
      const wsStats = getWebSocketStats();
      
      return c.json({
        websocket: wsStats,
        server: {
          uptime: Deno.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Stats error:', error);
      return c.json({ error: 'Error fetching statistics' }, 500);
    }
  }
);

// ============================================================================
// WebSocket Route
// ============================================================================

/**
 * WebSocket endpoint for real-time market data
 * wss://[project].supabase.co/functions/v1/server/ws
 */
app.get("/ws", async (c) => {
  return await handleWebSocket(c.req.raw);
});

// ============================================================================
// Error Handling
// ============================================================================

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ 
    error: 'Internal server error',
    message: err.message 
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ============================================================================
// Server Initialization
// ============================================================================

// Validate API credentials on startup
validateAPICredentials().then((valid) => {
  if (valid) {
    console.log('✅ NSE API credentials validated');
  } else {
    console.log('⚠️  Using mock data - NSE API credentials not configured');
    console.log('   Set NSE_API_KEY and NSE_API_SECRET environment variables');
  }
});

// Start WebSocket services
startMarketDataStream();
startHeartbeat();

console.log('🚀 SentinelQuant Backend Server initialized');
console.log('📊 Real-time WebSocket streaming active');
console.log('🔒 JWT Authentication enabled');
console.log('🛡️  RBAC security enforced');

Deno.serve(app.fetch);
