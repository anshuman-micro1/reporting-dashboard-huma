import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IMember extends Document {
  hubstaffId?: number | null;
  hubstaffName: string;
  personalEmail?: string | null;
  micro1Email?: string | null;
  hdm?: string | null;
  team?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MemberSchema = new Schema<IMember>({
  hubstaffId:    { type: Number, default: null },
  hubstaffName:  { type: String, required: true },
  personalEmail: { type: String, default: null },
  micro1Email:   { type: String, default: null },
  hdm:           { type: String, default: null },
  team:          { type: String, default: null },
  createdAt:     { type: Date,   default: () => new Date() },
  updatedAt:     { type: Date,   default: () => new Date() },
}, { versionKey: false, collection: 'members' });

// Unique index for Hubstaff sync upserts
MemberSchema.index({ hubstaffId: 1 }, { unique: true, sparse: true });

// Used in $lookup join (members → reports) and name-based updates
MemberSchema.index({ hubstaffName: 1 });

// Used in regex search and CSV-import fallback matching
MemberSchema.index({ personalEmail: 1 }, { sparse: true });
MemberSchema.index({ micro1Email: 1 },   { sparse: true });

// Used by the huma2 team filter in /api/reports
MemberSchema.index({ team: 1 }, { sparse: true });

export const Member: Model<IMember> =
  (mongoose.models.Member as Model<IMember>) ||
  mongoose.model<IMember>('Member', MemberSchema);
