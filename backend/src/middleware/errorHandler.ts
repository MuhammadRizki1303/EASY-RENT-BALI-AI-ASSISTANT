import type { ErrorRequestHandler, Request, Response } from 'express';

export const notFoundHandler = (request: Request, response: Response) => {
  response.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response) => {
  const status =
    typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 500;
  response.status(status).json({
    error: status >= 500 ? 'Internal server error' : 'Request failed',
    code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
  });
};
