export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A storage that lives as long as the page, used when the browser refuses its own. */
export function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
