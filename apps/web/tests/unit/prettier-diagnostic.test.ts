import { readFile } from "node:fs/promises";
import { format } from "prettier";
import { it } from "vitest";

it("prints canonical filepath-aware Prettier output for OPS-050 page", async () => {
  const filepath = "src/pages/account/applications-page.tsx";
  const source = await readFile(filepath, "utf8");
  const formatted = await format(source, { filepath });
  throw new Error(
    "\n---PRETTIER-FILEPATH-START---\n" +
      formatted +
      "\n---PRETTIER-FILEPATH-END---",
  );
});
