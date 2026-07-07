import mongoose from "mongoose";
import { ApiError } from "../middleware/errorHandler.middleware.js";
import { userModal } from "../models/customer.modal.js";
import { paymentModal } from "../models/payment.modal.js";

export const addPaymentToUserAccount = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, amount, date, code = "Paid" } = req.body;
    const newWalledAmount = Number(amount);
    const dateObj = new Date(date);
    if (code === "Paid") {
      await userModal.updateOne(
        { _id: userId },
        { $inc: { walletAmount: -newWalledAmount } },
        { session }
      );
      await paymentModal.create(
        [
          {
            amount,
            date: dateObj,
            paymentType: "Paid",
            fromUser: req.user._id,
            toUser: userId,
          },
        ],
        { session }
      );
    } else {
      await userModal.updateOne(
        { _id: userId },
        { $inc: { walletAmount: newWalledAmount } },
        { session }
      );
      await paymentModal.create(
        [
          {
            amount,
            date: dateObj,
            paymentType: "Recieve",
            fromUser: userId,
            toUser: req.user._id,
          },
        ],
        { session }
      );
    }
    await session.commitTransaction();
    session.endSession();
    return res
      .status(200)
      .json({ success: true, message: "Walled Amount Updated" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(new ApiError("Error while creating Payment", 500));
  }
};
export const paymentReport = async (req, res, next) => {
  try {
    const { startDate, endDate, date, code = "Paid" } = req.body;
    let userId;
    const filter = {};

    const reqUser = await userModal.findById(req.user._id);

    if (reqUser.role !== "Admin" && !userId) {
      userId = req.user._id;
    } else {
      userId = req.body.userId;
    }
    // Filter by specific date
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(targetDate.getDate() + 1);

      filter.date = { $gte: targetDate, $lt: nextDay };
    }
    // Filter by date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999); // Include the full end day

      filter.date = {
        $gte: start,
        $lte: end,
      };
    }
    // Filter by user
    if (code === "Paid") {
      filter.paymentType = "Paid";
    }
    if (code === "Recieve") {
      filter.paymentType = "Recieve";
    }
    if (code === "Paid" && userId) {
      filter.toUser = userId;
    }
    if (code === "Recieve" && userId) {
      filter.fromUser = userId;
    }
    const data = await paymentModal
      .find(filter)
      .populate("toUser", "name id profilePic")
      .populate("fromUser", "name id profilePic")
      .sort({ date: -1 });
    let totalAmount = 0;
    const totalAmountArray = data.map((entry) => {
      totalAmount += Number(entry.amount);
    });
    return res.status(200).json({ success: true, data, totalAmount });
  } catch (error) {
    return next(new ApiError("Error while getting Payment Report", 500));
  }
};
export const resetWalletAmount = async (req, res, next) => {
  try {
    const { userId } = req.body;
    await userModal.updateOne({ _id: userId }, { walletAmount: 0 });
    return res
      .status(200)
      .json({ success: true, message: "Wallet Amount Reset Successfully" });
  } catch (error) {
    return next(new ApiError("Error while getting Payment Report", 500));
  }
};
