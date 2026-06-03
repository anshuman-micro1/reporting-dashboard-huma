import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IUser extends Document {
  email:        string;
  name:         string;
  role:         'admin' | 'user' | 'hdm' | 'hdl';
  passwordHash: string | null;   // null = Google-only account
  isActive:     boolean;
  createdAt:    Date;
  updatedAt:    Date;
}

const UserSchema = new Schema<IUser>({
  email:        { type: String, required: true, lowercase: true, trim: true },
  name:         { type: String, required: true, trim: true },
  role:         { type: String, enum: ['admin', 'user', 'hdm', 'hdl'], default: 'user' },
  passwordHash: { type: String, default: null },
  isActive:     { type: Boolean, default: true },
  createdAt:    { type: Date, default: () => new Date() },
  updatedAt:    { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'users' });

// Primary lookup by email (login, allowlist check)
UserSchema.index({ email: 1 }, { unique: true });

// Admin queries — list active users, filter by role
UserSchema.index({ isActive: 1 });
UserSchema.index({ role: 1 });

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>('User', UserSchema);
