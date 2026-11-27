import { describe, expect, it } from "vitest";
import { resolveDocHref } from "@/lib/docs/markdown-links";
import type { DocEntry } from "@/lib/docs/registry";

const entries: DocEntry[] = [
  {
    id: "guide",
    group: "开放平台",
    navLabel: "开发指南",
    sourcePath: "docs/open-platform-developer-guide.md",
    body: "",
  },
  {
    id: "protocol",
    group: "开放平台",
    navLabel: "接入协议",
    sourcePath: "docs/open-platform-protocol-v1.md",
    body: "",
  },
];

describe("resolveDocHref", () => {
  it("rewrites bundled markdown links to the docs route and keeps the fragment", () => {
    expect(
      resolveDocHref(
        "./open-platform-protocol-v1.md#3-登记",
        "docs/open-platform-developer-guide.md",
        entries,
      ),
    ).toEqual({
      href: "/docs/protocol#3-登记",
      external: false,
    });
  });

  it("sends unbundled markdown links to the public repository", () => {
    expect(
      resolveDocHref("service-registry-v0.md", "docs/open-platform-protocol-v1.md", entries),
    ).toEqual({
      href: "https://github.com/uichat-mira/cloud-auth/blob/dev/docs/service-registry-v0.md",
      external: true,
    });
  });

  it("sends relative repository files to the public repository", () => {
    expect(
      resolveDocHref("../../.github/workflows/deploy-prod.yml", "docs/deployment.md", entries),
    ).toEqual({
      href: "https://github.com/uichat-mira/cloud-auth/blob/dev/.github/workflows/deploy-prod.yml",
      external: true,
    });
  });

  it("keeps external and in-page links as they are", () => {
    expect(resolveDocHref("https://example.com/a", "docs/deployment.md", entries)).toEqual({
      href: "https://example.com/a",
      external: true,
    });
    expect(resolveDocHref("#section", "docs/deployment.md", entries)).toEqual({
      href: "#section",
      external: false,
    });
    expect(resolveDocHref("mailto:dev@example.com", "docs/deployment.md", entries)).toEqual({
      href: "mailto:dev@example.com",
      external: false,
    });
  });
});
