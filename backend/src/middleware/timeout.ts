import type { NextFunction, Request, Response } from 'express';

export function apiTimeout(timeoutMs = 30000) {
  return (request: Request, response: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!response.headersSent) {
        response.status(504).json({
          error: 'Request timed out',
          code: 'GATEWAY_TIMEOUT',
        });
      }
      response.end();
    }, timeoutMs);
    response.on('finish', () => clearTimeout(timer));
    response.on('close', () => clearTimeout(timer));
    next();
  };
}
