import { readFile } from "node:fs/promises";
import { format } from "prettier";
import { it } from "vitest";

it("prints canonical Prettier output for OPS-050 page", async () => {
  const url = new URL("../../src/pages/account/applications-page.tsx", import.meta.url);
  const source = await readFile(url, "utf8");
  const formatted = await format(source, { parser: "typescript" });
  throw new Error("\n---PRETTIER-START---\n" + formatted + "\n---PRETTIER-END---");
});
