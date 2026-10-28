import {
  AppError,
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "../../errors.js";
import { logger } from "../../logger.js";

// Errors thrown by express.json() (body-parser) carry a `type`. Map them to our own errors
// so bad input gets a clean 4xx instead of falling through to the 500 branch.
const bodyParserErrors = {
  "entity.parse.failed": () => new BadRequestError("Malformed JSON body"),
  "entity.too.large": () => new PayloadTooLargeError(),
  "encoding.unsupported": () => new UnsupportedMediaTypeError("Unsupported body encoding"),
  "charset.unsupported": () => new UnsupportedMediaTypeError("Unsupported body charset"),
};

// Runs when no route matched. Same envelope as every other error.
export function notFound(req, res, next) {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`));
}

// Express recognizes an error handler by its four arguments, so `next` must stay in the list.
export function errorHandler(err, req, res, next) {
  // Response already started (e.g. mid-stream): let Express close the connection.
  if (res.headersSent) return next(err);

  const mapped = bodyParserErrors[err?.type]?.();
  const appError = err instanceof AppError ? err : mapped;

  if (appError) {
    if (appError.status >= 500) {
      logger.error({ err, method: req.method, path: req.path }, appError.message);
    }
    const body = { code: appError.code, message: appError.message };
    if (appError.details !== undefined) body.details = appError.details;
    return res.status(appError.status).json({ error: body });
  }

  // Unknown error = a bug. Full detail to the log, nothing internal to the client.
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
