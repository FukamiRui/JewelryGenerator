import { NextResponse } from "next/server";

export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, "Please sign in to continue.", "unauthorized"),
  noTenant: () =>
    new AppError(404, "No store account found for this user.", "no_tenant"),
  noCustomer: () =>
    new AppError(404, "No customer profile found for this user.", "no_customer"),
  notFound: (what: string) => new AppError(404, `${what} not found.`, "not_found"),
  badRequest: (message: string) => new AppError(400, message, "bad_request"),
  creditLimitReached: () =>
    new AppError(
      402,
      "Monthly credit limit reached. Please purchase additional credits.",
      "credit_limit"
    ),
  upstream: (service: string) =>
    new AppError(502, `${service} is temporarily unavailable. Please try again.`, "upstream_error"),
  rateLimited: (message: string) => new AppError(429, message, "rate_limited"),
  forbidden: (message: string = "You don't have access to this.") =>
    new AppError(403, message, "forbidden"),
  contactInfoBlocked: (reason: string) =>
    new AppError(
      400,
      `Please keep contact details off Atelier (found ${reason}) — orders, payments, and support only work when everything stays in this chat.`,
      "contact_info_blocked"
    ),
  revisionLimitReached: (max: number) =>
    new AppError(
      429,
      `You've used all ${max} design tries for this request. Ask the shop for more, or try the advisor's suggestions.`,
      "revision_limit_reached"
    ),
  subscriptionRequired: (message: string) => new AppError(403, message, "subscription_required"),
};

export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      console.error("[unhandled API error]", err);
      return NextResponse.json(
        { error: "Something went wrong on our end. Please try again.", code: "internal_error" },
        { status: 500 }
      );
    }
  };
}
