import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("project documentation", () => {
  it("keeps the root README concise while linking to detailed UI documentation", async () => {
    const [rootReadme, docsHub, uiGuide, productGuide, apiGuide] = await Promise.all([
      readProjectFile("README.md"),
      readProjectFile("docs/README.md"),
      readProjectFile("docs/ui-design.md"),
      readProjectFile("docs/product-guide.md"),
      readProjectFile("docs/api.md")
    ]);

    expect(rootReadme.split(/\r?\n/).length).toBeLessThanOrEqual(120);
    expect(rootReadme).toContain("[Documentation Hub](docs/README.md)");
    expect(docsHub).toContain("[UI Design Guide](ui-design.md)");
    expect(uiGuide).toContain("AssiniLang.html");
    expect(uiGuide).toContain("Atlas layout");
    expect(uiGuide).toContain("night-sky");
    expect(uiGuide).toContain("synthetic-only");
    expect(productGuide).toContain("leadless");
    expect(productGuide).toContain("learner, Elder, reviewer, and programmer");
    expect(apiGuide).toContain("Lead and admin users remain server-token actors");
    expect(apiGuide).toContain("Review-policy updates have a prototype-only reviewer exception");
  });
});
