import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      // headers
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-razorpay-signature",
      // common secrets in bodies
      "req.body.password",
      "req.body.newPassword",
      "req.body.oldPassword",
      "req.body.token",
      "req.body.resetToken",
      "req.body.googleToken",
      // PII fields
      "req.body.dateOfBirth",
      "req.body.timeOfBirth",
      "req.body.placeOfBirth",
      "req.body.latitude",
      "req.body.longitude",
      // payment identifiers
      "req.body.signature",
      "req.body.gatewaySignature",
      "req.body.razorpay_signature",
    ],
    remove: true,
  },
});

