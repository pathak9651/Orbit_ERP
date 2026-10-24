import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';
import { apiRateLimiter } from './services/rateLimiter.js';
import { verifyBrowserOrigin } from './middlewares/security.js';

// Resolve paths relative to this module so production hosting works from any working directory.
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Allow only the resources currently needed by the app and its Google Maps iframe.
const contentSecurityPolicyDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  connectSrc: ["'self'"],
  fontSrc: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  frameSrc: ['https://maps.google.com', 'https://www.google.com'],
  imgSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'"],
  styleSrcAttr: ["'none'"],
  upgradeInsecureRequests: isProduction ? [] : null,
};

// Helmet adds browser security headers; HSTS is applied separately only to production HTTPS traffic.
app.use(helmet({
  contentSecurityPolicy: { directives: contentSecurityPolicyDirectives },
  hsts: false,
}));
app.use((req, res, next) => {
  if (isProduction && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Trust only configured proxy hops or subnets; never enable blanket proxy trust here.
const trustedProxySetting = process.env.TRUST_PROXY;
if (trustedProxySetting) {
  app.set('trust proxy', /^\d+$/.test(trustedProxySetting) ? Number(trustedProxySetting) : trustedProxySetting);
}

app.use(express.json({ limit: '150kb' }));
app.use(express.urlencoded({ extended: false, limit: '150kb' }));
app.use(cookieParser());

app.use('/api', apiRateLimiter, verifyBrowserOrigin, apiRoutes);

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
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large.' });
  }
  console.error(error);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

export default app;
