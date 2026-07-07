import { Router } from "express";
import {
  addPaymentToUserAccount,
  paymentReport,
  resetWalletAmount,
} from "../controllers/payment.controller.js";
import {
  isAdmin,
  verifyUserToken,
} from "../middleware/userVerify.middeware.js";
const paymentRoute = Router();
paymentRoute.post(
  "/add-payment",
  verifyUserToken,
  isAdmin,
  addPaymentToUserAccount
);
paymentRoute.post("/payment-report", verifyUserToken, paymentReport);
paymentRoute.post(
  "/reset-payment",
  verifyUserToken,
  isAdmin,
  resetWalletAmount
);
export default paymentRoute;
