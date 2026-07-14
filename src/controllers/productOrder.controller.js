import mongoose from "mongoose";
import { ApiError } from "../middleware/errorHandler.middleware.js";
import { userModal } from "../models/customer.modal.js";
import { productModel } from "../models/product.modal.js";
import { productOrderModal } from "../models/productOrder.modal.js";
import { applyWalletDelta, recordWalletTransaction } from "../utils/wallet.js";

const computeStatus = (items) => {
  const allDelivered = items.every(
    (item) => item.deliveredQuantity >= item.quantity,
  );
  if (allDelivered) return "Delivered";
  const anyDelivered = items.some((item) => item.deliveredQuantity > 0);
  return anyDelivered ? "Partially Delivered" : "Placed";
};

export const createProductOrder = async (request, response, next) => {
  try {
    const userId = request.user._id;
    const { items, deliveryDate } = request.body;

    if (!Array.isArray(items) || items.length === 0) {
      return next(new ApiError("At least one item is required", 400));
    }
    if (!deliveryDate) {
      return next(new ApiError("Delivery date is required", 400));
    }
    const deliveryDateObj = new Date(deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(deliveryDateObj.getTime()) || deliveryDateObj < today) {
      return next(new ApiError("Delivery date must be today or later", 400));
    }

    const productIds = items.map((item) => item.productId);
    const products = await productModel.find({ _id: { $in: productIds } });
    const productById = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let totalAmount = 0;
    for (const item of items) {
      const product = productById.get(String(item.productId));
      const quantity = Number(item.quantity);
      if (!product) {
        return next(new ApiError("One or more products were not found", 400));
      }
      if (!quantity || quantity < 1) {
        return next(new ApiError("Quantity must be at least 1", 400));
      }
      orderItems.push({
        product: product._id,
        title: product.title,
        price: product.price,
        quantity,
        deliveredQuantity: 0,
      });
      totalAmount += product.price * quantity;
    }

    const user = await userModal.findById(userId);
    if (!user.allowNegativeBalance && user.walletAmount < totalAmount) {
      return next(
        new ApiError(
          `Insufficient wallet balance. Available: ₹${user.walletAmount}, Order total: ₹${totalAmount}`,
          400,
        ),
      );
    }

    const createdOrder = await productOrderModal.create({
      user: userId,
      items: orderItems,
      totalAmount,
      deliveryDate: deliveryDateObj,
      status: "Placed",
    });

    return response.status(200).json({
      success: true,
      message: "Order placed successfully",
      data: createdOrder,
    });
  } catch (error) {
    return next(new ApiError(error.message || "Error placing order", 500));
  }
};

export const getMyProductOrders = async (request, response, next) => {
  try {
    const { page = 1, limit = 20 } = request.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const filter = { user: request.user._id };

    const [rows, totalCount] = await Promise.all([
      productOrderModal
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      productOrderModal.countDocuments(filter),
    ]);

    return response.status(200).json({
      success: true,
      data: rows,
      totalCount,
      page: pageNumber,
      limit: pageSize,
    });
  } catch (error) {
    return next(new ApiError(error.message || "Error fetching orders", 500));
  }
};

export const getProductOrders = async (request, response, next) => {
  try {
    const {
      status,
      activeOnly,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = request.query;

    const filter = {};
    if (activeOnly === "true") {
      filter.status = { $in: ["Placed", "Partially Delivered"] };
    } else if (status) {
      filter.status = status;
    }
    if (userId) filter.user = userId;
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const [rows, totalCount] = await Promise.all([
      productOrderModal
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate("user", "name id profilePic"),
      productOrderModal.countDocuments(filter),
    ]);

    return response.status(200).json({
      success: true,
      data: rows,
      totalCount,
      page: pageNumber,
      limit: pageSize,
    });
  } catch (error) {
    return next(new ApiError(error.message || "Error fetching orders", 500));
  }
};

export const updateProductOrderDelivery = async (request, response, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = request.params;
    const { items } = request.body;
    if (!Array.isArray(items) || items.length === 0) {
      return next(new ApiError("Items are required", 400));
    }

    const order = await productOrderModal.findById(id);
    if (!order) {
      return next(new ApiError("Order not found", 404));
    }
    if (order.status === "Delivered" || order.status === "Cancelled") {
      return next(
        new ApiError(`Cannot update a ${order.status.toLowerCase()} order`, 400),
      );
    }

    const deliveredById = new Map(
      items.map((item) => [String(item.itemId), Number(item.deliveredQuantity)]),
    );

    for (const orderItem of order.items) {
      const newDeliveredQuantity = deliveredById.get(String(orderItem._id));
      if (newDeliveredQuantity === undefined) continue;
      if (
        Number.isNaN(newDeliveredQuantity) ||
        newDeliveredQuantity < orderItem.deliveredQuantity
      ) {
        return next(
          new ApiError("Delivered quantity cannot decrease", 400),
        );
      }
      if (newDeliveredQuantity > orderItem.quantity) {
        return next(
          new ApiError("Delivered quantity cannot exceed ordered quantity", 400),
        );
      }
      orderItem.deliveredQuantity = newDeliveredQuantity;
    }

    const newDeliveredAmount = order.items.reduce(
      (sum, item) => sum + item.deliveredQuantity * item.price,
      0,
    );
    const delta = newDeliveredAmount - order.deliveredAmount;

    session.startTransaction();

    if (delta > 0) {
      const updatedUser = await applyWalletDelta(order.user, -delta, {
        session,
      });
      await recordWalletTransaction(
        {
          user: order.user,
          direction: "Debit",
          amount: delta,
          source: "ProductOrder",
          status: "Success",
          balanceAfter: updatedUser.walletAmount,
          refType: "productOrder",
          refId: order._id,
          createdBy: request.user._id,
          note: `Delivery update for order ${order._id}`,
        },
        { session },
      );
    }

    order.deliveredAmount = newDeliveredAmount;
    order.status = computeStatus(order.items);
    await order.save({ session });

    await session.commitTransaction();

    return response.status(200).json({
      success: true,
      message: "Delivery updated",
      data: order,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return next(
      new ApiError(error.message || "Error updating delivery", error.status || 500),
    );
  } finally {
    session.endSession();
  }
};

export const cancelProductOrder = async (request, response, next) => {
  try {
    const { id } = request.params;
    const order = await productOrderModal.findById(id);
    if (!order) {
      return next(new ApiError("Order not found", 404));
    }

    const isOwner = String(order.user) === String(request.user._id);
    const requestingUser = await userModal.findById(request.user._id);
    const isAdminUser = requestingUser?.role === "Admin";

    if (!isOwner && !isAdminUser) {
      return next(new ApiError("Not authorized to cancel this order", 403));
    }
    if (isOwner && !isAdminUser && order.status !== "Placed") {
      return next(
        new ApiError("Order can only be cancelled before it starts delivery", 400),
      );
    }
    if (isAdminUser && order.status === "Delivered") {
      return next(new ApiError("Cannot cancel a delivered order", 400));
    }
    if (order.status === "Cancelled") {
      return next(new ApiError("Order is already cancelled", 400));
    }

    order.status = "Cancelled";
    order.cancelledBy = isAdminUser ? "Admin" : "User";
    order.cancelledAt = new Date();
    await order.save();

    return response.status(200).json({
      success: true,
      message: "Order cancelled",
      data: order,
    });
  } catch (error) {
    return next(new ApiError(error.message || "Error cancelling order", 500));
  }
};
