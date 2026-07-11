import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const APP_TITLE = "AssiniLang Language Workspace";
const runtimeErrorsByPage = new WeakMap<Page, string[]>();

async function openWorkspace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("workspace.tourSeen", "1");
    localStorage.removeItem("workspace.languageId");
    localStorage.removeItem("workspace.view");
  });
  await page.goto("/");
  await expect(page).toHaveTitle(APP_TITLE);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText("Local prototype", { exact: true })).toBeVisible();
}

async function createLanguage(page: Page, name: string): Promise<void> {
  const languageButton = page.getByRole("button", { name: new RegExp(`^${name}`) }).first();
  if (await languageButton.count()) {
    await languageButton.click();
    await expect(languageButton).toHaveAttribute("aria-pressed", "true");
    return;
  }

  await page.getByRole("button", { name: "New language" }).click();
  const form = page.getByRole("form", { name: "Create language" });
  await form.getByLabel("Language name").fill(name);
  await form.getByLabel("Description").fill("Synthetic browser-test workspace with no community data.");
  await form.getByLabel("Orthography").fill("Synthetic Latin test orthography");
  await form.getByLabel("Typology").selectOption("agglutinative");
  await form.getByRole("button", { name: "Create language" }).click();

  await expect(page.locator(".workspace-header").getByRole("heading", { name: "Start" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "true");
}

function monitorRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  runtimeErrorsByPage.set(page, monitorRuntimeErrors(page));
  await openWorkspace(page);
});

test("critical workspace flow is keyboard operable", async ({ page }) => {
  const runtimeErrors = runtimeErrorsByPage.get(page)!;

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  await createLanguage(page, "Keyboard Test Language");

  const themeSwitch = page.getByRole("switch", { name: "Dark theme" });
  await themeSwitch.focus();
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const commandSearch = palette.getByRole("combobox", { name: "Search commands" });
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill("Build");
  await page.keyboard.press("Enter");

  await expect(palette).toBeHidden();
  await expect(page.locator(".workspace-header").getByRole("heading", { name: "Build" })).toBeVisible();
  await expect(themeSwitch).toBeFocused();

  await page.keyboard.press("Control+K");
  await expect(commandSearch).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(themeSwitch).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("created workspace has no WCAG A/AA accessibility violations", async ({ page }) => {
  const runtimeErrors = runtimeErrorsByPage.get(page)!;
  await createLanguage(page, "Accessibility Test Language");

  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const violations = scan.violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    targets: nodes.map((node) => node.target.join(" "))
  }));
  expect(violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

async function assertVisualContract(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const visualContract = await page.evaluate(() => {
    const round = (value: number) => Math.round(value);
    const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    const horizontalRect = (selector: string) => {
      const box = element(selector).getBoundingClientRect();
      return {
        left: round(box.left),
        right: round(box.right),
        width: round(box.width)
      };
    };
    const styles = (selector: string, properties: string[]) => {
      const computed = getComputedStyle(element(selector));
      return Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)]));
    };
    return {
      viewport: { height: window.innerHeight, width: window.innerWidth },
      documentWidth: document.documentElement.scrollWidth,
      horizontalGeometry: {
        main: horizontalRect(".main-content"),
        prototypeNotice: horizontalRect(".prototype-notice"),
        sidebar: horizontalRect(".sidebar"),
        statStrip: horizontalRect(".stat-strip"),
        workspaceHeader: horizontalRect(".workspace-header")
      },
      relationships: (() => {
        const main = element(".main-content").getBoundingClientRect();
        const sidebar = element(".sidebar").getBoundingClientRect();
        return {
          mainIsBesideOrBelowSidebar: main.left >= sidebar.right - 1 || main.top >= sidebar.bottom - 1,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1
        };
      })(),
      styles: {
        appShell: styles(".app-shell", ["display", "grid-template-columns"]),
        main: styles(".main-content", [
          "background-color",
          "overflow-x",
          "overflow-y",
          "padding-left",
          "padding-right"
        ]),
        prototypeNotice: styles(".prototype-notice", [
          "background-color",
          "border-bottom-color",
          "border-bottom-width",
          "display"
        ]),
        sidebar: styles(".sidebar", [
          "background-color",
          "border-right-color",
          "border-right-width",
          "overflow-y",
          "position"
        ]),
        statStrip: styles(".stat-strip", ["display", "gap", "grid-template-columns"]),
        workspaceHeader: styles(".workspace-header", ["background-color", "border-bottom-color", "border-bottom-width"])
      }
    };
  });

  expect(visualContract.documentWidth).toBeLessThanOrEqual(visualContract.viewport.width + 1);
  // Keep the snapshot valid, formatter-stable JSON (Prettier preserves the
  // conventional trailing newline while JSON.stringify does not add one).
  expect(`${JSON.stringify(visualContract, null, 2)}\n`).toMatchSnapshot(`${label}-visual-contract.json`);

  const screenshot = await page.screenshot({ animations: "disabled", fullPage: false });
  expect(screenshot.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(screenshot.byteLength).toBeGreaterThan(20_000);
  await testInfo.attach(label, { body: screenshot, contentType: "image/png" });
}

test("desktop and mobile layouts preserve the visual landmark contract", async ({ page }, testInfo) => {
  const runtimeErrors = runtimeErrorsByPage.get(page)!;
  await createLanguage(page, "Visual Test Language");

  await page.setViewportSize({ width: 1440, height: 900 });
  await assertVisualContract(page, testInfo, "workspace-desktop");
  const desktop = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar")!.getBoundingClientRect();
    const main = document.querySelector<HTMLElement>(".main-content")!.getBoundingClientRect();
    return {
      sidebar: { width: sidebar.width, right: sidebar.right },
      main: { width: main.width, left: main.left }
    };
  });
  expect(desktop.sidebar.width).toBeGreaterThanOrEqual(260);
  expect(desktop.sidebar.width).toBeLessThanOrEqual(400);
  expect(desktop.main.left).toBeGreaterThanOrEqual(desktop.sidebar.right - 1);
  expect(desktop.main.width).toBeGreaterThan(900);

  await page.setViewportSize({ width: 390, height: 844 });
  await assertVisualContract(page, testInfo, "workspace-mobile");
  const mobile = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar")!.getBoundingClientRect();
    const main = document.querySelector<HTMLElement>(".main-content")!.getBoundingClientRect();
    return {
      sidebar: { width: sidebar.width, bottom: sidebar.bottom },
      main: { width: main.width, top: main.top }
    };
  });
  expect(mobile.sidebar.width).toBeLessThanOrEqual(390);
  expect(mobile.main.width).toBeLessThanOrEqual(390);
  expect(mobile.main.top).toBeGreaterThanOrEqual(mobile.sidebar.bottom - 1);
  expect(runtimeErrors).toEqual([]);
});
