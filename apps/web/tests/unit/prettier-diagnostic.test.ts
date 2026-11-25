import { readFile } from "node:fs/promises";
import { format } from "prettier";
import { it } from "vitest";

it("prints canonical Prettier output for OPS-050 page", async () => {
  const source = await readFile(
    "src/pages/account/applications-page.tsx",
    "utf8",
  );
  const formatted = await format(source, { parser: "typescript" });
  throw new Error(
    "\n---PRETTIER-START---\n" + formatted + "\n---PRETTIER-END---",
  );
});
