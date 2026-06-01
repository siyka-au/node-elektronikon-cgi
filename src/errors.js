export class ElektronikonError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? "ELEKTRONIKON_ERROR";
    this.context = options.context ?? {};
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause instanceof Error ? {
        name: this.cause.name,
        message: this.cause.message,
      } : this.cause ?? null,
    };
  }
}

export class InvalidSelectorError extends ElektronikonError {
  constructor(selector, reason) {
    super(`Invalid selector ${JSON.stringify(selector)}: ${reason}`, {
      code: "INVALID_SELECTOR",
      context: { selector, reason },
    });
  }
}

export class ElektronikonHttpError extends ElektronikonError {
  constructor(message, context, cause) {
    super(message, {
      code: "HTTP_ERROR",
      context,
      cause,
    });
  }
}

export class ResponseAlignmentError extends ElektronikonError {
  constructor(message, context) {
    super(message, {
      code: "RESPONSE_ALIGNMENT_ERROR",
      context,
    });
  }
}

export class UsageError extends ElektronikonError {
  constructor(message, context = {}) {
    super(message, {
      code: "USAGE_ERROR",
      context,
    });
  }
}

export class UnknownPointError extends ElektronikonError {
  constructor(pointId) {
    super(`Unknown discovered point: ${pointId}`, {
      code: "UNKNOWN_POINT",
      context: { pointId },
    });
  }
}

export class UnknownFamilyError extends ElektronikonError {
  constructor(family) {
    super(`Unknown family: ${family}`, {
      code: "UNKNOWN_FAMILY",
      context: { family },
    });
  }
}