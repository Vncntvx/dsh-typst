/**
 * The `typst_render_pages` tool card: durable attachments render through the
 * provided loader, and every non-image shape still shows text instead of an
 * empty row.
 * @module tests/client/toolviews
 */

// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import { RenderPagesToolView } from "../../src/client/toolviews.js";
import { en } from "../../src/client/locales.js";

const attachment: ImageAttachmentRef = {
  attachmentId: "attachment-1" as ImageAttachmentRef["attachmentId"],
  mediaType: "image/png",
  bytes: 10,
  width: 1,
  height: 1,
  name: "page-1.png",
};

function props(block: unknown, loadImage = vi.fn(async () => "blob:page-1")) {
  return {
    block,
    loadImage,
    t: (key: keyof typeof en) => en[key],
  } as unknown as Parameters<typeof RenderPagesToolView>[0];
}

describe("RenderPagesToolView", () => {
  it("loads and shows the durable image attachments", async () => {
    const load = vi.fn(async () => "blob:page-1");
    render(
      <RenderPagesToolView
        {...props(
          {
            phase: "result",
            meta: { pages: [1], images: [{ page: 1, attachment }] },
            content: [{ type: "text", text: "Rendered page 1." }],
          },
          load,
        )}
      />,
    );
    await waitFor(() => expect(screen.getByRole("img")).toBeDefined());
    expect(load).toHaveBeenCalledWith(attachment);
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:page-1");
  });

  it("shows the result text when no image was returned", () => {
    render(
      <RenderPagesToolView
        {...props({
          phase: "result",
          meta: { pages: [] },
          content: [{ type: "text", text: "The document does not compile." }],
        })}
      />,
    );
    expect(screen.getByText("The document does not compile.")).toBeDefined();
  });

  it("does not throw on malformed replay metadata", () => {
    render(
      <RenderPagesToolView
        {...props({
          phase: "result",
          meta: { images: [{ page: "not a number", attachment: null }] },
          content: [],
        })}
      />,
    );
    expect(screen.getByText("Rendering pages…")).toBeDefined();
  });
});
