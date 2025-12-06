/**
 * Redis Cache Service
 * 
 * Provides caching for API responses using Upstash Redis
 */

import IORedis from 'ioredis';
import config from '../config/index.js';
import { logger } from '../utils/index.js';

// Get the Redis constructor (ESM compatibility)
const Redis = (IORedis as any).default || IORedis;

// ============================================================================
// Redis Client Singleton
// ============================================================================

let redisClient: InstanceType<typeof Redis> | null = null;
let isConnected = false;

export function getRedis(): InstanceType<typeof Redis> | null {
    if (!config.redis?.url) {
        return null;
    }

    if (!redisClient) {
        try {
            // Parse the Redis URL - handle double REDIS_URL= issue
            let redisUrl = config.redis.url;
            if (redisUrl.startsWith('REDIS_URL=')) {
                redisUrl = redisUrl.replace('REDIS_URL=', '');
            }

            redisClient = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times: number) => Math.min(times * 100, 3000),
                enableReadyCheck: true,
                lazyConnect: true,
            });

            redisClient!.on('connect', () => {
                isConnected = true;
                logger.info('Redis', 'Connected to Upstash Redis');
            });

            redisClient!.on('error', (err: Error) => {
                logger.error('Redis', `Connection error: ${err.message}`);
                isConnected = false;
            });

            redisClient!.on('close', () => {
                isConnected = false;
                logger.info('Redis', 'Connection closed');
            });

            // Connect asynchronously
            redisClient!.connect().catch((err: Error) => {
                logger.error('Redis', `Failed to connect: ${err.message}`);
            });

        } catch (error) {
            logger.error('Redis', `Failed to initialize: ${(error as Error).message}`);
            return null;
        }
    }

    return redisClient;
}

export function isRedisConnected(): boolean {
    return isConnected && redisClient !== null;
}

// ============================================================================
// Cache Operations
// ============================================================================

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get cached data
 */
export async function getCached<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis || !isConnected) return null;

    try {
        const data = await redis.get(key);
        if (data) {
            logger.info('Redis', `Cache HIT: ${key}`);
            return JSON.parse(data) as T;
        }
        logger.info('Redis', `Cache MISS: ${key}`);
        return null;
    } catch (error) {
        logger.error('Redis', `Get error for ${key}: ${(error as Error).message}`);
        return null;
    }
}

/**
 * Set cached data with TTL
 */
export async function setCached<T>(
    key: string,
    data: T,
    ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
    const redis = getRedis();
    if (!redis || !isConnected) return;

    try {
        await redis.setex(key, ttlSeconds, JSON.stringify(data));
        logger.info('Redis', `Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
        logger.error('Redis', `Set error for ${key}: ${(error as Error).message}`);
    }
}

/**
 * Delete cached data
 */
export async function deleteCached(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis || !isConnected) return;

    try {
        await redis.del(key);
        logger.info('Redis', `Cache DELETE: ${key}`);
    } catch (error) {
        logger.error('Redis', `Delete error for ${key}: ${(error as Error).message}`);
    }
}

/**
 * Delete all cached data matching a pattern
 */
export async function deleteCachedPattern(pattern: string): Promise<void> {
    const redis = getRedis();
    if (!redis || !isConnected) return;

    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
            logger.info('Redis', `Cache DELETE pattern: ${pattern} (${keys.length} keys)`);
        }
    } catch (error) {
        logger.error('Redis', `Delete pattern error for ${pattern}: ${(error as Error).message}`);
    }
}

// ============================================================================
// Cache Keys
// ============================================================================

export const CACHE_KEYS = {
    ETF_LIST: 'etf:list',
    ETF_SINGLE: (ticker: string) => `etf:${ticker.toUpperCase()}`,
    COMPARISON: (tickers: string[], period: string) =>
        `comparison:${tickers.sort().join('-')}:${period}`,
};

// ============================================================================
// Cache TTL Constants (in seconds)
// ============================================================================

export const CACHE_TTL = {
    ETF_LIST: 60,        // 1 minute - main list is served from DB
    ETF_SINGLE: 60,      // 1 minute
    COMPARISON: 300,     // 5 minutes - chart data changes less frequently
};

// ============================================================================
// Cleanup
// ============================================================================

export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        isConnected = false;
        logger.info('Redis', 'Connection closed gracefully');
    }
}
