/**
 * Typed domain errors (ADR-0016).
 *
 * Services throw these transport-free errors; adapters (Server Actions, future
 * route handlers) translate them — a Server Action into a form result, an API
 * into an HTTP status. Services stay unaware of the transport.
 */

export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PERMISSION"
  | "UNAUTHENTICATED";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Field-keyed validation messages (matches zod's `flattenError` shape). */
export type FieldErrors = Record<string, string[] | undefined>;

/** Input failed validation (ADR-0016 — parsed at the top of every service). */
export class ValidationError extends DomainError {
  readonly code = "VALIDATION" as const;
  /** Field-keyed messages, suitable for a form adapter to surface inline. */
  readonly fieldErrors: FieldErrors;

  constructor(message = "Validation failed", fieldErrors: FieldErrors = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

/** A scoped entity was not found (or is not visible within the caller's scope). */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(message = "Not found") {
    super(message);
  }
}

/** The operation conflicts with current state (e.g. a uniqueness or sequencing rule). */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor(message = "Conflict") {
    super(message);
  }
}

/** The caller is authenticated but not allowed to perform the operation. */
export class PermissionError extends DomainError {
  readonly code = "PERMISSION" as const;

  constructor(message = "Not permitted") {
    super(message);
  }
}

/** No resolved session — the caller could not be authenticated. */
export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED" as const;

  constructor(message = "Not authenticated") {
    super(message);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
