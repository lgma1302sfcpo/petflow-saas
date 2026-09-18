export class FiscalError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code = "FISCAL_ERROR", status = 400, details?: unknown) {
    super(message);
    this.name = "FiscalError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isFiscalError(error: unknown): error is FiscalError {
  return error instanceof FiscalError;
}
