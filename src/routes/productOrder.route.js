import { Router } from "express";
import {
  isAdmin,
  verifyUserToken,
} from "../middleware/userVerify.middeware.js";
import {
  cancelProductOrder,
  createProductOrder,
  getMyProductOrders,
  getProductOrders,
  updateProductOrderDelivery,
} from "../controllers/productOrder.controller.js";

const productOrderRoute = Router();

productOrderRoute.post("/", verifyUserToken, createProductOrder);
productOrderRoute.get("/mine", verifyUserToken, getMyProductOrders);
productOrderRoute.get("/", verifyUserToken, isAdmin, getProductOrders);
productOrderRoute.patch(
  "/:id/deliver",
  verifyUserToken,
  isAdmin,
  updateProductOrderDelivery,
);
productOrderRoute.patch("/:id/cancel", verifyUserToken, cancelProductOrder);

export default productOrderRoute;
