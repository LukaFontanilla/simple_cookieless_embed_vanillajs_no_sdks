import express from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import dotenv from 'dotenv';
import embedRoutes from './src/routes/embedRoutes.js';
import { DEFAULT_PORT } from './src/constants.js';

dotenv.config();

// Express App setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Mount the embed routes
app.use('/api', embedRoutes);

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
    const renderedHtml = data
      .replace(/{{LOOKER_BASE_URL}}/g, process.env.LOOKER_BASE_URL)
      .replace(/{{DASHBOARD_ID}}/g, process.env.LOOKER_DASHBOARD_ID);
    res.send(renderedHtml);
  });
});

const PORT = process.env.PORT || DEFAULT_PORT;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
