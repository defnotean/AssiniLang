const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const SMOKE_MIN_NON_WHITE_RATIO = 0.01;
const SMOKE_SAMPLE_LIMIT = 200_000;
function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return { message: String(error) };
}

function createSmokeEventLog(webContents) {
  const events = [];
  const fatal = [];
  const add = (kind, payload) => {
    events.push({
      kind,
      ...payload
    });
    if (events.length > 50) {
      events.shift();
    }
  };

  webContents.on("console-message", (details) => {
    add("console", {
      level: details.level,
      line: details.lineNumber,
      message: details.message,
      sourceId: details.sourceId
    });
  });
  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    const event = { errorCode, errorDescription, isMainFrame, validatedURL };
    add("did-fail-load", event);
    if (isMainFrame) {
      fatal.push(event);
    }
  });
  webContents.on("render-process-gone", (_event, details) => {
    const event = { details };
    add("render-process-gone", event);
    fatal.push(event);
  });
  webContents.on("unresponsive", () => {
    const event = { message: "Renderer became unresponsive." };
    add("unresponsive", event);
    fatal.push(event);
  });

  return { events, fatal };
}

function desktopSmokeScript() {
  return `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const textOf = (element) => normalize(element?.textContent ?? "");
      const selectors = {
        main: "main#main-content",
        appShell: ".app-shell"
      };
      const report = {
        createdLanguage: false,
        layoutFit: {},
        screens: {},
        controls: {},
        textSamples: [],
        tourShown: false,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };

      async function waitFor(label, predicate, timeoutMs = 20000) {
        const started = Date.now();
        let lastError = "";
        while (Date.now() - started < timeoutMs) {
          try {
            const value = predicate();
            if (value) return value;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
          await sleep(100);
        }
        throw new Error("Timed out waiting for " + label + (lastError ? ": " + lastError : ""));
      }

      function requireElement(selector, label, root = document) {
        const element = root.querySelector(selector);
        if (!element || !isVisible(element)) {
          throw new Error("Missing visible " + label + " (" + selector + ")");
        }
        return element;
      }

      function findButton(label, root = document) {
        const buttons = Array.from(root.querySelectorAll("button")).filter(isVisible);
        return buttons.find((button) => textOf(button) === label)
          ?? buttons.find((button) => textOf(button).includes(label))
          ?? null;
      }

      function clickButton(label, root = document) {
        const button = findButton(label, root);
        if (!button) {
          const seen = Array.from(root.querySelectorAll("button")).filter(isVisible).map(textOf).slice(0, 30).join(", ");
          throw new Error("Missing button " + label + ". Visible buttons: " + seen);
        }
        button.click();
        return button;
      }

      function sectionButton(label) {
        const nav = requireElement(".section-nav", "section navigation");
        const buttons = Array.from(nav.querySelectorAll("button")).filter(isVisible);
        const button = buttons.find((candidate) => textOf(candidate).includes(label));
        if (!button) {
          throw new Error("Missing section button " + label + ". Visible section buttons: " + buttons.map(textOf).join(", "));
        }
        return button;
      }

      function controlByLabel(label) {
        const labels = Array.from(document.querySelectorAll("label")).filter(isVisible);
        const labelElement = labels.find((candidate) => normalize(candidate.textContent) === label)
          ?? labels.find((candidate) => normalize(candidate.textContent).includes(label));
        if (!labelElement) {
          throw new Error("Missing label " + label + ". Visible labels: " + labels.map(textOf).slice(0, 40).join(", "));
        }
        if (labelElement.htmlFor) {
          const control = document.getElementById(labelElement.htmlFor);
          if (control) return control;
        }
        const nested = labelElement.querySelector("input, select, textarea");
        if (nested) return nested;
        throw new Error("Missing control for label " + label);
      }

      function setControlValue(label, value) {
        const control = controlByLabel(label);
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value");
        if (descriptor?.set) {
          descriptor.set.call(control, value);
        } else {
          control.value = value;
        }
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
        return control;
      }

      function requireText(label) {
        const text = document.body.innerText ?? "";
        if (!text.includes(label)) {
          throw new Error("Missing text " + label);
        }
        return true;
      }

      function requireRegion(label) {
        return requireElement("[aria-label=\\"" + label.replace(/"/g, "\\\\\\"") + "\\"]", "region " + label);
      }

      function controlMetrics(label) {
        try {
          const control = controlByLabel(label);
          const rect = control.getBoundingClientRect();
          return {
            height: Math.round(rect.height),
            label,
            tag: control.tagName.toLowerCase(),
            width: Math.round(rect.width)
          };
        } catch {
          return null;
        }
      }

      function gridColumnCount(selector) {
        const element = document.querySelector(selector);
        if (!element || !isVisible(element)) return 0;
        const columns = window.getComputedStyle(element).gridTemplateColumns;
        return columns.split(" ").filter(Boolean).length;
      }

      function visibleTextOverflow(selector) {
        return Array.from(document.querySelectorAll(selector))
          .filter(isVisible)
          .map((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: textOf(element).slice(0, 80)
          }))
          .filter((entry) => entry.scrollWidth - entry.clientWidth > 2)
          .slice(0, 10);
      }

      function desktopActionGroupMetrics() {
        return Array.from(document.querySelectorAll("[data-desktop-action-group]"))
          .filter(isVisible)
          .map((group) => {
            const rect = group.getBoundingClientRect();
            const buttons = Array.from(group.querySelectorAll("button"))
              .filter(isVisible)
              .map((button) => ({
                height: Math.round(button.getBoundingClientRect().height),
                label: textOf(button),
                width: Math.round(button.getBoundingClientRect().width),
                clientHeight: button.clientHeight,
                scrollHeight: button.scrollHeight,
                clientWidth: button.clientWidth,
                scrollWidth: button.scrollWidth
              }));
            return {
              buttonCount: buttons.length,
              clippedButtons: buttons
                .filter((button) => (
                  button.scrollWidth - button.clientWidth > 2
                  || button.scrollHeight - button.clientHeight > 2
                ))
                .map(({ clientHeight, clientWidth, label, scrollHeight, scrollWidth }) => ({
                  clientHeight,
                  clientWidth,
                  label,
                  scrollHeight,
                  scrollWidth
                })),
              group: group.getAttribute("data-desktop-action-group"),
              width: Math.round(rect.width)
            };
          });
      }

      function measureLayoutFit(screen) {
        const root = document.documentElement;
        const pageOverflowX = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - root.clientWidth;
        const controls = [
          "Discovered models",
          "Base URL",
          "Model",
          "Timeout",
          "Max tokens",
          "Save settings"
        ].map(controlMetrics).filter(Boolean);
        const fit = {
          controls,
          modelGridColumns: gridColumnCount(".model-grid"),
          noteTopicOverflow: visibleTextOverflow(".note-topic strong"),
          pageOverflowX,
          screen,
          // The subtitle is intentionally single-line with CSS ellipsis; the title must fit without clipping.
          sidebarBrandOverflow: visibleTextOverflow(".brand-copy strong"),
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };

        if (pageOverflowX > 1) {
          throw new Error(screen + " has horizontal overflow of " + pageOverflowX + "px.");
        }
        if (fit.sidebarBrandOverflow.length > 0) {
          throw new Error(screen + " sidebar brand text is clipped: " + JSON.stringify(fit.sidebarBrandOverflow));
        }
        if (fit.noteTopicOverflow.length > 0) {
          throw new Error(screen + " note topic text is clipped: " + JSON.stringify(fit.noteTopicOverflow));
        }
        if (screen === "Settings") {
          fit.desktopActionGroups = desktopActionGroupMetrics();
          const minimums = {
            "Discovered models": 320,
            "Base URL": 240,
            "Model": 240,
            "Timeout": 120,
            "Max tokens": 120
          };
          const narrow = controls.filter((control) => minimums[control.label] && control.width < minimums[control.label]);
          if (narrow.length > 0) {
            throw new Error("Settings controls are too narrow: " + JSON.stringify(narrow));
          }
          if (fit.modelGridColumns > 1 && window.innerWidth <= 1040) {
            throw new Error("Settings model grid did not collapse at the minimum desktop width.");
          }
          if (fit.desktopActionGroups.length !== 5) {
            throw new Error("Settings desktop action groups did not render: " + JSON.stringify(fit.desktopActionGroups));
          }
          const clippedActionGroups = fit.desktopActionGroups.filter((group) => group.clippedButtons.length > 0);
          if (clippedActionGroups.length > 0) {
            throw new Error("Settings desktop action buttons are clipped: " + JSON.stringify(clippedActionGroups));
          }
        }

        return fit;
      }

      async function navigate(label, heading, expected) {
        sectionButton(label).click();
        await waitFor(label + " heading", () => Array.from(document.querySelectorAll("h1")).some((item) => textOf(item) === heading));
        for (const item of expected) {
          if (item.kind === "region") {
            await waitFor(item.label, () => requireRegion(item.label));
          } else if (item.kind === "button") {
            await waitFor("button " + item.label, () => findButton(item.label));
          } else if (item.kind === "label") {
            await waitFor("label " + item.label, () => controlByLabel(item.label));
          } else if (item.kind === "text") {
            await waitFor("text " + item.label, () => requireText(item.label));
          } else if (item.kind === "selector") {
            await waitFor("selector " + item.label, () => requireElement(item.selector, item.label));
          }
        }
        report.screens[label.toLowerCase()] = {
          heading,
          textLength: (document.body.innerText ?? "").length,
          buttons: Array.from(document.querySelectorAll("button")).filter(isVisible).map(textOf).slice(0, 20)
        };
        report.layoutFit[label.toLowerCase()] = measureLayoutFit(label);
      }

      await waitFor("rendered app shell", () => {
        if (document.querySelector(".full-page-status[role='alert']")) {
          throw new Error(document.body.innerText);
        }
        return document.querySelector(selectors.appShell) && document.querySelector(selectors.main);
      });
      await waitFor("desktop bridge", () => window.assiniDesktop?.apiBaseUrl && window.assiniDesktop?.authToken);

      const tourDialog = document.querySelector("[aria-label='Guided tour']");
      if (tourDialog) {
        report.tourShown = true;
        clickButton("Skip tour", tourDialog);
        await waitFor("tour dismissed", () => !document.querySelector("[aria-label='Guided tour']"));
      }

      if (!document.querySelector(".language-nav-group")) {
        clickButton("New language");
        await waitFor("create language form", () => document.querySelector("form[aria-label='Create language']"));
        setControlValue("Language name", "English Smoke");
        setControlValue("Description", "Temporary English workspace for desktop smoke verification.");
        setControlValue("Orthography", "Latin");
        setControlValue("Typology", "agglutinative");
        clickButton("Create language", document.querySelector("form[aria-label='Create language']"));
        await waitFor("created language workspace", () => document.body.innerText.includes("English Smoke / Start") && document.querySelector(".section-nav"));
        report.createdLanguage = true;
      }

      await navigate("Start", "Start", [
        { kind: "region", label: "Language overview" },
        { kind: "region", label: "Saved examples" },
        { kind: "text", label: "Read and search what you have" },
        { kind: "region", label: "Corpus passages" }
      ]);

      await navigate("Build", "Build", [
        { kind: "region", label: "Add material" },
        { kind: "region", label: "Registered sources" },
        { kind: "region", label: "Extraction draft queue" },
        { kind: "region", label: "Review queue" },
        { kind: "region", label: "Suggest a fix" }
      ]);

      await navigate("Practice", "Practice", [
        { kind: "region", label: "Practice exercises" },
        { kind: "region", label: "Practice next" },
        { kind: "region", label: "Exercise selector" },
        { kind: "region", label: "Exercise authoring" },
        { kind: "region", label: "Ask the model" },
        { kind: "button", label: "Start conversation" }
      ]);

      await navigate("Settings", "Settings", [
        { kind: "button", label: "Run System Eval" },
        { kind: "region", label: "Model connection" },
        { kind: "region", label: "LLM provider readiness" },
        { kind: "region", label: "Runtime model settings" },
        { kind: "region", label: "Desktop app tools" },
        { kind: "selector", label: "desktop app version", selector: "[data-desktop-info='version']" },
        { kind: "selector", label: "desktop app folder", selector: "[data-desktop-path='app']" },
        { kind: "selector", label: "desktop backups path", selector: "[data-desktop-path='backups']" },
        { kind: "selector", label: "desktop diagnostics path", selector: "[data-desktop-path='diagnostics']" },
        { kind: "selector", label: "desktop backup count", selector: "[data-desktop-backup-summary='count']" },
        { kind: "selector", label: "desktop shortcut status", selector: "[data-desktop-shortcut-summary='desktop']" },
        { kind: "selector", label: "Start Menu shortcut status", selector: "[data-desktop-shortcut-summary='start-menu']" },
        { kind: "region", label: "Quality checks" },
        { kind: "region", label: "Language rules and exports" },
        { kind: "label", label: "Discovered models" },
        { kind: "label", label: "Provider" },
        { kind: "label", label: "Base URL" },
        { kind: "label", label: "Model" },
        { kind: "label", label: "Timeout" },
        { kind: "label", label: "Max tokens" },
        { kind: "label", label: "Launch at sign-in" },
        { kind: "label", label: "Hide to tray on close" },
        { kind: "selector", label: "desktop recovery actions", selector: "[data-desktop-action-group='recovery']" },
        { kind: "selector", label: "desktop diagnostics actions", selector: "[data-desktop-action-group='diagnostics']" },
        { kind: "selector", label: "desktop folder actions", selector: "[data-desktop-action-group='folders']" },
        { kind: "selector", label: "desktop backup actions", selector: "[data-desktop-action-group='backups']" },
        { kind: "selector", label: "desktop shortcut actions", selector: "[data-desktop-action-group='shortcuts']" },
        { kind: "button", label: "Refresh models" },
        { kind: "button", label: "Reset window layout" },
        { kind: "button", label: "Copy diagnostics" },
        { kind: "button", label: "Save diagnostics report" },
        { kind: "button", label: "Open app folder" },
        { kind: "button", label: "Open diagnostics folder" },
        { kind: "button", label: "Create data backup" },
        { kind: "button", label: "Restore latest backup" },
        { kind: "button", label: "Open backups folder" },
        { kind: "button", label: "Open latest backup" },
        { kind: "button", label: "Prune old backups" },
        { kind: "button", label: "Set up app shortcuts" },
        { kind: "button", label: "Create desktop shortcut" },
        { kind: "button", label: "Create Start Menu shortcut" },
        { kind: "button", label: "Save settings" },
        { kind: "selector", label: "model scan status", selector: ".model-scan-meta" }
      ]);

      clickButton("Copy diagnostics");
      await waitFor("diagnostics copied", () => requireText("Diagnostics copied to clipboard."));
      report.controls.desktopDiagnostics = {
        copied: true
      };

      clickButton("Save diagnostics report");
      await waitFor("diagnostics report saved", () => requireText("Saved diagnostics report at"));
      report.controls.desktopDiagnostics.saved = true;

      clickButton("Create data backup");
      await waitFor("desktop backup created", () => requireText("Created backup at"));
      await waitFor("desktop backup summary updated", () => requireText("1 backups"));
      await waitFor("desktop latest backup visible", () => requireElement("[data-desktop-backup-summary='latest']", "desktop latest backup"));
      report.controls.desktopBackup = {
        created: true,
        summaryUpdated: true
      };
      report.controls.desktopShortcuts = {
        desktopVisible: Boolean(requireElement("[data-desktop-shortcut-summary='desktop']", "desktop shortcut status")),
        startMenuVisible: Boolean(requireElement("[data-desktop-shortcut-summary='start-menu']", "Start Menu shortcut status"))
      };

      report.controls.desktopBridge = {
        apiBaseUrl: window.assiniDesktop.apiBaseUrl,
        appFolder: Boolean(window.assiniDesktop.appFolder),
        appPath: Boolean(window.assiniDesktop.appPath),
        appVersion: Boolean(window.assiniDesktop.appVersion),
        backupSummary: Boolean(window.assiniDesktop.backupSummary),
        backupsDir: Boolean(window.assiniDesktop.backupsDir),
        dataDir: Boolean(window.assiniDesktop.dataDir),
        diagnosticsDir: Boolean(window.assiniDesktop.diagnosticsDir),
        settingsPath: Boolean(window.assiniDesktop.settingsPath),
        isPackaged: Boolean(window.assiniDesktop.isPackaged),
        shortcutSummary: Boolean(window.assiniDesktop.shortcutSummary),
        openAppFolder: typeof window.assiniDesktop.openAppFolder === "function",
        openDataFolder: typeof window.assiniDesktop.openDataFolder === "function",
        openSettingsFolder: typeof window.assiniDesktop.openSettingsFolder === "function",
        openDiagnosticsFolder: typeof window.assiniDesktop.openDiagnosticsFolder === "function",
        openBackupsFolder: typeof window.assiniDesktop.openBackupsFolder === "function",
        openLatestBackupFolder: typeof window.assiniDesktop.openLatestBackupFolder === "function",
        pruneOldDataBackups: typeof window.assiniDesktop.pruneOldDataBackups === "function",
        createAppShortcuts: typeof window.assiniDesktop.createAppShortcuts === "function",
        createDataBackup: typeof window.assiniDesktop.createDataBackup === "function",
        createDesktopShortcut: typeof window.assiniDesktop.createDesktopShortcut === "function",
        createStartMenuShortcut: typeof window.assiniDesktop.createStartMenuShortcut === "function",
        restoreLatestDataBackup: typeof window.assiniDesktop.restoreLatestDataBackup === "function",
        resetWindowLayout: typeof window.assiniDesktop.resetWindowLayout === "function",
        desktopPreferences: Boolean(window.assiniDesktop.desktopPreferences),
        refreshShortcutSummary: typeof window.assiniDesktop.refreshShortcutSummary === "function",
        saveDiagnosticsReport: typeof window.assiniDesktop.saveDiagnosticsReport === "function",
        setDesktopPreferences: typeof window.assiniDesktop.setDesktopPreferences === "function"
      };
      report.controls.providerForm = {
        discoveredModelsDisabled: controlByLabel("Discovered models").disabled,
        providerValue: controlByLabel("Provider").value,
        baseUrlPlaceholder: controlByLabel("Base URL").getAttribute("placeholder"),
        modelPlaceholder: controlByLabel("Model").getAttribute("placeholder"),
        timeoutValue: controlByLabel("Timeout").value,
        maxTokensValue: controlByLabel("Max tokens").value
      };
      report.textSamples = Array.from(document.querySelectorAll("h1, h2, h3, button"))
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean)
        .slice(0, 50);
      report.bodyTextLength = (document.body.innerText ?? "").length;
      report.activeHeading = textOf(document.querySelector("h1"));
      return report;
    })()
  `;
}

