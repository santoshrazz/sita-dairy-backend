import { Router } from "express";
import {
  isAdmin,
  verifyUserToken,
} from "../middleware/userVerify.middeware.js";
import {
  recordCashPayment,
  getWalletStatement,
  initiateUpiTopUp,
  handlePhonePeWebhook,
  reverifyUpiTopUp,
} from "../controllers/wallet.controller.js";

const walletRoute = Router();

walletRoute.post("/cash-payment", verifyUserToken, isAdmin, recordCashPayment);
walletRoute.get("/statement", verifyUserToken, getWalletStatement);
walletRoute.post("/upi-topup/initiate", verifyUserToken, initiateUpiTopUp);
walletRoute.post("/upi-topup/webhook", handlePhonePeWebhook);
walletRoute.post(
  "/upi-topup/:merchantOrderId/reverify",
  verifyUserToken,
  reverifyUpiTopUp,
);

export default walletRoute;
