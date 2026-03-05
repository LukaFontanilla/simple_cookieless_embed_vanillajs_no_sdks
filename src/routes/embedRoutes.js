import express from 'express';
import user from '../../user.json' with { type: 'json' };
import { 
  DEFAULT_SESSION_LENGTH, 
  MIN_TTL_THRESHOLD, 
  FRESHNESS_RATIO 
} from '../constants.js';
import { 
  getAdminToken, 
  acquireLookerSession, 
  generateLookerTokens 
} from '../services/lookerService.js';

const router = express.Router();

// In-memory cache for managing session tokens keyed by external user id and user agent
const embed_sessions = new Map();

// Periodic cleanup of expired sessions to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of embed_sessions.entries()) {
    const elapsedSecs = Math.floor((now - session.cachedAt) / 1000);
    if (elapsedSecs > session.session_reference_token_ttl) {
      embed_sessions.delete(key);
    }
  }
}, 60000); // Check every minute

/**
 * Returns a safely clamped token TTL, avoiding token expiration race conditions.
 * @returns {number} Time to live in seconds.
 */
const getSafeTokenTtl = () => {
  const sessionLength = user.session_length || DEFAULT_SESSION_LENGTH;
  return Math.max(1, Math.floor(sessionLength * FRESHNESS_RATIO));
};

const getCacheKey = (req) => {
  const userAgent = req.headers['user-agent'];
  return `${user.external_user_id}/${userAgent}`;
};

/**
 * Route to acquire a new cookieless embed session.
 */
router.get('/acquire-embed-session', async (req, res) => {
  try {
    const userAgent = req.headers['user-agent'];
    const cacheKey = getCacheKey(req);

    const adminTokenPayload = await getAdminToken();
    if (!adminTokenPayload || !adminTokenPayload.access_token) {
      return res.status(500).json({ message: "Failed to get admin access token" });
    }

    const sessionData = await acquireLookerSession(
      adminTokenPayload.access_token,
      userAgent,
      ''
    );

    // Store the full response in the cache with a timestamp
    embed_sessions.set(cacheKey, {
      ...sessionData,
      cachedAt: Date.now()
    });

    const { session_reference_token, ...embedTokens } = sessionData;

    // Clamp tokens sent to the frontend so the SDK refreshes before the session naturally expires
    const safeTokenTtl = getSafeTokenTtl();
    embedTokens.api_token_ttl = Math.min(embedTokens.api_token_ttl, safeTokenTtl);
    embedTokens.navigation_token_ttl = Math.min(embedTokens.navigation_token_ttl, safeTokenTtl);

    res.json(embedTokens);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

/**
 * Route to generate new tokens for an existing cookieless embed session.
 */
router.put('/generate-embed-tokens', async (req, res) => {
  try {
    const userAgent = req.headers['user-agent'];
    const cacheKey = getCacheKey(req);
    const session = embed_sessions.get(cacheKey);

    if (!session) {
      return res.status(400).json({ message: "Embed session not yet acquired" });
    }

    // Calculate elapsed time since tokens were cached
    const elapsedSecs = Math.floor((Date.now() - session.cachedAt) / 1000);

    const ttlThreshold = Math.max(MIN_TTL_THRESHOLD, session.api_token_ttl * FRESHNESS_RATIO);
    const sessionRemainingTtl = Math.max(0, session.session_reference_token_ttl - elapsedSecs);

    if (elapsedSecs < ttlThreshold && sessionRemainingTtl > 0) {
      const safeTokenTtl = getSafeTokenTtl();
      return res.json({
        api_token: session.api_token,
        api_token_ttl: Math.min(Math.max(0, session.api_token_ttl - elapsedSecs), safeTokenTtl),
        navigation_token: session.navigation_token,
        navigation_token_ttl: Math.min(Math.max(0, session.navigation_token_ttl - elapsedSecs), safeTokenTtl),
        session_reference_token_ttl: sessionRemainingTtl,
      });
    }

    const adminTokenPayload = await getAdminToken();
    if (!adminTokenPayload || !adminTokenPayload.access_token) {
      return res.status(500).json({ message: "Failed to get admin access token" });
    }

    const newSessionData = await generateLookerTokens(adminTokenPayload.access_token, userAgent, session);
    embed_sessions.set(cacheKey, { ...newSessionData, cachedAt: Date.now() });

    const safeTokenTtl = getSafeTokenTtl();

    res.json({
      api_token: newSessionData.api_token,
      api_token_ttl: Math.min(newSessionData.api_token_ttl, safeTokenTtl),
      navigation_token: newSessionData.navigation_token,
      navigation_token_ttl: Math.min(newSessionData.navigation_token_ttl, safeTokenTtl),
      session_reference_token_ttl: newSessionData.session_reference_token_ttl,
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

export default router;
