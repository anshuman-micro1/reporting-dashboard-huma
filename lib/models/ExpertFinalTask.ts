import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IExpertFinalTask extends Document {
  expertEmail: string;
  personalEmail?: string | null;
  totalFinalTaskCount: number;
  updatedAt: Date;
}

const ExpertFinalTaskSchema = new Schema<IExpertFinalTask>({
  expertEmail:         { type: String, required: true },
  personalEmail:       { type: String, default: null },
  totalFinalTaskCount: { type: Number, required: true },
  updatedAt:           { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'expert_final_tasks' });

ExpertFinalTaskSchema.index({ expertEmail: 1 }, { unique: true });
ExpertFinalTaskSchema.index({ personalEmail: 1 }, { sparse: true });

export const ExpertFinalTask: Model<IExpertFinalTask> =
  (mongoose.models.ExpertFinalTask as Model<IExpertFinalTask>) ||
  mongoose.model<IExpertFinalTask>('ExpertFinalTask', ExpertFinalTaskSchema);
