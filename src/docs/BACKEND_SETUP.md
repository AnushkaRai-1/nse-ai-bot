# SentinelQuant Backend Setup Guide

## Overview

SentinelQuant uses a production-grade backend infrastructure built on Supabase Edge Functions with:

- **JWT Authentication** - Secure token-based authentication
- **RBAC (Role-Based Access Control)** - Different permissions for user tiers
- **Real-time WebSocket Streaming** - Live market data delivery
- **External API Integration** - Connect to licensed NSE data providers
- **Security Best Practices** - OWASP guidelines, input validation, rate limiting

## Architecture

```
Frontend (React) 
    ↓
API Service Layer (/services/api.ts)
    ↓
Supabase Edge Functions (Hono Server)
    ↓
├── Authentication (JWT + Supabase Auth)
├── Market Data Provider (NSE APIs)
├── WebSocket Server (Real-time streaming)
└── Database (KV Store for caching/persistence)
```

## Environment Variables

### Required for Production

To connect to actual NSE data providers, configure these environment variables in your Supabase project:

1. **NSE API Credentials** (Required for live market data)
   ```
   NSE_API_KEY=your_nse_api_key_here
   NSE_API_SECRET=your_nse_api_secret_here
   ```

2. **Supabase Credentials** (Auto-configured in Supabase)
   ```
   SUPABASE_URL=auto_configured
   SUPABASE_ANON_KEY=auto_configured
   SUPABASE_SERVICE_ROLE_KEY=auto_configured
   ```

### How to Set Environment Variables

#### In Supabase Dashboard:
1. Go to your Supabase project
2. Navigate to **Settings** → **Edge Functions**
3. Click **Add Secret**
4. Add each secret:
   - Name: `NSE_API_KEY`
   - Value: Your NSE API key
   - Repeat for `NSE_API_SECRET`

#### In Figma Make:
Use the create_supabase_secret tool to prompt users for API keys securely.

## User Roles & Permissions

### Role Hierarchy

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Trial** | Basic AI, Read-only | Free users testing platform |
| **Retail** | Basic AI, Read/Write, Real-time data | Individual investors |
| **Institutional** | Advanced AI, Bulk API, Real-time data | Professional traders, firms |
| **Admin** | All permissions + admin tools | Platform administrators |

### Permission Matrix

```typescript
PERMISSIONS = {
  admin: ['read', 'write', 'delete', 'admin', 'realtime', 'advanced_ai'],
  institutional: ['read', 'write', 'realtime', 'advanced_ai', 'bulk_api'],
  retail: ['read', 'write', 'realtime', 'basic_ai'],
  trial: ['read', 'basic_ai']
}
```

## API Endpoints

### Authentication

#### POST `/auth/signup`
Create new user account
```typescript
Body: {
  email: string;
  password: string;
  name: string;
  role?: 'trial' | 'retail' | 'institutional' | 'admin';
}
Response: { user: { id, email, role } }
```

#### POST `/auth/login`
Authenticate user and get JWT token
```typescript
Body: { email: string; password: string; }
Response: { 
  access_token: string;
  refresh_token: string;
  user: { id, email, role }
}
```

#### GET `/auth/me`
Get current user profile (requires auth)
```typescript
Headers: { Authorization: "Bearer <token>" }
Response: { id, email, role, permissions, metadata }
```

### Market Data

#### GET `/market/quote/:symbol`
Get real-time quote for a symbol
```typescript
Headers: { Authorization: "Bearer <token>" }
Response: MarketQuote
Rate Limit: 100 req/min (500 for institutional, 1000 for admin)
```

#### POST `/market/quotes/batch`
Get multiple quotes at once (requires bulk_api permission)
```typescript
Body: { symbols: string[] } // Max 100 symbols
Response: { quotes: Record<string, MarketQuote>, count: number }
Rate Limit: 20 req/min
```

#### GET `/market/historical/:symbol`
Get historical data
```typescript
Query: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
Response: { symbol, from, to, data: HistoricalData[], count }
Rate Limit: 50 req/min
```

#### GET `/market/index/:index`
Get index data (NIFTY, SENSEX, etc.)
```typescript
Response: MarketQuote
```

#### GET `/market/search`
Search stocks by symbol or name
```typescript
Query: { q: string }
Response: { query, results: Stock[], count }
```

### Portfolio Management

#### GET `/portfolio`
Get user's portfolio
```typescript
Response: { holdings: Holding[], totalValue: number }
```

#### POST `/portfolio`
Update user's portfolio
```typescript
Body: { holdings: Holding[] }
```

#### GET `/watchlist`
Get user's watchlist
```typescript
Response: { symbols: string[] }
```

#### POST `/watchlist`
Add symbol to watchlist
```typescript
Body: { symbol: string }
```

### AI Predictions

#### GET `/ai/predict/:symbol`
Get AI prediction for a symbol (requires basic_ai or advanced_ai)
```typescript
Response: {
  symbol: string;
  prediction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice: number;
  timeHorizon: string;
  model: string;
  timestamp: string;
}
Rate Limit: 30 req/min
```

### Admin

#### GET `/admin/stats`
Get server statistics (admin only)
```typescript
Response: {
  websocket: { totalConnections, totalSubscriptions, ... }
  server: { uptime, memory, ... }
}
```

## WebSocket Real-time Streaming

### Connection

