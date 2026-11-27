/**
 * Shared cache of descriptions (D1 table `descriptions`, see migrations/).
 * Values: { alt: string | null, decorative: boolean }. alt null = "unsupported image" (a day);
 * successes expire after 30 days (images at a fixed URL can change: banners, rates, weather).
 */

/**
 * Cache key: sha256 of prompt version, model, image URL and context, as hex. The context is
 * part of the key so nobody can plant a description for other users by sending made-up
 * context for a popular image: the same image only shares a description with requests that
 * send the same nearby text.
 */
export async function cacheKey(imageUrl, { promptVersion, model, context = '' }) {
  const data = new TextEncoder().encode(`${promptVersion}|${model}|${imageUrl}|${context}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** D1-backed cache. `now` is ms since epoch. */
export const d1Cache = (db) => ({
  async get(key, now) {
    const row = await db
      .prepare('SELECT alt, decorative, expires_at FROM descriptions WHERE key = ?1')
      .bind(key)
      .first();
    if (!row) return null;
    if (row.expires_at !== null && row.expires_at !== undefined && row.expires_at <= now) return null;
    return { alt: row.alt, decorative: !!row.decorative };
  },
  async put(key, { alt, decorative }, now, ttlMs) {
    await db
      .prepare('INSERT OR REPLACE INTO descriptions (key, alt, decorative, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(key, alt, decorative ? 1 : 0, now, ttlMs ? now + ttlMs : null)
      .run();
  },
});

/** In-memory cache with the same interface (tests). */
export const memoryCache = () => {
  const rows = new Map();
  return {
    rows,
    async get(key, now) {
      const row = rows.get(key);
      if (!row || (row.expiresAt !== null && row.expiresAt <= now)) return null;
      return { alt: row.alt, decorative: row.decorative };
    },
    async put(key, { alt, decorative }, now, ttlMs) {
      rows.set(key, { alt, decorative: !!decorative, expiresAt: ttlMs ? now + ttlMs : null });
    },
  };
};
