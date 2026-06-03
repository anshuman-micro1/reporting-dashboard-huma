import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IOffboarding extends Document {
  name: string;
  personalEmail?: string | null;
  micro1Email?: string | null;
  requestDate: string;
  isOffboarded: boolean;
  status: 'pending' | 'resolved';
  confirmationDate?: string | null;
  createdAt: Date;
}

const OffboardingSchema = new Schema<IOffboarding>({
  name:             { type: String, required: true },
  personalEmail:    { type: String, default: null },
  micro1Email:      { type: String, default: null },
  requestDate:      { type: String },
  isOffboarded:     { type: Boolean, default: false },
  status:           { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  confirmationDate: { type: String, default: null },
  createdAt:        { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'offboardings' });

// Unique — used as upsert key in POST
OffboardingSchema.index({ name: 1 }, { unique: true });

// Used in status filters on the offboardings panel
OffboardingSchema.index({ status: 1 });

// Default sort order
OffboardingSchema.index({ requestDate: -1 });

export const Offboarding: Model<IOffboarding> =
  (mongoose.models.Offboarding as Model<IOffboarding>) ||
  mongoose.model<IOffboarding>('Offboarding', OffboardingSchema);
