import pino from "pino";

const isLambda = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT,
);

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(isLambda
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
});
