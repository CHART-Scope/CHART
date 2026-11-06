/**
 * One request per published read, for the life of the page.
 *
 * Explore only reads stored estimates, so a response for a place, month or
 * period does not change while someone browses. Remembering the promise
 * (not just the result) also collapses concurrent asks for the same thing -
 * a hover prefetch and the click that follows share one request - and going
 * back to a place answers instantly instead of reloading the map.
 */

const entries = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 400;

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit) {
    // Most recently used last, so eviction drops the oldest.
    entries.delete(key);
    entries.set(key, hit);
    return hit as Promise<T>;
  }
  const promise = load();
  entries.set(key, promise);
  // A failed request (network, timeout) may succeed later; a refusal of a
  // place without data would only repeat, but retrying it is harmless.
  promise.catch(() => entries.delete(key));
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  return promise;
}

/** Record a response under another key that names the same read. */
export function prime<T>(key: string, value: T) {
  if (!entries.has(key)) entries.set(key, Promise.resolve(value));
}
