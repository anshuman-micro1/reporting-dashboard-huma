import mongoose, { Schema, Model, Document } from 'mongoose';

export interface ISettings extends Document {
  _id: string;
  HUBSTAFF_STRIPE_MID?: string;
  HUBSTAFF_XSRF_TOKEN?: string;
  HUBSTAFF_SESSION?: string;
  HUBSTAFF_ACCOUNT_REFRESH?: string;
  HUBSTAFF_INGRESS_COOKIE?: string;
  HUBSTAFF_CSRF_TOKEN?: string;
  updatedAt?: Date;
}

const SettingsSchema = new Schema<ISettings>({
  _id:                      { type: String },
  HUBSTAFF_STRIPE_MID:      { type: String },
  HUBSTAFF_XSRF_TOKEN:      { type: String },
  HUBSTAFF_SESSION:         { type: String },
  HUBSTAFF_ACCOUNT_REFRESH: { type: String },
  HUBSTAFF_INGRESS_COOKIE:  { type: String },
  HUBSTAFF_CSRF_TOKEN:      { type: String },
  updatedAt:                { type: Date },
}, { versionKey: false, collection: 'settings' });

export const Settings: Model<ISettings> =
  (mongoose.models.Settings as Model<ISettings>) ||
  mongoose.model<ISettings>('Settings', SettingsSchema);
