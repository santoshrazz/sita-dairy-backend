import { Router } from "express";
import {
  isAdmin,
  verifyUserToken,
} from "../middleware/userVerify.middeware.js";
import {
  createRateChart,
  getRateChart,
  updateRateChart,
} from "../controllers/ratechart.controller.js";

const rateChartRouter = Router();

// Route for ratechart
rateChartRouter.get("/", verifyUserToken, isAdmin, getRateChart);
rateChartRouter.post("/", verifyUserToken, isAdmin, createRateChart);
rateChartRouter.put("/:id", verifyUserToken, isAdmin, updateRateChart);

export default rateChartRouter;
