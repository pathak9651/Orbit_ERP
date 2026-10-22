import mongoose from 'mongoose';

export function connectDB(url) {
    return mongoose.connect(url);
}
