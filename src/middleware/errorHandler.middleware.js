export const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || 500;
  const message = err.message || "SOMETHING WENT WRONG";
  res.status(statusCode).json({
    success: false,
    message,
  });
};

export class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.status = statusCode;
  }
}
