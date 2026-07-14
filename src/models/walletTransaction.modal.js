import mongoose, { Schema } from "mongoose";

const walletTransactionSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    direction: {
      type: String,
      enum: ["Credit", "Debit"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      enum: ["MilkSell", "MilkBuy", "CashPayment", "Top-up", "ProductOrder"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failed"],
      default: "Success",
    },
    balanceAfter: {
      type: Number,
      default: null,
    },
    refType: {
      type: String,
      enum: ["milk", "walletTransaction", "productOrder"],
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    note: {
      type: String,
    },
    failureReason: {
      type: String,
    },
    gateway: {
      merchantOrderId: { type: String },
      phonepeOrderId: { type: String },
      rawInitResponse: { type: Schema.Types.Mixed },
      rawCallback: { type: Schema.Types.Mixed },
      verifiedAt: { type: Date },
    },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index(
  { "gateway.merchantOrderId": 1 },
  { unique: true, sparse: true },
);

export const walletTransactionModal =
  mongoose.models.wallettransactions ||
  mongoose.model("wallettransaction", walletTransactionSchema);
