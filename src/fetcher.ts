export class Fetcher {
  constructor(readonly urls: string[]) {}
  fetchJson<T>(urlSuffix: string, init?: RequestInit): Promise<T> {
    return this.fetch((res) => res.json(), urlSuffix, init);
  }
  fetchBytes(urlSuffix: string, init?: RequestInit): Promise<Uint8Array> {
    return this.fetch(
      async (res) => new Uint8Array(await res.arrayBuffer()),
      urlSuffix,
      init
    );
  }
  async fetch<T>(
    handler: (res: Response) => Promise<T>,
    urlSuffix: string,
    init?: RequestInit
  ): Promise<T> {
    for (const url of this.urls) {
      const res = await fetch(url + urlSuffix, init);
      if (!res.ok) continue;
      try {
        return await handler(res);
      } catch {
        // ignore
      }
    }
    throw new Error('all urls failed!');
  }
}
