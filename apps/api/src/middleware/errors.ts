import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

import { HttpError, ValidationError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
};

interface BodyParserError {
  type?: string;
  status?: number;
}

function normalise(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ZodError) return new ValidationError(err, 'body');
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Resume must be 10 MB or smaller');
    }
    return new HttpError(400, 'BAD_REQUEST', `Upload error: ${err.message}`, { code: err.code });
  }
  const bp = err as BodyParserError;
  if (bp?.type === 'entity.parse.failed') return new HttpError(400, 'BAD_REQUEST', 'Malformed JSON body');
  if (bp?.type === 'entity.too.large') return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (bp?.type && bp.status && bp.status >= 400 && bp.status < 500) {
    return new HttpError(400, 'BAD_REQUEST', 'Bad request body');
  }
  const mongo = err as { code?: number; name?: string };
  if (mongo?.code === 11000) return new HttpError(409, 'CONFLICT', 'Duplicate resource');
  return new HttpError(500, 'INTERNAL', 'Internal server error');
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    req.log?.error({ err }, 'error after headers were sent');
    next(err);
    return;
  }
  const httpError = normalise(err);
  if (httpError.status >= 500) req.log?.error({ err }, 'unhandled error');
  else req.log?.debug({ code: httpError.code }, 'request rejected');

  const body: Record<string, unknown> = { code: httpError.code, message: httpError.message };
  if (httpError instanceof ValidationError) body['issues'] = httpError.issues;
  if (httpError.details !== undefined) body['details'] = httpError.details;
  if (httpError.status === 429) {
    const retry = (httpError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (retry) res.setHeader('Retry-After', String(retry));
  }
  res.status(httpError.status).json({ error: body });
};
