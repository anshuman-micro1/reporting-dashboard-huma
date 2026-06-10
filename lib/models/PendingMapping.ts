import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IPendingMapping extends Document {
  hubstaffName:        string;
  suggestedMemberName: string | null;
  suggestedMemberId:   string | null;
  score:               number | null;
  autoApplied:         boolean;
  firstSeen:           Date;
  lastSeen:            Date;
}

const PendingMappingSchema = new Schema<IPendingMapping>({
  hubstaffName:        { type: String, required: true, unique: true },
  suggestedMemberName: { type: String, default: null },
  suggestedMemberId:   { type: String, default: null },
  score:               { type: Number, default: null },
  autoApplied:         { type: Boolean, default: false },
  firstSeen:           { type: Date, default: () => new Date() },
  lastSeen:            { type: Date, default: () => new Date() },
}, { versionKey: false, collection: 'pending_mappings' });

export const PendingMapping: Model<IPendingMapping> =
  (mongoose.models.PendingMapping as Model<IPendingMapping>) ||
  mongoose.model<IPendingMapping>('PendingMapping', PendingMappingSchema);
