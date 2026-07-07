import mongoose, { Schema } from "mongoose";
const bankDetailsSchema = new Schema(
  {
    accNo: {
      type: String,
      required: [true, "Account No is Required"],
      trim: true,
    },
    ifsc: {
      type: String,
      required: [true, "Ifsc code required"],
      trim: true,
    },
    bankName: {
      type: String,
      required: [true, "Bank Name is required"],
    },
    byUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
  },
  { timestamps: true }
);

export const bankDetailsModal =
  mongoose.models.bankdetails ||
  mongoose.model("bankdetails", bankDetailsSchema);
