import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IQCSubmission extends Document {
  date: string; // stored as ISO or original string
  expertName?: string;
  personalEmail?: string | null;
  expertEmail?: string | null;
  assignedHDM?: string | null;
  featherLink?: string | null;
  recordingLength?: string | null;
  app?: string | null;
  reviewerName?: string | null;
  tagStatus?: string | null;
  notes?: string | null;
  raw?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const QCSubmissionSchema = new Schema<IQCSubmission>({
  date:           { type: String, required: true, index: true },
  expertName:     { type: String, index: true },
  personalEmail:  { type: String, default: null, index: true },
  expertEmail:    { type: String, default: null, index: true },
  assignedHDM:    { type: String, default: null, index: true },
  featherLink:    { type: String, default: null },
  recordingLength:{ type: String, default: null },
  app:            { type: String, default: null },
  reviewerName:   { type: String, default: null },
  tagStatus:      { type: String, default: null },
  notes:          { type: String, default: null },
  raw:            { type: Schema.Types.Mixed, default: {} },
  createdAt:      { type: Date, default: () => new Date() },
  updatedAt:      { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'qc_submissions' });

QCSubmissionSchema.index({ expertEmail: 1, date: 1 });
// Unique per recording — sparse so null featherLinks don't conflict with each other.
QCSubmissionSchema.index({ featherLink: 1 }, { unique: true, sparse: true });

export const QCSubmission: Model<IQCSubmission> =
  (mongoose.models.QCSubmission as Model<IQCSubmission>) ||
  mongoose.model<IQCSubmission>('QCSubmission', QCSubmissionSchema);
