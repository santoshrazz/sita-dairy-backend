const SENSITIVE_KEYS = new Set([
  "password",
  "oldpassword",
  "newpassword",
  "token",
  "authorization",
  "clientsecret",
  "client_secret",
]);

const REDACTED = "***REDACTED***";

// Deep-redacts sensitive keys out of arbitrary response/request payloads
// (plain objects, Mongoose documents, arrays, Dates) before they're logged.
export const redactSensitive = (value) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value !== null && typeof value === "object") {
    const plain = typeof value.toJSON === "function" ? value.toJSON() : value;
    if (plain === null || typeof plain !== "object") {
      return redactSensitive(plain);
    }
    if (Array.isArray(plain)) {
      return plain.map(redactSensitive);
    }
    const result = {};
    for (const [key, val] of Object.entries(plain)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactSensitive(val);
    }
    return result;
  }
  return value;
};
