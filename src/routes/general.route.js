import { Router } from "express";
import { dropDown } from "../controllers/general.controller.js";
import {
  isAdmin,
  verifyUserToken,
} from "../middleware/userVerify.middeware.js";

const generalRouter = Router();

// Route for Admins
generalRouter.post("/dropdown", verifyUserToken, isAdmin, dropDown);
export { generalRouter };
