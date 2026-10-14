export const SESSION_KEY = 'trust-issues.session.v1';

export interface Session {
  token: string;
  username: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function expiryOf(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims === 'object' && claims !== null && 'exp' in claims) {
      const exp = (claims as { exp: unknown }).exp;
      return typeof exp === 'number' ? exp : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * The signed-in user of this browser. The token is only read for its expiry so the game can
 * sign out on its own; the server decides what a token is worth. When the storage refuses
 * writes the session lives in memory for this page.
 */
export class SessionStore {
  private memory: Session | undefined;

  constructor(
    private readonly storage: StorageLike,
    private readonly now: () => number = Date.now,
  ) {}

  current(): Session | undefined {
    const session = this.memory ?? this.read();
    if (!session) return undefined;
    const exp = expiryOf(session.token);
    if (exp === undefined || exp * 1000 <= this.now()) {
      this.clear();
      return undefined;
    }
    return session;
  }

  save(token: string, username: string): void {
    const session = { token, username };
    this.memory = session;
    try {
      this.storage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      return;
    }
  }

  clear(): void {
    this.memory = undefined;
    try {
      this.storage.removeItem(SESSION_KEY);
    } catch {
      return;
    }
  }

  private read(): Session | undefined {
    try {
      const raw = this.storage.getItem(SESSION_KEY);
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return undefined;
      const { token, username } = parsed as Record<string, unknown>;
      if (typeof token === 'string' && typeof username === 'string') return { token, username };
    } catch {
      return undefined;
    }
    return undefined;
  }
}
