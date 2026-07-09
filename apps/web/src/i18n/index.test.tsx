import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ar } from "./ar";
import { en } from "./en";
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

describe("locale catalogs", () => {
  it("keeps Arabic keys aligned with English", () => {
    const englishKeys = Object.keys(en).sort();
    const arabicKeys = Object.keys(ar).sort();
    expect(arabicKeys).toEqual(englishKeys);
  });

  it("localizes backup empty-state strings in Arabic", () => {
    expect(ar["model.desktopNoBackupsYet"]).toBe("لا توجد نسخ احتياطية بعد");
    expect(ar["model.desktopNoBackupsHint"]).toContain("نسخة احتياطية");
    expect(ar["model.restoreLatestBackup"]).toBe("استعادة أحدث نسخة احتياطية");
  });

  it("localizes integrity and extraction-draft placeholder strings in Arabic", () => {
    expect(ar["format.integrityLabel"]).toContain("{algorithm}");
    expect(ar["format.integrityLabel"]).toContain("{hash}");
    expect(ar["eval.artifactReadySummary"]).toContain("{summary}");
    expect(ar["ingest.draftSummary.noForm"]).toBe("(لا صيغة)");
    expect(ar["ingest.draftSummary.noGloss"]).toBe("(لا ترجمة)");
  });

  it("localizes corpus graph chrome in Arabic instead of leaving English leftovers", () => {
    expect(ar["corpus.network"]).toBe("رسم بياني");
    expect(ar["corpus.networkLabel"]).toBe("شبكة المدوّنة العصبية");
    expect(ar["corpus.networkInsights"]).toBe("رؤى رسم المدوّنة");
    expect(ar["corpus.networkLegend"]).toBe("مفتاح رسم المدوّنة");
    expect(ar["corpus.networkNodes"]).toBe("{count} عقدة");
    expect(ar["corpus.networkEdges"]).toBe("{count} رابط");
    expect(ar["corpus.networkLimited"]).toBe(
      "عرض {nodes} من {totalNodes} عقدة و{edges} من {totalEdges} رابط."
    );
    expect(ar["corpus.networkInsight.sessions"]).toBe("جلسات الذكاء الاصطناعي");
    expect(ar["corpus.networkKind.corpus"]).toBe("مقطع");
    // Guard against the previous English copy leaking back into AR.
    expect(ar["corpus.networkLabel"]).not.toBe(en["corpus.networkLabel"]);
    expect(ar["corpus.networkInsights"]).not.toBe(en["corpus.networkInsights"]);
    expect(ar["corpus.networkLegend"]).not.toBe(en["corpus.networkLegend"]);
  });

  it("localizes Settings desktop tools and model discovery chrome in Arabic", () => {
    expect(ar["model.maxTokens"]).toBe("الحد الأقصى للرموز");
    expect(ar["model.desktopApp"]).toBe("تطبيق سطح المكتب");
    expect(ar["model.launchAtSignIn"]).toBe("التشغيل عند تسجيل الدخول");
    expect(ar["model.hideToTrayOnClose"]).toBe("الإخفاء إلى شريط النظام عند الإغلاق");
    expect(ar["model.copyDiagnostics"]).toBe("نسخ التشخيص");
    expect(ar["model.discoveredModels"]).toBe("النماذج المكتشفة");
    expect(ar["model.applyLoadedModel"]).toBe("تطبيق النموذج المحمّل");
    expect(ar["model.clearSavedModel"]).toBe("استخدام الوضع دون اتصال");
    expect(ar["model.endpointConnected"]).toContain("{baseUrl}");
    expect(ar["model.endpointConnected"]).toContain("{count}");
    // Guard against the previous English Settings leftovers leaking back into AR.
    expect(ar["model.desktopToolsAria"]).not.toBe(en["model.desktopToolsAria"]);
    expect(ar["model.discoveredModels"]).not.toBe(en["model.discoveredModels"]);
    expect(ar["model.applyLoadedModel"]).not.toBe(en["model.applyLoadedModel"]);
    expect(ar["model.clearSavedModel"]).not.toBe(en["model.clearSavedModel"]);
    expect(ar["model.maxTokens"]).not.toBe(en["model.maxTokens"]);
  });
});
