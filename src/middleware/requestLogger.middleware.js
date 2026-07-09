import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";
import { redactSensitive } from "../utils/redact.js";

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || randomUUID(),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customReceivedMessage: () => "Request received",
  customReceivedObject: (req) => ({
    body: redactSensitive(req.body),
  }),
  customSuccessMessage: () => "Response sent",
  customSuccessObject: (req, res, val) => ({
    ...val,
    responseBody: res.capturedBody,
  }),
  customErrorMessage: () => "Response sent",
  customErrorObject: (req, res, error, val) => ({
    ...val,
    responseBody: res.capturedBody,
  }),
  serializers: {
    // default serializers dump full headers (including Authorization) into
    // every log line - keep only what's needed and never touch headers.
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

// Captures the object/body passed to res.json()/res.send() before Express
// serializes and sends it, so the "Response sent" log can include it.
export const captureResponseBody = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.capturedBody = redactSensitive(body);
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (res.capturedBody === undefined) {
      res.capturedBody = redactSensitive(body);
    }
    return originalSend(body);
  };

  next();
};
