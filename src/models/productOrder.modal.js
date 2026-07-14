import mongoose, { Schema } from "mongoose";

const productOrderItemSchema = new Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "product",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  deliveredQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const productOrderSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    items: {
      type: [productOrderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Order must have at least one item",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveredAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Placed", "Partially Delivered", "Delivered", "Cancelled"],
      default: "Placed",
    },
    deliveryDate: {
      type: Date,
      required: true,
    },
    cancelledBy: {
      type: String,
      enum: ["User", "Admin"],
    },
    cancelledAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

productOrderSchema.index({ user: 1, createdAt: -1 });
productOrderSchema.index({ status: 1, createdAt: -1 });

export const productOrderModal =
  mongoose.models.productorders ||
  mongoose.model("productorder", productOrderSchema);
