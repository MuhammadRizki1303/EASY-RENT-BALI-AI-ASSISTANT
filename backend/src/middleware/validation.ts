import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export function validateBody(schema: ZodType) {
  return (request: Request, response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    request.body = parsed.data;
    next();
  };
}
