import express from "express";
import userRoute from "./routes/user.route.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { milkRouter } from "./routes/milk.route.js";
import productRoute from "./routes/product.route.js";
import rateChartRouter from "./routes/ratechart.route.js";
import { generalRouter } from "./routes/general.route.js";
import walletRoute from "./routes/wallet.route.js";
import {
  httpLogger,
  captureResponseBody,
} from "./middleware/requestLogger.middleware.js";

const app = express();
app.disable("x-powered-by");
// app.use((req, res, next) => {
//   // serverless-http stores the original Lambda event at res.locals.serverless.event
//   const lambdaEvent = res.locals.serverless?.event || {};
//   let parsed = false;

//   if (lambdaEvent.isBase64Encoded && typeof lambdaEvent.body === "string") {
//     // 1) If API Gateway marked the payload as Base64, decode then parse
//     try {
//       const decoded = Buffer.from(lambdaEvent.body, "base64").toString("utf8");
//       req.body = JSON.parse(decoded);
//       parsed = true;
//     } catch (_) {
//       // If parsing fails, leave req.body as-is (could be {} or Buffer).
//       req.body = {};
//       parsed = true;
//     }
//   }

//   // 2) If req.body was already a Buffer (e.g. serverless-http gave us a Buffer), parse it
//   if (!parsed && Buffer.isBuffer(req.body)) {
//     try {
//       const str = req.body.toString("utf8");
//       req.body = JSON.parse(str);
//       parsed = true;
//     } catch (_) {
//       req.body = {};
//       parsed = true;
//     }
//   }

//   return next();
// });

app.use(
  express.json({
    limit: "5mb",
    verify: (req, res, buf) => {
      // preserved verbatim for PhonePe webhook signature validation, which
      // hashes the exact raw body rather than a re-serialized JSON object
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use(httpLogger);
app.use(captureResponseBody);

const corsOptions = {
  origin: ["*"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};
app.use(cors(corsOptions));

app.set("trust proxy", 1);
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use(limiter);
app.get("/", (req, res) => {
  res.send(
    "Hello From Santosh's Api And Deployed First PipeLine on 23-05-2026",
  );
});
app.use("/api/v1/user", userRoute);
app.use("/api/v1/milk", milkRouter);
app.use("/api/v1/product", productRoute);
app.use("/api/v1/ratechart", rateChartRouter);
app.use("/api/v1/general", generalRouter);
app.use("/api/v1/wallet", walletRoute);
app.use(errorHandler);
export { app };
