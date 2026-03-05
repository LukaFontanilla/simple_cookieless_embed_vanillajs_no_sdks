import { LOOKER_API_LOGIN_PATH, LOOKER_API_ACQUIRE_PATH, LOOKER_API_GENERATE_PATH } from '../constants.js';
import user from '../../user.json' with { type: 'json' };

let cachedAdminToken = null;
let tokenExpiry = 0;

/**
 * Authenticates with the Looker API to get an admin access token.
 * Uses the LOOKER_CLIENT_ID and LOOKER_CLIENT_SECRET from the environment variables.
 * Implements token caching to avoid hitting rate limits.
 * @returns {Promise<object>} A promise that resolves to the admin access token object.
 */
export const getAdminToken = async () => {
  if (cachedAdminToken && Date.now() < tokenExpiry) {
    return cachedAdminToken;
  }

  const body = new URLSearchParams({
    client_id: process.env.LOOKER_CLIENT_ID,
    client_secret: process.env.LOOKER_CLIENT_SECRET,
  });

  const response = await fetch(
    `${process.env.LOOKER_API_URL}${LOOKER_API_LOGIN_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  ).then((res) => res.json());

  if (response && response.access_token) {
    cachedAdminToken = { access_token: response.access_token };
    tokenExpiry = Date.now() + (response.expires_in * 1000) - 5000; // Buffer of 5 seconds
  }
  return cachedAdminToken;
};

/**
 * Acquires a new Looker cookieless embed session.
 * @param {string} adminAccessToken Admin access token.
 * @param {string} userAgent User agent string.
 * @param {string} sessionReferenceToken Optional session reference token.
 * @returns {Promise<object>} The acquire response data.
 */
export const acquireLookerSession = async (adminAccessToken, userAgent, sessionReferenceToken) => {
  const embed_config = {
    ...user,
    session_reference_token: sessionReferenceToken || '',
  };

  return await fetch(
    `${process.env.LOOKER_API_URL}${LOOKER_API_ACQUIRE_PATH}`,
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
export const generateLookerTokens = async (adminAccessToken, userAgent, session) => {
  return await fetch(
    `${process.env.LOOKER_API_URL}${LOOKER_API_GENERATE_PATH}`,
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
