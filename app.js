import express from 'express'
import path from 'path'
import cors from 'cors'
import fs from 'fs'
import user from './user.json' assert { type: 'json' }
import dotenv from 'dotenv'

dotenv.config()


// Express App setup
const app = express()
app.use(cors())
app.use(express.json())
//

// Simple in-memory object for managing session tokens
let looker_tokens = {};
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
//

/**
 * Route to acquire a new cookieless embed session.
 * This endpoint authenticates as an admin, then creates a new embed session
 * for the user defined in `user.json`.
 */
app.post('/api/acquire-embed-session', async (req, res) => {
  try {
    const admin_token = await getAdminToken();
    if (!admin_token || !admin_token.access_token) {
      return res.status(500).json({ message: "Failed to get admin access token" });
    }

    const embed_config = {
      ...user,
      session_reference_token: undefined,
    };

    const acquire = await fetch(
      `${process.env.LOOKER_API_URL}/api/4.0/embed/cookieless_session/acquire`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${admin_token.access_token}`,
          "User-Agent": req.headers['user-agent'],
        },
        body: JSON.stringify(embed_config),
      }
    ).then((response) => response.json());

    const { session_reference_token, ...client_tokens } = acquire
    looker_tokens = { session_reference_token, ...client_tokens }
    res.json(client_tokens);
  } catch (err) {
    res.status(500).send({ message: err.message })
  }
})

/**
 * Route to generate new tokens for an existing cookieless embed session.
 * This is called by the frontend when the Looker iframe requests a token refresh.
 */
app.post('/api/generate-embed-tokens', async (req, res) => {
  try {
    const admin_token = await getAdminToken();
    if (!admin_token || !admin_token.access_token) {
      return res.status(500).json({ message: "Failed to get admin access token" });
    }

    const all = await fetch(
      `${process.env.LOOKER_API_URL}/api/4.0/embed/cookieless_session/generate_tokens`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${admin_token.access_token}`,
          "User-Agent": req.headers['user-agent'],
        },
        body: JSON.stringify({ ...looker_tokens }),
      }
    ).then((response) => {
      return response.json();
    });

    res.json(all);
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
  fs.readFile(path.resolve('embed.html'), 'utf8', (err, data) => {
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
