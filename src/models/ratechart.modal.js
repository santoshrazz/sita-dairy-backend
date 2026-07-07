import mongoose from "mongoose";

const rateSchema = new mongoose.Schema(
  {
    fat: { type: Number, required: true },
    snf8_0: Number,
    snf8_1: Number,
    snf8_2: Number,
    snf8_3: Number,
    snf8_4: Number,
    snf8_5: Number,
  },
  { timestamps: true }
);

export const ratechartModal =
  mongoose.models.ratemodels || mongoose.model("ratemodels", rateSchema);
