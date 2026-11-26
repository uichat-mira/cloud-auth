import type { DocEntry } from "./registry";

const repository = "https://github.com/uichat-mira/cloud-auth";
const branch = "dev";

export interface ResolvedDocHref {
  href: string;
  external: boolean;
}

function splitFragment(href: string): { path: string; fragment: string } {
  const index = href.indexOf("#");
  if (index === -1) return { path: href, fragment: "" };
  return { path: href.slice(0, index), fragment: href.slice(index) };
}

function directoryOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function resolveRelativePath(baseDirectory: string, relative: string): string {
  const segments = baseDirectory ? baseDirectory.split("/") : [];
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function isHttp(href: string): boolean {
  return /^https?:/i.test(href) || href.startsWith("//");
}

/** Resolve a markdown link against the source file and the bundled doc set. */
export function resolveDocHref(
  href: string,
  sourcePath: string,
  entries: readonly DocEntry[],
): ResolvedDocHref | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return { href: trimmed, external: false };
  if (isHttp(trimmed)) return { href: trimmed, external: true };
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return { href: trimmed, external: false };
  if (trimmed.startsWith("/")) return { href: trimmed, external: false };

  const { path, fragment } = splitFragment(trimmed);
  if (!path) return { href: fragment, external: false };

  const queryIndex = path.indexOf("?");
  const cleanPath = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : path.slice(queryIndex);
  const resolved = resolveRelativePath(directoryOf(sourcePath), cleanPath);

  const bundled = entries.find((entry) => entry.sourcePath === resolved);
  if (bundled) {
    return { href: `/docs/${bundled.id}${fragment}`, external: false };
  }

  if (resolved.endsWith(".md") || cleanPath.startsWith(".") || cleanPath.includes("/")) {
    const view = resolved.endsWith("/") ? "tree" : "blob";
    return {
      href: `${repository}/${view}/${branch}/${resolved}${query}${fragment}`,
      external: true,
    };
  }

  return { href: trimmed, external: false };
}
