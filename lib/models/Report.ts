import mongoose, { Schema, Model, Document } from 'mongoose';

const QCTaskSchema = new Schema({
  link:            { type: String },
  recordingLength: { type: String },
  app:             { type: String },
}, { _id: false });

const AllTaskEntrySchema = new Schema({
  date:  { type: String },
  tasks: { type: [QCTaskSchema], default: [] },
}, { _id: false });

export interface IReport extends Document {
  memberName: string;
  orgId?: string;
  projectId?: string;
  organization?: string;
  timezone?: string;
  personalEmail?: string | null;
  micro1Email?: string | null;
  hdm?: string | null;
  team?: string | null;
  totalWorked?: string;
  activity?: string;
  spentTotal?: string;
  currency?: string;
  // Dynamic date keys stored as a plain object — use Schema.Types.Mixed
  dates?: Record<string, string>;
  allTasks?: Array<{ date: string; tasks: Array<{ link: string; recordingLength: string; app: string }> }>;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>({
  memberName:    { type: String, required: true },
  orgId:         { type: String },
  projectId:     { type: String },
  organization:  { type: String },
  timezone:      { type: String },
  personalEmail: { type: String, default: null },
  micro1Email:   { type: String, default: null },
  hdm:           { type: String, default: null },
  team:          { type: String, default: null },
  totalWorked:   { type: String },
  activity:      { type: String },
  spentTotal:    { type: String },
  currency:      { type: String },
  // Mixed allows arbitrary date keys like { '2026-05-01': '8:30:00' }
  dates:    { type: Schema.Types.Mixed, default: {} },
  allTasks: { type: [AllTaskEntrySchema], default: [] },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'reports' });

// Unique — used as upsert key and in $lookup join (reports ← members)
ReportSchema.index({ memberName: 1 }, { unique: true });

// Used by QC-tracking updates and leaderboard $lookup
ReportSchema.index({ micro1Email: 1 }, { sparse: true });

export const Report: Model<IReport> =
  (mongoose.models.Report as Model<IReport>) ||
  mongoose.model<IReport>('Report', ReportSchema);
