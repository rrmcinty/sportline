/**
 * Simple disk cache for ESPN API responses
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), ".cache");

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Initialize cache directory
 */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Generate cache key from URL
 */
function getCacheKey(url: string): string {
  return Buffer.from(url).toString("base64").replace(/[/+=]/g, "_");
}

/**
 * Get cached data if available and not expired
 */
export function getCache<T>(url: string): T | null {
  ensureCacheDir();
  const key = getCacheKey(url);
  const cachePath = join(CACHE_DIR, `${key}.json`);

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(content);
    const now = Date.now();

    if (now - entry.timestamp > entry.ttl) {
      // Expired
      return null;
    }

    return entry.data;
  } catch (error) {
    // Invalid cache file
    return null;
  }
}

/**
 * Set cache data with TTL
 * @param url Cache key (URL)
 * @param data Data to cache
 * @param ttl Time to live in milliseconds (default: 5 minutes)
 */
export function setCache<T>(
  url: string,
  data: T,
  ttl: number = 5 * 60 * 1000,
): void {
  ensureCacheDir();
  const key = getCacheKey(url);
  const cachePath = join(CACHE_DIR, `${key}.json`);

  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl,
  };

  writeFileSync(cachePath, JSON.stringify(entry, null, 2));
}
