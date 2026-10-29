import 'dotenv/config';
import app from './app.js';
import { connectDB } from './configs/db.js';
import { closeRateLimitStore, connectRateLimitStore } from './services/rateLimiter.js';
import { scheduleAttendanceLocationRetention, validateAttendanceLocationConfiguration } from './services/attendanceLocation.js';
import { attachChatWebSocket } from './services/chatRealtime.js';
import { scheduleCalendarReminders } from './controllers/calendarController.js';

const PORT = Number(process.env.PORT) || 8000;

/** Validates required configuration, connects MongoDB, then starts the HTTP server. */
async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET in server/.env to a random value of at least 32 characters.');
  }

  validateAttendanceLocationConfiguration();
  await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/orbit-erp');
  console.log('MongoDB connected');
  await connectRateLimitStore();
  await scheduleAttendanceLocationRetention();
  await scheduleCalendarReminders();
  const server = app.listen(PORT, () => console.log(`Server listening at http://localhost:${PORT}`));
  attachChatWebSocket(server);

  // Stop accepting requests before closing shared connections on process shutdown.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(async () => {
        await closeRateLimitStore();
        process.exit(0);
      });
    });
  }
}

startServer().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
