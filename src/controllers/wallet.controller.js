import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { ApiError } from "../middleware/errorHandler.middleware.js";
import { userModal } from "../models/customer.modal.js";
import { walletTransactionModal } from "../models/walletTransaction.modal.js";
import { applyWalletDelta, recordWalletTransaction } from "../utils/wallet.js";
import {
  createPhonePeOrder,
  getPhonePeOrderStatus,
  validatePhonePeCallback,
} from "../utils/phonepe.js";

const WALLET_TOPUP_MIN = Number(process.env.WALLET_TOPUP_MIN || 10);
const WALLET_TOPUP_MAX = Number(process.env.WALLET_TOPUP_MAX || 5000);

export const recordCashPayment = async (req, res, next) => {
  const { userId, amount, direction, note } = req.body;
  if (!userId || !amount || !direction) {
    return next(new ApiError("userId, amount and direction are required", 400));
  }
  if (!["Credit", "Debit"].includes(direction)) {
    return next(new ApiError("direction must be Credit or Debit", 400));
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const signedAmount =
      direction === "Credit" ? Number(amount) : -Number(amount);
    const updatedUser = await applyWalletDelta(userId, signedAmount, {
      session,
    });
    const transaction = await recordWalletTransaction(
      {
        user: userId,
        direction,
        amount: Number(amount),
        source: "CashPayment",
        status: "Success",
        balanceAfter: updatedUser.walletAmount,
        createdBy: req.user._id,
        note,
      },
      { session },
    );
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Cash payment recorded",
      data: transaction,
      walletAmount: updatedUser.walletAmount,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return next(
      new ApiError(
        error.message || "Error recording cash payment",
        error.status || 500,
      ),
    );
  } finally {
    session.endSession();
  }
};

export const getWalletStatement = async (req, res, next) => {
  try {
    const {
      userId,
      startDate,
      endDate,
      source,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const reqUser = await userModal.findById(req.user._id);
    const filter = {};
    if (reqUser.role !== "Admin") {
      filter.user = req.user._id;
    } else if (userId) {
      filter.user = userId;
    }
    if (source) filter.source = source;
    if (status) filter.status = status;
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
      walletTransactionModal
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate("user", "name id profilePic")
        .populate("createdBy", "name id"),
      walletTransactionModal.countDocuments(filter),
    ]);

    const totalAmount = rows.reduce(
      (acc, row) =>
        acc + (row.direction === "Credit" ? row.amount : -row.amount),
      0,
    );

    return res.status(200).json({
      success: true,
      data: rows,
      totalCount,
      totalAmount,
      page: pageNumber,
      limit: pageSize,
    });
  } catch (error) {
    return next(
      new ApiError(error.message || "Error getting wallet statement", 500),
    );
  }
};

export const initiateUpiTopUp = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const amount = Number(req.body.amount);
    if (!amount || amount < WALLET_TOPUP_MIN || amount > WALLET_TOPUP_MAX) {
      return next(
        new ApiError(
          `Amount must be between ${WALLET_TOPUP_MIN} and ${WALLET_TOPUP_MAX}`,
          400,
        ),
      );
    }

    // The redirect target depends on how the client is running (Expo Go uses an
    // "exp://<lan-ip>:port/--/..." URL, a standalone/EAS build uses the app's own
    // "sitadairy://..." scheme), so the client computes and sends it per-request
    // rather than us using one fixed value from the environment.
    const clientRedirectUrl =
      typeof req.body.redirectUrl === "string" &&
      req.body.redirectUrl.trim().length > 0 &&
      req.body.redirectUrl.length < 500
        ? req.body.redirectUrl.trim()
        : null;
    const redirectUrl = clientRedirectUrl || process.env.PHONEPE_REDIRECT_URL;

    const merchantOrderId = nanoid();
    const transaction = await walletTransactionModal.create({
      user: userId,
      direction: "Credit",
      amount,
      source: "Top-up",
      status: "Pending",
      gateway: { merchantOrderId },
    });

    try {
      const payResponse = await createPhonePeOrder({
        merchantOrderId,
        amountPaise: Math.round(amount * 100),
        redirectUrl,
      });
      transaction.gateway.phonepeOrderId = payResponse.orderId;
      transaction.gateway.rawInitResponse = payResponse;
      await transaction.save();

      return res.status(200).json({
        success: true,
        message: "Top-up initiated",
        redirectUrl: payResponse.redirectUrl,
        merchantOrderId,
      });
    } catch (gatewayError) {
      transaction.status = "Failed";
      transaction.failureReason =
        gatewayError.message || "Failed to create PhonePe order";
      await transaction.save();
      throw gatewayError;
    }
  } catch (error) {
    return next(
      new ApiError(
        error.message || "Error initiating top-up",
        error.status || 500,
      ),
    );
  }
};

// Idempotent: no-ops if the transaction is missing or already left "Pending",
// so the webhook and reverify paths can race safely.
const reconcilePhonePeOrder = async (merchantOrderId, { state, raw }) => {
  const transaction = await walletTransactionModal.findOne({
    "gateway.merchantOrderId": merchantOrderId,
  });
  if (transaction?.status !== "Pending") {
    return transaction;
  }

  if (state === "COMPLETED") {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const updatedUser = await applyWalletDelta(
        transaction.user,
        transaction.amount,
        { session },
      );
      transaction.status = "Success";
      transaction.balanceAfter = updatedUser.walletAmount;
      transaction.gateway.rawCallback = raw;
      transaction.gateway.verifiedAt = new Date();
      await transaction.save({ session });
      await session.commitTransaction();
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw err;
    } finally {
      session.endSession();
    }
  } else if (state === "FAILED") {
    transaction.status = "Failed";
    transaction.failureReason = raw?.errorCode || "Payment failed";
    transaction.gateway.rawCallback = raw;
    await transaction.save();
  }
  // state === "PENDING" -> leave untouched, still pending

  return transaction;
};

export const handlePhonePeWebhook = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const callbackResponse = validatePhonePeCallback(authHeader, rawBody);
    const merchantOrderId = callbackResponse?.payload?.merchantOrderId;
    const state = callbackResponse?.payload?.state;
    if (merchantOrderId && state) {
      await reconcilePhonePeOrder(merchantOrderId, {
        state,
        raw: callbackResponse.payload,
      });
    }
    // PhonePe retries on non-2xx; once validated (or safely rejected) we
    // always ack so a transient DB hiccup doesn't trigger a retry storm.
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("PhonePe webhook error", error);
    return res.status(200).json({ success: false });
  }
};

export const reverifyUpiTopUp = async (req, res, next) => {
  try {
    const { merchantOrderId } = req.params;
    const transaction = await walletTransactionModal.findOne({
      "gateway.merchantOrderId": merchantOrderId,
    });
    if (!transaction) {
      return next(new ApiError("Top-up not found", 404));
    }

    const isOwner = String(transaction.user) === String(req.user._id);
    if (!isOwner) {
      const reqUser = await userModal.findById(req.user._id);
      if (reqUser.role !== "Admin") {
        return next(
          new ApiError("Not authorized to reverify this top-up", 403),
        );
      }
    }

    if (transaction.status !== "Pending") {
      return res.status(200).json({
        success: true,
        message: "Already finalized",
        data: transaction,
      });
    }

    const statusResponse = await getPhonePeOrderStatus(merchantOrderId);
    const updated = await reconcilePhonePeOrder(merchantOrderId, {
      state: statusResponse.state,
      raw: statusResponse,
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return next(new ApiError(error.message || "Error reverifying top-up", 500));
  }
};
