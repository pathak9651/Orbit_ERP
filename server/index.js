import 'dotenv/config';
import app from './app.js';
import { connectDB } from './configs/db.js';

const PORT = Number(process.env.PORT) || 8000;

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET in server/.env to a random value of at least 32 characters.');
  }

  await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/orbit-erp');
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`Server listening at http://localhost:${PORT}`));
}

startServer().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
