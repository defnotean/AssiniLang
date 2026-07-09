import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./index";

function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>
      Switch locale
    </button>
  );
}

describe("I18nProvider document direction", () => {
  it("sets document dir and lang to rtl when Arabic is selected", () => {
    render(
      <I18nProvider initialLocale="en">
        <LocaleSwitcher />
      </I18nProvider>
    );

    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));

    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });
});
