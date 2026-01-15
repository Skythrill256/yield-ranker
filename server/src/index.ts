/**
 * Yield Ranker API Server (Railway + Vercel Compatible)
 */

// ============================================================================
// Early startup logging (Railway debugging)
// ============================================================================
console.log('[STARTUP] Server starting...');
console.log('[STARTUP] PORT env:', process.env.PORT);
console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV);
console.log('[STARTUP] SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('[STARTUP] SUPABASE_SERVICE_ROLE_KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('[STARTUP] TIINGO_API_KEY set:', !!process.env.TIINGO_API_KEY);

// ============================================================================
// Imports
// ============================================================================
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';

import config, { validateConfig } from './config/index.js';
import { logger } from './utils/index.js';
import { getRedis, closeRedis } from './services/redis.js';

import tiingoRoutes from './routes/tiingo.js';
import etfRoutes from './routes/etfs.js';
import cefRoutes from './routes/cefs.js';
import userRoutes from './routes/user.js';
import newsletterRoutes from './routes/newsletter.js';
import contactRoutes from './routes/contact.js';
import adminNewsletterRoutes from './routes/admin/newsletters.js';
import publicNewsletterRoutes from './routes/public-newsletters.js';

// ============================================================================
// Config Validation (non-fatal)
// ============================================================================
try {
  validateConfig();
  logger.info('Config', 'Configuration validated successfully');
} catch (error) {
  logger.warn(
    'Config',
    `Configuration warning: ${(error as Error).message}. Starting anyway...`
  );
}

// ============================================================================
// App Init
// ============================================================================
const app: Express = express();

// ============================================================================
// CORS Configuration (PRODUCTION SAFE)
// ============================================================================

const allowedOrigins = new Set([
  // Local development
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8081',
  "https://yield-ranker-c5dsa07xx-richard-l-hills-projects.vercel.app",
  // Production domains
  'https://dividendsandtotalreturns.com',
  'https://www.dividendsandtotalreturns.com',

  // Stable Vercel domain
  'https://yield-ranker-two.vercel.app',
]);

logger.info('CORS', `Base allowed origins: ${Array.from(allowedOrigins).join(', ')}`);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (curl, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Exact match
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    // Allow all Vercel preview deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // Block everything else
    logger.warn('CORS', `Blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================================================
// Body Parsers
// ============================================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// Request Logging Middleware
// ============================================================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ============================================================================
// Health Check
// ============================================================================
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// ============================================================================
// API Routes
// ============================================================================
app.use('/api/tiingo', tiingoRoutes);
app.use('/api/etfs', etfRoutes);
app.use('/api/cefs', cefRoutes);
app.use('/api/admin/newsletters', adminNewsletterRoutes);  // MUST be before /api/admin
app.use('/api/admin', etfRoutes); // legacy
app.use('/api/user', userRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/public-newsletters', publicNewsletterRoutes);
app.use('/api', contactRoutes);


// ============================================================================
// 404 Handler
// ============================================================================
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// ============================================================================
// Global Error Handler
// ============================================================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  logger.error('ERROR', err.message, err.stack);
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : err.message,
  });
});

// ============================================================================
// Cache Warmup
// ============================================================================
async function warmUpCache() {
  try {
    const { getSupabase } = await import('./services/database.js');
    const { setCached, CACHE_KEYS, CACHE_TTL } = await import('./services/redis.js');

    logger.info('Cache', 'Warming up ETF cache...');

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('etf_static')
      .select('*')
      .order('ticker', { ascending: true })
      .limit(10000);

    if (error) {
      logger.error('Cache', error.message);
      return;
    }

    const results = (data || []).map((etf: any) => ({
      ticker: etf.ticker,
      symbol: etf.ticker,
      issuer: etf.issuer,
      description: etf.description,
      pay_day_text: etf.pay_day_text,
      pay_day: etf.pay_day_text,
      payments_per_year: etf.payments_per_year,
      ipo_price: etf.ipo_price,
      price: etf.price,
      price_change: etf.price_change,
      price_change_pct: etf.price_change_pct,
      dividend: etf.last_dividend,
      last_dividend: etf.last_dividend,
      annual_div: etf.annual_dividend,
      annual_dividend: etf.annual_dividend,
      forward_yield: etf.forward_yield,
      dividend_sd: etf.dividend_sd,
      dividend_cv: etf.dividend_cv,
      dividend_cv_percent: etf.dividend_cv_percent,
      dividend_volatility_index: etf.dividend_volatility_index,
      week_52_high: etf.week_52_high,
      week_52_low: etf.week_52_low,
      tr_drip_3y: etf.tr_drip_3y,
      tr_drip_12m: etf.tr_drip_12m,
      tr_drip_6m: etf.tr_drip_6m,
      tr_drip_3m: etf.tr_drip_3m,
      tr_drip_1m: etf.tr_drip_1m,
      tr_drip_1w: etf.tr_drip_1w,
      last_updated: etf.last_updated || etf.updated_at,
      weighted_rank: etf.weighted_rank,
    }));

    await setCached(
      CACHE_KEYS.ETF_LIST,
      {
        data: results,
        last_updated: new Date().toISOString(),
        last_updated_timestamp: new Date().toISOString(),
      },
      CACHE_TTL.ETF_LIST
    );

    logger.info('Cache', `✅ Cache warmed with ${results.length} ETFs`);
  } catch (err) {
    logger.error('Cache', (err as Error).message);
  }
}

// ============================================================================
// Start Server (Railway required)
// ============================================================================
const PORT = Number(process.env.PORT) || config.port || 4000;

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('Server', `🚀 Server running on 0.0.0.0:${PORT}`);

  if (config.redis?.url) {
    getRedis();
    setTimeout(warmUpCache, 1000);
  } else {
    warmUpCache();
  }
});

// ============================================================================
// Process-level Error Visibility
// ============================================================================
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT', err.message, err.stack);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('UNHANDLED', reason?.message || reason);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================
async function gracefulShutdown(signal: string) {
  logger.info('Server', `${signal} received. Shutting down...`);
  await closeRedis();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;