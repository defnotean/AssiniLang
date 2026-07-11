import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { createTranslator, I18nProvider, useI18n } from "./index";

function Probe() {
  const { locale, dir, t } = useI18n();
  return <output data-testid="probe">{`${locale}:${dir}:${t("common.language")}`}</output>;
}

describe("English-only i18n", () => {
  it("sets document direction and language to English", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(screen.getByTestId("probe")).toHaveTextContent("en:ltr:Language");
  });

  it("uses the English catalog and preserves placeholders", () => {
    const t = createTranslator();
    expect(t("corpus.noLanguageNetwork")).toBe(en["corpus.noLanguageNetwork"]);
    expect(t("corpus.networkNodes", { count: 3 })).toBe("3 nodes");
  });

  it("contains the Corpus and Elder English empty-state copy", () => {
    expect(en["corpus.emptyNetworkHint"]).toContain("Process a source");
    expect(en["elderPage.noSuggestionsHint"]).toContain("three steps");
  });
});
