/**
 * Cloudflare Workers throw "Illegal invocation" when the platform `fetch` runs with any
 * `this` other than the global object, which is what happens when it is stored on an
 * object and called as a method (`this.fetchImpl(url)`, `deps.fetch(url)`). Node does not
 * check, so it only fails in production. Wrap any fetch kept on an object with this.
 */
export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function unboundFetch(fetchImpl: FetchFn = fetch): FetchFn {
  return (input, init) => fetchImpl(input, init);
}
