import { expect, it, vi } from "vitest";
import { PageSizeCache } from "../../src/client/pdf/page-size.js";
import type { PdfDocument } from "../../src/client/pdf/document.js";

it("loads one page's geometry once and shares the in-flight request", async () => {
  const getPage = vi.fn(async () => ({
    getViewport: () => ({ width: 600, height: 800 }),
  }));
  const document = { getPage } as unknown as PdfDocument;
  const cache = new PageSizeCache(document);
  const [a, b] = await Promise.all([cache.load(2), cache.load(2)]);
  expect(a).toEqual({ width: 600, height: 800 });
  expect(b).toBe(a);
  expect(getPage).toHaveBeenCalledTimes(1);
  expect(getPage).toHaveBeenCalledWith(3);
  expect(await cache.load(2)).toBe(a);
  expect(getPage).toHaveBeenCalledTimes(1);
});

it("exposes resolved sizes to the reader and page surfaces without another read", async () => {
  const getPage = vi.fn(async (number: number) => ({
    getViewport: () => ({ width: 500 + number, height: 700 + number }),
  }));
  const cache = new PageSizeCache({ getPage } as unknown as PdfDocument);
  expect(cache.get(0)).toBeUndefined();
  await cache.load(0);
  expect(cache.get(0)).toEqual({ width: 501, height: 701 });
  expect(getPage).toHaveBeenCalledTimes(1);
});

it("drops a failed request so the page can be retried", async () => {
  const getPage = vi
    .fn()
    .mockRejectedValueOnce(new Error("page unavailable"))
    .mockResolvedValue({
      getViewport: () => ({ width: 612, height: 792 }),
    });
  const cache = new PageSizeCache({ getPage } as unknown as PdfDocument);
  await expect(cache.load(0)).rejects.toThrow("page unavailable");
  expect(cache.get(0)).toBeUndefined();
  expect(await cache.load(0)).toEqual({ width: 612, height: 792 });
  expect(getPage).toHaveBeenCalledTimes(2);
});
