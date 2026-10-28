import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { OmniEngine } from '../src/core/index.js';
import { createAgUiHandler } from './ag-ui-bridge.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const engine = new OmniEngine({
  defaultModel: process.env.DEFAULT_MODEL || 'meta-muse-spark'
});

// Health check endpoints (both /health and /api/health)
const handleHealth = (req, res) => {
  res.json({
    status: 'healthy',
    defaultModel: process.env.DEFAULT_MODEL || 'meta-muse-spark',
    timestamp: Date.now()
  });
};
app.get('/health', handleHealth);
app.get('/api/health', handleHealth);

// AG-UI 1.0 Chat endpoint
app.post('/api/chat', createAgUiHandler({ engine }));

// Static frontend in production
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(200).send('Omni Agent Server is running. Frontend build not present.');
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Omni Agent Server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[Omni Agent Engine] Default model configured: ${process.env.DEFAULT_MODEL || 'meta-muse-spark'}`);
});