async function runDesktopSmoke(api, eventLog, options) {
  const { app, desktopRuntime, desktopUiRoutePrefix, mainWindow, minWindowBounds } = options;
  mainWindow.setSize(minWindowBounds.width, minWindowBounds.height);
  mainWindow.center();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const desktopUi = await verifyDesktopUiRoute(api.server, desktopUiRoutePrefix);
  const bridge = await mainWindow.webContents.executeJavaScript(`
    Promise.all([
      Boolean(window.assiniDesktop && window.assiniDesktop.apiBaseUrl && window.assiniDesktop.authToken),
      Boolean(window.assiniDesktop && window.assiniDesktop.dataDir && window.assiniDesktop.settingsPath),
      Boolean(window.assiniDesktop && window.assiniDesktop.openDataFolder && window.assiniDesktop.openSettingsFolder),
      fetch("/api/health").then((response) => ({ ok: response.ok, status: response.status })),
      window.location.origin === new URL(window.assiniDesktop.apiBaseUrl).origin
        && window.location.pathname === "${desktopUiRoutePrefix}/index.html"
    ])
  `);
  if (
    !Array.isArray(bridge) ||
    bridge.slice(0, 3).some((item) => item !== true) ||
    bridge[3]?.ok !== true ||
    bridge[4] !== true
  ) {
    throw new Error("Desktop preload or API health check failed.");
  }

  const ui = await mainWindow.webContents.executeJavaScript(desktopSmokeScript(), true);
  const image = await mainWindow.webContents.capturePage();
  const visual = analyzeSmokeImage(image);
  const screenshotPath = process.env.ASSINI_DESKTOP_SMOKE_SCREENSHOT;
  if (screenshotPath) {
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    writeFileSync(screenshotPath, image.toPNG());
  }

  if (eventLog.fatal.length > 0) {
    throw new Error(`Renderer reported fatal events: ${JSON.stringify(eventLog.fatal)}`);
  }

  const report = {
    ok: true,
    apiBaseUrl: api.baseUrl,
    bridge,
    dataDir: desktopRuntime?.dataDir,
    dbPath: desktopRuntime?.dbPath,
    backupsDir: desktopRuntime?.backupsDir,
    desktopUi,
    isPackaged: app.isPackaged,
    rendererEvents: eventLog.events,
    settingsPath: desktopRuntime?.settingsPath,
    ui,
    userDataDir: desktopRuntime?.userDataDir,
    visual
  };
  const reportPath = process.env.ASSINI_DESKTOP_SMOKE_REPORT;
  if (reportPath) {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
}

function analyzeSmokeImage(image) {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const pixelCount = Math.floor(bitmap.length / 4);
  const stride = Math.max(1, Math.floor(pixelCount / SMOKE_SAMPLE_LIMIT));
  let sampled = 0;
  let nonWhite = 0;
  let transparent = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    const first = bitmap[offset] ?? 255;
    const second = bitmap[offset + 1] ?? 255;
    const third = bitmap[offset + 2] ?? 255;
    const alpha = bitmap[offset + 3] ?? 255;
    sampled += 1;
    if (alpha < 10) {
      transparent += 1;
      continue;
    }
    if (first < 245 || second < 245 || third < 245) {
      nonWhite += 1;
    }
  }

  const nonWhiteRatio = sampled > 0 ? nonWhite / sampled : 0;
  const visual = {
    height: size.height,
    nonWhiteRatio,
    nonWhiteSampledPixels: nonWhite,
    sampledPixels: sampled,
    transparentSampledPixels: transparent,
    width: size.width
  };
  if (size.width < 800 || size.height < 600) {
    throw new Error(`Desktop smoke captured an unexpectedly small window: ${size.width}x${size.height}.`);
  }
  if (sampled === 0 || nonWhiteRatio < SMOKE_MIN_NON_WHITE_RATIO) {
    throw new Error(`Desktop smoke captured a blank or near-white window: ${JSON.stringify(visual)}.`);
  }

  return visual;
}