Connect to WebSocket endpoint with JWT token:
```javascript
const ws = new WebSocket(
  `wss://${projectId}.supabase.co/functions/v1/make-server-b2a156fa/ws?token=${accessToken}`
);
```

### Message Protocol

#### Subscribe to symbols
```json
{
  "type": "subscribe",
  "symbols": ["RELIANCE", "TCS", "INFY"]
}
```

#### Receive quote updates
```json
{
  "type": "quote",
  "data": {
    "symbol": "RELIANCE",
    "price": 2845.50,
    "change": 12.30,
    "changePercent": 0.43,
    ...
  }
}
```

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "symbols": ["RELIANCE"]
}
```

#### Heartbeat
```json
{ "type": "ping" }
// Server responds: { "type": "pong" }
```

### Subscription Limits

- **Trial**: 10 symbols
- **Retail**: 100 symbols
- **Institutional**: 500 symbols
- **Admin**: 1000 symbols

## Security Features

### Input Validation
- All inputs sanitized using OWASP guidelines
- Symbol validation: `/^[A-Z0-9]{1,20}$/`
- Email validation: Standard RFC 5322
- Password requirements: Minimum 8 characters

### Rate Limiting
- Per-user, per-endpoint rate limits
- Multipliers based on user role
- 429 response with retry-after information

### Authentication
- JWT tokens with Supabase Auth
- Token validation on every request
- Zero-trust security model

### HTTPS
- All API traffic encrypted via HTTPS
- Supabase Edge Functions auto-configured with SSL

## Frontend Integration

### Using the API Service

```typescript
import { login, getQuote, setAuthToken } from './services/api';

// Login
const { access_token, user } = await login({ 
  email: 'user@example.com', 
  password: 'password123' 
});

// Token is automatically stored
// Now all subsequent requests are authenticated

// Get quote
const quote = await getQuote('RELIANCE');
```

### Using WebSocket Hook

```typescript
import { useMarketData } from './hooks/useMarketData';

function MyComponent() {
  const { quotes, connected, subscribe } = useMarketData({
    symbols: ['RELIANCE', 'TCS'],
    realtime: true
  });

  return (
    <div>
      {connected ? '🟢 Live' : '🔴 Offline'}
      {Array.from(quotes.values()).map(quote => (
        <div key={quote.symbol}>
          {quote.symbol}: ₹{quote.price}
        </div>
      ))}
    </div>
  );
}
```

### Using Single Quote Hook

```typescript
import { useQuote } from './hooks/useMarketData';

function StockCard({ symbol }) {
  const { quote, loading, error, connected } = useQuote(symbol);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!quote) return null;

  return (
    <div>
      <h3>{quote.symbol}</h3>
      <p>₹{quote.price}</p>
      <p className={quote.change > 0 ? 'positive' : 'negative'}>
        {quote.change} ({quote.changePercent}%)
      </p>
    </div>
  );
}
```

## NSE Data Provider Integration

### Supported Providers

The backend is designed to integrate with licensed NSE data providers such as:
- NSE Official API
- Thomson Reuters
- Bloomberg
- Other licensed data vendors

### Integration Steps

1. **Obtain API Credentials**
   - Register with your chosen NSE data provider
   - Obtain API key and secret
   - Review rate limits and terms of service

2. **Configure Environment Variables**
   - Set `NSE_API_KEY` and `NSE_API_SECRET` in Supabase

3. **Update API Calls** (in `/supabase/functions/server/market-data.tsx`)
   ```typescript
   // Replace mock data generation with actual API calls
   const apiKey = Deno.env.get('NSE_API_KEY');
   const response = await fetch(`https://api.nseindia.com/quote/${symbol}`, {
     headers: { 'X-API-Key': apiKey }
   });
   ```

4. **Handle Rate Limits**
   - Implement provider-specific rate limiting
   - Add retry logic with exponential backoff
   - Cache frequently accessed data

5. **Error Handling**
   - Log API errors comprehensively
   - Implement fallback mechanisms
   - Monitor API health

## Production Deployment Checklist

- [ ] Configure NSE API credentials
- [ ] Set up Supabase project with production tier
- [ ] Enable Supabase Auth with email verification
- [ ] Configure allowed domains in Supabase Auth settings
- [ ] Set up SSL certificates (auto-handled by Supabase)
- [ ] Implement monitoring and logging
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure CORS for production domain
- [ ] Review and test rate limits
- [ ] Enable Supabase database backups
- [ ] Document API for third-party integrations
- [ ] Set up CI/CD pipeline
- [ ] Run security audit
- [ ] Load testing for WebSocket connections
- [ ] Compliance review (data protection, financial regulations)

## Monitoring & Debugging

### Server Logs
```bash
# View Edge Function logs in Supabase Dashboard
# Navigate to: Edge Functions → make-server-b2a156fa → Logs
```

### WebSocket Debugging
```javascript
// Enable verbose logging
const ws = getWebSocketInstance();
ws.on('*', (data) => console.log('WS Message:', data));
```

### API Debugging
```javascript
// All API errors are logged to console
// Check browser DevTools → Console for detailed error messages
```

## Support & Resources

- **Supabase Documentation**: https://supabase.com/docs
- **NSE API Documentation**: (Refer to your provider's docs)
- **OWASP Security Guidelines**: https://owasp.org/
- **JWT Best Practices**: https://jwt.io/introduction

## License & Compliance

⚠️ **Important**: Ensure you have proper licensing for market data usage. Unauthorized redistribution of NSE data is prohibited. Review your data provider's terms of service.

## Next Steps

1. Set up NSE API credentials
2. Test authentication flow
3. Verify WebSocket connections
4. Implement user registration flow
5. Deploy to production
6. Monitor and optimize
