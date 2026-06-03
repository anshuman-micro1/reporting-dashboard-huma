import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IInvestigation extends Document {
  name: string;
  personalEmail?: string | null;
  micro1Email?: string | null;
  notes: string;
  status: 'open' | 'closed';
  investigationDate: string;
  createdAt: Date;
}

const InvestigationSchema = new Schema<IInvestigation>({
  name:              { type: String, required: true },
  personalEmail:     { type: String, default: null },
  micro1Email:       { type: String, default: null },
  notes:             { type: String, default: '' },
  status:            { type: String, enum: ['open', 'closed'], default: 'open' },
  investigationDate: { type: String },
  createdAt:         { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'investigation' });

// Used in offboarding PATCH: find({ name, status: 'open' })
InvestigationSchema.index({ name: 1, status: 1 });

// Used for status-only queries and list filtering
InvestigationSchema.index({ status: 1 });

// Default sort order
InvestigationSchema.index({ investigationDate: -1 });

export const Investigation: Model<IInvestigation> =
  (mongoose.models.Investigation as Model<IInvestigation>) ||
  mongoose.model<IInvestigation>('Investigation', InvestigationSchema);
