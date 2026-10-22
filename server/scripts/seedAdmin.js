import 'dotenv/config';
import { connectDB } from '../configs/db.js';
import User from '../models/user.js';
import { hashPassword } from '../services/auth.js';

const email = (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function seedAdmin() {
  if (!password) {
    throw new Error('Set ADMIN_PASSWORD before running the admin seed.');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be no more than 72 bytes.');
  }

  await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/orbit-erp');

  const user = await User.findOne({ email }).select('+password');
  const passwordHash = await hashPassword(password);

  if (user) {
    user.name = user.name || 'Orbit Admin';
    user.password = passwordHash;
    user.role = 'admin';
    user.isVerified = true;
    await user.save();
  } else {
    await User.create({
      name: 'Orbit Admin',
      email,
      password: passwordHash,
      role: 'admin',
      isVerified: true,
    });
  }

  console.log(`Admin account seeded for ${email}.`);
}

try {
  await seedAdmin();
} catch (error) {
  console.error('Admin seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await User.db?.close().catch(() => {});
}

