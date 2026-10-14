interface ErrorBody {
  detail?: unknown;
  extra?: unknown;
}

function firstValidationMessage(body: ErrorBody | undefined): string | undefined {
  if (!Array.isArray(body?.extra)) return undefined;
  for (const item of body.extra as unknown[]) {
    if (typeof item === 'object' && item !== null && 'message' in item) {
      const message = (item as { message: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return undefined;
}

/** A message a player can act on for an error response of the API. */
export function messageFor(status: number, body: ErrorBody | undefined): string {
  if (status === 409) return 'That username is taken.';
  if (status === 401) return 'Wrong username or password.';
  if (status === 400) {
    return firstValidationMessage(body) ?? 'Please check what you entered.';
  }
  if (status === 429 || status >= 500) return 'The server is busy, please try again later.';
  return 'Something went wrong.';
}
