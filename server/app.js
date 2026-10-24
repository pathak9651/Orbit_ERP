import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';

// Resolve paths relative to this module so production hosting works from any working directory.
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '150kb' }));
app.use(express.urlencoded({ extended: false, limit: '150kb' }));
app.use(cookieParser());

app.use('/api', apiRoutes);

// Serve the compiled React app when present; Vite handles it during development.
const clientDist = path.resolve(currentDirectory, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*path', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

export default app;
