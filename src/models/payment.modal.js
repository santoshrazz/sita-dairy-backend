import mongoose, { Schema } from "mongoose";
const paymentSchema = new Schema(
  {
    amount: {
      type: String,
      required: [true, "Amount is required"],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      trim: true,
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    paymentType: {
      type: String,
      require: true,
      enum: ["Paid", "Recieve"],
    },
  },
  { timestamps: true }
);

export const paymentModal =
  mongoose.models.payments || mongoose.model("payments", paymentSchema);
