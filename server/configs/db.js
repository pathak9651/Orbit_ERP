import mongoose from 'mongoose';

/** Opens the shared MongoDB connection used by the API and seed scripts. */
export function connectDB(url) {
    return mongoose.connect(url);
}
