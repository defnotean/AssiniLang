import { describe, expect, it, vi } from "vitest";
import { Agent } from "undici";
import { fetchUrlText, htmlToText } from "./ingestion.js";

const publicLookup = async () => ({ address: "93.184.216.34", family: 4 });
const privateLookup = async () => ({ address: "10.0.0.5", family: 4 });
const failingLookup = async (): Promise<{ address: string; family: number }> => {
  throw new Error("ENOTFOUND");
};

describe("htmlToText", () => {
  it("strips markup, scripts, and decodes entities", () => {
    const text = htmlToText(
      "<html><head><style>p{}</style><script>var x=1;</script></head>" +
        "<body><p>mira &amp; saku</p><div>talo&nbsp;walks</div></body></html>"
    );

    expect(text).toContain("mira & saku");
    expect(text).toContain("talo walks");
    expect(text).not.toContain("var x");
  });
});

describe("fetchUrlText", () => {
  it("extracts text from an HTML response", async () => {
    const fetchStub = (async () =>
      new Response("<html><body><p>mira = river</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })) as typeof fetch;

    const text = await fetchUrlText("https://example.test/words", fetchStub, {
      env: {},
      lookupFn: publicLookup
    });
    expect(text).toContain("mira = river");
  });

  it("pins a public hostname's approved address into the actual fetch connection", async () => {
    let dispatcher: unknown;
    const lookupFn = vi.fn(publicLookup);
    const fetchStub = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      dispatcher = (init as unknown as { dispatcher?: unknown } | undefined)?.dispatcher;
      return new Response("mira = river", {
        status: 200,
        headers: { "content-type": "text/plain" }
      });
    }) as typeof fetch;

    const text = await fetchUrlText("https://rebinding.example/words", fetchStub, { env: {}, lookupFn });

    expect(text).toBe("mira = river");
    expect(lookupFn).toHaveBeenCalledTimes(1);
    expect(dispatcher).toBeInstanceOf(Agent);
    expect((dispatcher as Agent).destroyed).toBe(true);
  });

  it("rejects non-http URLs", async () => {
    await expect(fetchUrlText("file:///etc/passwd")).rejects.toThrow(/http or https/);
  });

  it("rejects failing responses", async () => {
    const fetchStub = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    await expect(
      fetchUrlText("https://example.test/missing", fetchStub, { env: {}, lookupFn: publicLookup })
    ).rejects.toThrow(/status 404/);
  });

  it("rejects private IPv4 literal URLs before fetching", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(fetchUrlText("http://192.168.1.10/words", fetchStub, { env: {} })).rejects.toThrow(
      /private or local network/
    );
    await expect(fetchUrlText("http://10.0.0.1/words", fetchStub, { env: {} })).rejects.toThrow(
      /private or local network/
    );
    await expect(fetchUrlText("http://169.254.169.254/latest/meta-data", fetchStub, { env: {} })).rejects.toThrow(
      /private or local network/
    );
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects localhost and loopback URLs before fetching", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(fetchUrlText("http://localhost:4321/words", fetchStub, { env: {} })).rejects.toThrow(
      /private or local network/
    );
    await expect(fetchUrlText("http://127.0.0.1/words", fetchStub, { env: {} })).rejects.toThrow(
      /private or local network/
    );
    await expect(fetchUrlText("http://[::1]/words", fetchStub, { env: {} })).rejects.toThrow(
      /private or local network/
    );
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects public-looking hostnames that resolve to private addresses", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(
      fetchUrlText("https://internal.example.com/words", fetchStub, { env: {}, lookupFn: privateLookup })
    ).rejects.toThrow(/resolves to a private or local network/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects unresolvable hostnames before fetching", async () => {
    const fetchStub = vi.fn() as unknown as typeof fetch;
    await expect(
      fetchUrlText("https://nowhere.example.com/words", fetchStub, { env: {}, lookupFn: failingLookup })
    ).rejects.toThrow(/could not be resolved and was blocked/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("allows private URLs when ASSINI_ALLOW_PRIVATE_URLS is set", async () => {
    const fetchStub = (async () =>
      new Response("mira = river", {
        status: 200,
        headers: { "content-type": "text/plain" }
      })) as typeof fetch;

    const text = await fetchUrlText("http://127.0.0.1:9000/list", fetchStub, {
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" }
    });
    expect(text).toContain("mira = river");
  });
});
