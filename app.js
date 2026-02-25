import express from 'express'
import path from 'path'
import cors from 'cors'
import fs from 'fs'
import user from './user.json' with { type: 'json' }
import dotenv from 'dotenv'

dotenv.config()


// Express App setup
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))
//

// In-memory cache for managing session tokens keyed by external user id and user agent
const embed_sessions = {};
//

/**
 * Authenticates with the Looker API to get an admin access token.
 * Uses the LOOKER_CLIENT_ID and LOOKER_CLIENT_SECRET from the environment variables.
 * @returns {Promise<object>} A promise that resolves to the admin access token object.
 */
const getAdminToken = async () => {
  const query = new URLSearchParams({
    client_id: process.env.LOOKER_CLIENT_ID,
    client_secret: process.env.LOOKER_CLIENT_SECRET,
  });
  const admin_access_token = await fetch(
    `${process.env.LOOKER_API_URL}/api/4.0/login?${query.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  ).then((response) => {
    return response.json();
  });
  return admin_access_token;
}

/**
 * Gets the cache key for the current request.
 * @param {object} req Express request object.
 * @returns {string} The cache key.
 */
const getCacheKey = (req) => {
  const userAgent = req.headers['user-agent'];
  return `${user.external_user_id}/${userAgent}`;
};

/**
 * Acquires a new Looker cookieless embed session.
 * @param {string} adminAccessToken Admin access token.
 * @param {string} userAgent User agent string.
 * @param {string} sessionReferenceToken Optional session reference token.
 * @returns {Promise<object>} The acquire response data.
 */
const acquireLookerSession = async (adminAccessToken, userAgent, sessionReferenceToken) => {
  const embed_config = {
    ...user,
    session_reference_token: sessionReferenceToken,
  };

  return await fetch(
    `${process.env.LOOKER_API_URL}/api/4.0/embed/cookieless_session/acquire`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAccessToken}`,
        "User-Agent": userAgent,
      },
      body: JSON.stringify(embed_config),
    }
  ).then((response) => response.json());
};

/**
 * Generates new tokens for an existing Looker cookieless embed session.
 * @param {string} adminAccessToken Admin access token.
 * @param {string} userAgent User agent string.
 * @param {object} session Existing session data.
 * @returns {Promise<object>} The generate tokens response data.
 */
const generateLookerTokens = async (adminAccessToken, userAgent, session) => {
  return await fetch(
    `${process.env.LOOKER_API_URL}/api/4.0/embed/cookieless_session/generate_tokens`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAccessToken}`,
        "User-Agent": userAgent,
      },
      body: JSON.stringify({
        session_reference_token: session.session_reference_token || '',
        api_token: session.api_token,
        navigation_token: session.navigation_token
      }),
    }
  ).then((response) => response.json());
};
//

/**
 * Route to acquire a new cookieless embed session.
 * This endpoint authenticates as an admin, then creates a new embed session
 * for the user defined in `user.json`.
 */
app.get('/api/acquire-embed-session', async (req, res) => {
  try {
    const admin_token = await getAdminToken();
    if (!admin_token || !admin_token.access_token) {
      return res.status(500).json({ message: "Failed to get admin access token" });
    }

    const userAgent = req.headers['user-agent'];
    const cacheKey = getCacheKey(req);
    const existingSession = embed_sessions[cacheKey];

    const acquire = await acquireLookerSession(
      admin_token.access_token,
      userAgent,
      existingSession?.session_reference_token
    );

    // Store the full response in the cache
    embed_sessions[cacheKey] = acquire;

    const { session_reference_token, ...client_tokens } = acquire;
    res.json(client_tokens);
  } catch (err) {
    res.status(500).send({ message: err.message })
  }
})

/**
 * Route to generate new tokens for an existing cookieless embed session.
 * This is called by the frontend when the Looker iframe requests a token refresh.
 */
app.put('/api/generate-embed-tokens', async (req, res) => {
  try {
    const admin_token = await getAdminToken();
    if (!admin_token || !admin_token.access_token) {
      return res.status(500).json({ message: "Failed to get admin access token" });
    }

    const userAgent = req.headers['user-agent'];
    const cacheKey = getCacheKey(req);
    const session = embed_sessions[cacheKey];

    if (!session) {
      return res.status(400).json({ message: "Embed session not yet acquired" });
    }

    const all = await generateLookerTokens(admin_token.access_token, userAgent, session);

    // If session has expired (TTL is 0), re-acquire it
    if (all.session_reference_token_ttl === 0) {
      const newSessionData = await acquireLookerSession(
        admin_token.access_token,
        userAgent,
        session.session_reference_token
      );

      embed_sessions[cacheKey] = { ...session, ...newSessionData };
      return res.json({
        api_token: newSessionData.api_token,
        api_token_ttl: newSessionData.api_token_ttl,
        navigation_token: newSessionData.navigation_token,
        navigation_token_ttl: newSessionData.navigation_token_ttl,
        session_reference_token_ttl: newSessionData.session_reference_token_ttl,
      });
    }

    // Update the session in the cache with the new tokens
    embed_sessions[cacheKey] = { ...session, ...all };

    res.json({
      api_token: all.api_token,
      api_token_ttl: all.api_token_ttl,
      navigation_token: all.navigation_token,
      navigation_token_ttl: all.navigation_token_ttl,
      session_reference_token_ttl: all.session_reference_token_ttl,
    });
  } catch (err) {
    res.status(500).send({ message: err.message })
  }
})

/**
 * Route to serve the main HTML page.
 * This reads the `embed.html` file, replaces the placeholder values for
 * LOOKER_BASE_URL and LOOKER_DASHBOARD_ID, and serves the result.
 */
app.get('/', (req, res) => {
  fs.readFile(path.resolve('public', 'embed.html'), 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('An error occurred');
    }
    const result = data
      .replace(/{{LOOKER_BASE_URL}}/g, process.env.LOOKER_BASE_URL)
      .replace(/{{DASHBOARD_ID}}/g, process.env.LOOKER_DASHBOARD_ID);
    res.send(result);
  });
});

const PORT = process.env.PORT || 8000
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`)
  console.log('Press Ctrl+C to quit.')
})
