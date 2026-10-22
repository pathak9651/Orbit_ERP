import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 80
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        required: true,
        default: 'employee'
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
    },
    isVerified: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

userSchema.virtual('accountId').get(function getAccountId() {
    const createdAt = this.createdAt || this._id.getTimestamp();
    const timestamp = createdAt.toISOString();
    const datePart = timestamp.slice(0, 10).replaceAll('-', '');
    const timePart = timestamp.slice(11, 19).replaceAll(':', '');
    return `ORB-${datePart}-${timePart}-${this._id.toString().toUpperCase()}`;
});

const User = mongoose.model('User', userSchema);

export default User;


