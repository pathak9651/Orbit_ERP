import mongoose from 'mongoose';

/** Makes unknown query paths fail loudly in development and remain non-matching in production. */
export function configureMongooseQueryMode() {
    mongoose.set('strictQuery', process.env.NODE_ENV === 'production' ? false : 'throw');
}

/** Opens the shared MongoDB connection used by the API and seed scripts. */
export function connectDB(url) {
    configureMongooseQueryMode();
    return mongoose.connect(url);
}
