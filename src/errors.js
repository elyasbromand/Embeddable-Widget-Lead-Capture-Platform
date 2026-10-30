// Errors we expect and can describe to the client. Anything that is not an AppError is a bug
// and becomes a generic 500 in the error handler.
// Services throw these; only the HTTP layer turns them into a status code and JSON.

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code; // stable, machine-readable; clients branch on this, not on the message
    this.details = details; // optional, e.g. per-field validation problems
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

// Also used for "exists but belongs to another tenant", so the client cannot tell the two apart.
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, "CONFLICT", message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Request body is too large") {
    super(413, "PAYLOAD_TOO_LARGE", message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Content-Type must be application/json") {
    super(415, "UNSUPPORTED_MEDIA_TYPE", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details = []) {
    super(422, "VALIDATION_FAILED", message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
}
