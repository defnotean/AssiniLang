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

  it("localizes model-profile empty-state next-step guidance", () => {
    expect(en["model.noProfilesHint"]).toContain("Save profile");
    expect(ar["model.noProfilesHint"]).toContain("احفظ");
    expect(ar["model.noProfilesHint"]).not.toBe(en["model.noProfilesHint"]);
  });

  it("localizes provider-readiness empty-state next-step guidance", () => {
    expect(en["model.needsConfigurationHint"]).toContain("Save settings");
    expect(en["model.reachability.notConfigured"]).toContain("Runtime settings");
    expect(ar["model.needsConfigurationHint"]).toContain("احفظ");
    expect(ar["model.reachability.notConfigured"]).toContain("إعدادات التشغيل");
    expect(ar["model.needsConfigurationHint"]).not.toBe(en["model.needsConfigurationHint"]);
    expect(ar["model.reachability.notConfigured"]).not.toBe(en["model.reachability.notConfigured"]);
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
    expect(ar["corpus.networkKind.note"]).toBe("ملاحظة");
    expect(ar["corpus.networkKind.session"]).toBe("جلسة ذكاء اصطناعي");
    expect(ar["corpus.networkNodeTitle"]).toContain("{type}");
    expect(ar["corpus.networkNodeTitle"]).toContain("{label}");
    expect(ar["eval.failureRow"]).toContain("{category}");
    // Guard against the previous English copy leaking back into AR.
    expect(ar["corpus.networkLabel"]).not.toBe(en["corpus.networkLabel"]);
    expect(ar["corpus.networkInsights"]).not.toBe(en["corpus.networkInsights"]);
    expect(ar["corpus.networkLegend"]).not.toBe(en["corpus.networkLegend"]);
    expect(ar["corpus.networkKind.note"]).not.toBe(en["corpus.networkKind.note"]);
  });

  it("localizes Settings desktop tools and model discovery chrome in Arabic", () => {
    expect(ar["model.maxTokens"]).toBe("الحد الأقصى للرموز");
    expect(ar["model.desktopApp"]).toBe("تطبيق سطح المكتب");
    expect(ar["model.launchAtSignIn"]).toBe("التشغيل عند تسجيل الدخول");
    expect(ar["model.hideToTrayOnClose"]).toBe("الإخفاء إلى شريط النظام عند الإغلاق");
    expect(ar["model.copyDiagnostics"]).toBe("نسخ التشخيص");
    expect(ar["model.discoveredModels"]).toBe("النماذج المكتشفة");
    expect(ar["model.noDiscoveredModelsHint"]).toContain("Ollama");
    expect(ar["model.noDiscoveredModelsHint"]).not.toBe(en["model.noDiscoveredModelsHint"]);
    expect(ar["model.applyLoadedModel"]).toBe("تطبيق النموذج المحمّل");
    expect(ar["model.clearSavedModel"]).toBe("استخدام الوضع دون اتصال");
    expect(ar["model.endpointConnected"]).toContain("{baseUrl}");
    expect(ar["model.endpointConnected"]).toContain("{count}");
    expect(en["model.baseUrlPlaceholder"]).toContain("11434");
    expect(en["model.modelNamePlaceholder"]).toBe("irene-fusion");
    expect(en["model.transcriptionBaseUrlPlaceholder"]).toContain("9000");
    expect(en["model.ocrBaseUrlPlaceholder"]).toContain("11434");
    expect(en["model.smokeTest.seedPrompt"]).toContain("public workspace context");
    expect(ar["model.smokeTest.seedPrompt"]).not.toBe(en["model.smokeTest.seedPrompt"]);
    // Guard against the previous English Settings leftovers leaking back into AR.
    expect(ar["model.desktopToolsAria"]).not.toBe(en["model.desktopToolsAria"]);
    expect(ar["model.discoveredModels"]).not.toBe(en["model.discoveredModels"]);
    expect(ar["model.applyLoadedModel"]).not.toBe(en["model.applyLoadedModel"]);
    expect(ar["model.clearSavedModel"]).not.toBe(en["model.clearSavedModel"]);
    expect(ar["model.maxTokens"]).not.toBe(en["model.maxTokens"]);
  });

  it("localizes provider option labels and LLM status warnings in Arabic", () => {
    expect(en["model.providerOption.openai-compatible"]).toBe("OpenAI-compatible");
    expect(ar["model.providerOption.openai-compatible"]).toBe("متوافق مع OpenAI");
    expect(ar["model.providerOption.deterministic"]).toBe("حتمي");
    expect(ar["model.providerOption.openai"]).toBe("OpenAI عن بُعد");
    expect(ar["model.warning.noProviderConfigured"]).toContain("البديل الحتمي");
    expect(ar["model.warning.invalidTimeout"]).toContain("{ms}");
    expect(ar["model.warning.unknownProvider"]).toContain("{provider}");
    expect(ar["model.automaticRefresh"]).toBe("تحديث تلقائي");
    expect(ar["model.configuredDiscoveryTargets"]).toBe("أهداف الاكتشاف المُهيَّأة");
    expect(ar["model.providerOption.openai-compatible"]).not.toBe(en["model.providerOption.openai-compatible"]);
    expect(ar["model.warning.noProviderConfigured"]).not.toBe(en["model.warning.noProviderConfigured"]);
    expect(ar["model.configuredDiscoveryTargets"]).not.toBe(en["model.configuredDiscoveryTargets"]);
  });

  it("localizes empty-workspace evaluation errors in Arabic", () => {
    expect(ar["errors.noLanguagesToEvaluate"]).toBe(
      "لا توجد لغات متاحة للتقييم. أنشئ لغة من الشريط الجانبي أولاً، ثم شغّل تقييم النظام."
    );
    expect(ar["errors.noLanguagesToEvaluate"]).not.toBe(en["errors.noLanguagesToEvaluate"]);
  });

  it("localizes corpus import validation errors in Arabic", () => {
    expect(en["errors.invalidCorpusImportBody"]).toContain("complete corpus passage");
    expect(ar["errors.invalidCorpusImportBody"]).toContain("مقطع مدوّنة");
    expect(ar["errors.invalidCorpusImportBody"]).not.toBe(en["errors.invalidCorpusImportBody"]);
    expect(ar["errors.corpusImportFailed"]).not.toBe(en["errors.corpusImportFailed"]);
  });

  it("localizes extraction-draft not-found errors in Arabic", () => {
    expect(en["errors.extractionDraftNotFound"]).toContain("Refresh Build");
    expect(ar["errors.extractionDraftNotFound"]).toContain("البناء");
    expect(ar["errors.extractionDraftNotFound"]).not.toBe(en["errors.extractionDraftNotFound"]);
    expect(ar["errors.extractionDraftAcceptFailed"]).not.toBe(en["errors.extractionDraftAcceptFailed"]);
  });

  it("localizes governance empty-policy next-step guidance", () => {
    expect(en["governance.noGovernancePolicyHint"]).toContain("consent, access, or generation");
    expect(ar["governance.noGovernancePolicyHint"]).toContain("موافقة");
    expect(ar["governance.noGovernancePolicyHint"]).not.toBe(en["governance.noGovernancePolicyHint"]);
  });

  it("keeps paradigm-gap empty-state next-step guidance localized", () => {
    expect(en["profile.paradigmGapsEmptyState"]).toContain("Build or Corpus");
    expect(ar["profile.paradigmGapsEmptyState"]).toContain("البناء أو المدوّنة");
    expect(ar["profile.paradigmGapsEmptyState"]).not.toBe(en["profile.paradigmGapsEmptyState"]);
  });

  it("localizes Practice detail empty-state next-step guidance when no exercises exist", () => {
    expect(en["learner.noExercisesDetailEmptyHint"]).toContain("authoring form");
    expect(ar["learner.noExercisesDetailEmptyHint"]).toContain("التأليف");
    expect(ar["learner.noExercisesDetailEmptyHint"]).not.toBe(en["learner.noExercisesDetailEmptyHint"]);
  });

  it("localizes elder apply negatives and desktop-only bridge notices in Arabic", () => {
    expect(ar["errors.languageNotFound"]).not.toBe(en["errors.languageNotFound"]);
    expect(ar["errors.missingLanguageId"]).not.toBe(en["errors.missingLanguageId"]);
    expect(ar["errors.prototypeAuthDisabled"]).not.toBe(en["errors.prototypeAuthDisabled"]);
    expect(ar["errors.payloadTooLarge"]).not.toBe(en["errors.payloadTooLarge"]);
    expect(ar["app.rateLimitExceeded"]).toContain("{seconds}");
    expect(ar["elderWs.errInvalidCorrectionBody"]).not.toBe(en["elderWs.errInvalidCorrectionBody"]);
    expect(ar["elderWs.errCorrectionMustBeAccepted"]).not.toBe(en["elderWs.errCorrectionMustBeAccepted"]);
    expect(ar["elderWs.errCorrectionNotLinkedToNote"]).not.toBe(en["elderWs.errCorrectionNotLinkedToNote"]);
    expect(ar["model.desktopOnlyActions"]).not.toBe(en["model.desktopOnlyActions"]);
    expect(ar["model.desktopActionUnavailable"]).not.toBe(en["model.desktopActionUnavailable"]);
  });
});

