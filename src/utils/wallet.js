import { userModal } from "../models/customer.modal.js";
import { walletTransactionModal } from "../models/walletTransaction.modal.js";
import { ApiError } from "../middleware/errorHandler.middleware.js";

export const applyWalletDelta = async (
  userId,
  signedDelta,
  { session, force = false } = {},
) => {
  const query = { _id: userId };
  if (!force) {
    query.$expr = {
      $or: [
        { $eq: ["$allowNegativeBalance", true] },
        { $gte: [{ $add: ["$walletAmount", signedDelta] }, 0] },
      ],
    };
  }
  const updatedUser = await userModal.findOneAndUpdate(
    query,
    { $inc: { walletAmount: signedDelta } },
    { new: true, session },
  );
  if (!updatedUser) {
    throw new ApiError("Insufficient wallet balance", 400);
  }
  return updatedUser;
};

export const recordWalletTransaction = async (data, { session } = {}) => {
  const [created] = await walletTransactionModal.create([data], { session });
  return created;
};

export const milkEntrySignedAmount = (entry) =>
  entry.entryType === "Buy" ? Number(entry.price) : -Number(entry.price);

export const applyMilkWalletEffect = async (entry, { session }) => {
  const signedAmount = milkEntrySignedAmount(entry);
  const updatedUser = await applyWalletDelta(entry.byUser, signedAmount, {
    session,
  });
  await recordWalletTransaction(
    {
      user: entry.byUser,
      direction: signedAmount >= 0 ? "Credit" : "Debit",
      amount: Math.abs(signedAmount),
      source: entry.entryType === "Buy" ? "MilkBuy" : "MilkSell",
      status: "Success",
      balanceAfter: updatedUser.walletAmount,
      refType: "milk",
      refId: entry._id,
    },
    { session },
  );
  return updatedUser;
};

export const reverseMilkWalletEffect = async (entry, { session }) => {
  const signedAmount = milkEntrySignedAmount(entry);
  const updatedUser = await applyWalletDelta(entry.byUser, -signedAmount, {
    session,
    force: true,
  });
  await recordWalletTransaction(
    {
      user: entry.byUser,
      direction: signedAmount >= 0 ? "Debit" : "Credit",
      amount: Math.abs(signedAmount),
      source: entry.entryType === "Buy" ? "MilkBuy" : "MilkSell",
      status: "Success",
      balanceAfter: updatedUser.walletAmount,
      refType: "milk",
      refId: entry._id,
    },
    { session },
  );
  return updatedUser;
};
