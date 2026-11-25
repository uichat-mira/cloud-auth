import { readFile } from "node:fs/promises";
import { format } from "prettier";
import { it } from "vitest";

it("prints repository-configured Prettier output for OPS-050 page", async () => {
  const filepath = "src/pages/account/applications-page.tsx";
  const source = await readFile(filepath, "utf8");
  const formatted = await format(source, {
    filepath,
    printWidth: 100,
    tabWidth: 2,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    arrowParens: "always",
  });
  throw new Error(
    "\n---PRETTIER-REPO-START---\n" +
      formatted +
      "\n---PRETTIER-REPO-END---",
  );
});
