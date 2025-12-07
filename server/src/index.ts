
/**
 * Yield Ranker API Server (Railway Compatible)
 */

// Early startup logging for Railway debugging
console.log('[STARTUP] Server starting...');
console.log('[STARTUP] PORT env:', process.env.PORT);
console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV);
console.log('[STARTUP] SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('[STARTUP] SUPABASE_SERVICE_ROLE_KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('[STARTUP] TIINGO_API_KEY set:', !!process.env.TIINGO_API_KEY);

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";

import config, { validateConfig } from "./config/index.js";
import { logger } from "./utils/index.js";
import { getRedis, closeRedis } from "./services/redis.js";

import tiingoRoutes from "./routes/tiingo.js";
import etfRoutes from "./routes/etfs.js";
import userRoutes from "./routes/user.js";

// ============================================================================
// Config Validation (No more crashing server)
// ============================================================================
try {
  validateConfig();
  logger.info("Config", "Configuration validated successfully");
} catch (error) {
  logger.warn(
    "Config",
    `Configuration warning: ${(error as Error).message}. Starting anyway...`
  );
}

const app: Express = express();

// ============================================================================
// Middleware
// ============================================================================

// Log CORS origins for debugging
console.log('[CORS] Allowed origins:', config.cors.origins);

// Configure CORS - Use permissive settings for production
const corsOptions = {
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";
    logger[level]("HTTP", `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ============================================================================
// Health Check Route
// ============================================================================
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// ============================================================================
// API Routes
// ============================================================================
app.use("/api/tiingo", tiingoRoutes);
app.use("/api/etfs", etfRoutes);
app.use("/api/admin", etfRoutes); // Legacy
app.use("/api/user", userRoutes);

// ============================================================================
// 404 Handler
// ============================================================================
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found" });
});

// ============================================================================
// Global Error Handler
// ============================================================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  logger.error("ERROR", err.message, err.stack);
  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : err.message,
  });
});

// ============================================================================
// Start Server (Railway-required)
// ============================================================================
const PORT = Number(process.env.PORT) || config.port || 3000;

// Warm up cache on startup
async function warmUpCache() {
  try {
    const { getSupabase } = await import("./services/database.js");
    const { setCached, CACHE_KEYS, CACHE_TTL } = await import("./services/redis.js");

    logger.info("Cache", "Warming up ETF cache...");

    const supabase = getSupabase();
    const staticResult = await supabase
      .from('etf_static')
      .select('*')
      .order('ticker', { ascending: true })
      .limit(10000);

    if (staticResult.error) {
      logger.error("Cache", `Failed to warm cache: ${staticResult.error.message}`);
      return;
    }

    const staticData = staticResult.data || [];

    // Map to frontend format (same as in routes)
    const results = staticData.map((etf: any) => ({
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
      price_return_3y: etf.price_return_3y,
      price_return_12m: etf.price_return_12m,
      price_return_6m: etf.price_return_6m,
      price_return_3m: etf.price_return_3m,
      price_return_1m: etf.price_return_1m,
      price_return_1w: etf.price_return_1w,
      three_year_annualized: etf.tr_drip_3y,
      total_return_12m: etf.tr_drip_12m,
      total_return_6m: etf.tr_drip_6m,
      total_return_3m: etf.tr_drip_3m,
      total_return_1m: etf.tr_drip_1m,
      total_return_1w: etf.tr_drip_1w,
      last_updated: etf.last_updated || etf.updated_at,
      weighted_rank: etf.weighted_rank,
    }));

    const response = {
      data: results,
      last_updated: new Date().toISOString(),
      last_updated_timestamp: new Date().toISOString(),
    };

    await setCached(CACHE_KEYS.ETF_LIST, response, CACHE_TTL.ETF_LIST);
    logger.info("Cache", `✅ Cache warmed with ${results.length} ETFs`);
  } catch (error) {
    logger.error("Cache", `Failed to warm cache: ${(error as Error).message}`);
  }
}

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info("Server", `🚀 Server running on 0.0.0.0:${PORT}`);

  // Initialize Redis connection and warm up cache
  if (config.redis?.url) {
    getRedis();
    // Warm up cache after a short delay to ensure Redis is connected
    setTimeout(() => warmUpCache(), 1000);
  } else {
    // Even without Redis, still warm up by just triggering the DB query
    warmUpCache();
  }
});

// ============================================================================
// Error Visibility (Log crashes instead of silent death)
// ============================================================================
process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT", err.message, err.stack);
});

process.on("unhandledRejection", (reason: any) => {
  logger.error("UNHANDLED", reason?.message || reason);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================
async function gracefulShutdown(signal: string) {
  logger.info("Server", `${signal} received. Shutting down...`);
  await closeRedis();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
