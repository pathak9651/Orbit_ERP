import mongoose from 'mongoose';

// Defines account identity, password privacy, organization assignment, and verification state.
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
    phone: {
        type: String,
        trim: true,
        maxlength: 25,
        default: ''
    },
    dateOfBirth: {
        type: Date,
        default: null
    },
    // Stores the validated, size-limited profile image as a data URL for this account.
    profileImage: {
        type: String,
        default: '',
        select: false
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
    },
    // Changes whenever existing sessions must be invalidated for this account.
    tokenVersion: {
        type: Number,
        default: 0,
        min: 0
    }
}, { timestamps: true });

// Build a stable, human-readable ID from creation time and the unique MongoDB record ID.
userSchema.virtual('accountId').get(function getAccountId() {
    const createdAt = this.createdAt || this._id.getTimestamp();
    const timestamp = createdAt.toISOString();
    const datePart = timestamp.slice(0, 10).replaceAll('-', '');
    const timePart = timestamp.slice(11, 19).replaceAll(':', '');
    return `ORB-${datePart}-${timePart}-${this._id.toString().toUpperCase()}`;
});

const User = mongoose.model('User', userSchema);

export default User;


