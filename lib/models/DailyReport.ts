import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IDailyReport extends Document {
  date: string;
  total_time: string;
  average_activity: string;
  average_hours_per_member: string;
  member_data: Record<string, { total_hours: string; activity: string }>;
  updatedAt: Date;
  createdAt: Date;
}

const DailyReportSchema = new Schema<IDailyReport>({
  date:                     { type: String, required: true },
  total_time:               { type: String },
  average_activity:         { type: String },
  average_hours_per_member: { type: String },
  // Mixed allows the dynamic member-name keys
  member_data: { type: Schema.Types.Mixed, default: {} },
  updatedAt:   { type: Date, default: () => new Date() },
  createdAt:   { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'daily_report' });

// Unique — primary lookup and upsert key
DailyReportSchema.index({ date: 1 }, { unique: true });

export const DailyReport: Model<IDailyReport> =
  (mongoose.models.DailyReport as Model<IDailyReport>) ||
  mongoose.model<IDailyReport>('DailyReport', DailyReportSchema);