async function verifyDesktopUiRoute(server, desktopUiRoutePrefix) {
  const [index, encodedTraversal, encodedBackslash, directory, writeAttempt] = await Promise.all([
    server.inject({ method: "GET", url: `${desktopUiRoutePrefix}/index.html` }),
    server.inject({ method: "GET", url: `${desktopUiRoutePrefix}/%252e%252e%252fmain.cjs` }),
    server.inject({ method: "GET", url: `${desktopUiRoutePrefix}/assets%255c..%255cindex.html` }),
    server.inject({ method: "GET", url: `${desktopUiRoutePrefix}/assets` }),
    server.inject({ method: "POST", url: `${desktopUiRoutePrefix}/index.html` })
  ]);

  const csp = index.headers["content-security-policy"];
  if (
    index.statusCode !== 200 ||
    !index.body.includes('<div id="root"></div>') ||
    index.headers["cache-control"] !== "no-store" ||
    typeof csp !== "string" ||
    !csp.includes("default-src 'self'") ||
    index.headers["x-content-type-options"] !== "nosniff"
  ) {
    throw new Error(
      `Desktop UI index route failed security checks: ${JSON.stringify({
        cacheControl: index.headers["cache-control"],
        contentSecurityPolicy: csp,
        contentTypeOptions: index.headers["x-content-type-options"],
        statusCode: index.statusCode
      })}`
    );
  }

  const rejectedStatuses = [
    encodedTraversal.statusCode,
    encodedBackslash.statusCode,
    directory.statusCode,
    writeAttempt.statusCode
  ];
  if (rejectedStatuses.some((statusCode) => statusCode !== 404)) {
    throw new Error(`Desktop UI route accepted a forbidden request: ${JSON.stringify(rejectedStatuses)}.`);
  }

  return {
    cacheControl: index.headers["cache-control"],
    contentSecurityPolicy: csp,
    contentType: index.headers["content-type"],
    indexStatus: index.statusCode,
    rejectedStatuses
  };
}

module.exports = {
  analyzeSmokeImage,
  createSmokeEventLog,
  desktopSmokeScript,
  runDesktopSmoke,
  serializeError,
  verifyDesktopUiRoute
};
