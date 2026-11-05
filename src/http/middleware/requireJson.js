import { UnsupportedMediaTypeError } from "../../errors.js";

// express.json() silently skips any other Content-Type and leaves req.body empty, so without
// this check text/plain would fall through to validation as a misleading 422.
// req.is() returns null when the request has no body (GET, DELETE): those pass. false means a
// body of the wrong type.
export function requireJson(req, _res, next) {
  next(req.is("application/json") === false ? new UnsupportedMediaTypeError() : undefined);
}
