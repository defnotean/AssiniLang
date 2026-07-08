import { useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchNeuralMap, type CorpusImportPayload, type NeuralMapResponse } from "../api";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  CORPUS_CONSENT_USE_VALUES,
  EMPTY_CORPUS_IMPORT_DRAFT,
  type CorpusImportDraft
} from "../corpusImport";
import { MorphChips } from "../components/MorphChips";
import type { CorpusPassage } from "../lib/types";
import { useI18n } from "../i18n";

export function CorpusView({
  languageId,
  corpus,
  isWorkflowBusy,
  onImportCorpusPassage
}: {
  languageId?: string;
  corpus: CorpusPassage[];
  isWorkflowBusy: boolean;
  onImportCorpusPassage: (payload: CorpusImportPayload) => Promise<void>;
}) {
  const { t } = useI18n();
  const graphLanguageId = languageId ?? corpus[0]?.languageId ?? "";
  const [search, setSearch] = useState("");
  const [displayMode, setDisplayMode] = useState<"cards" | "interlinear" | "network">("cards");
  const [morphFilter, setMorphFilter] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<
    { status: "idle" | "loading" } | { status: "ready"; data: NeuralMapResponse } | { status: "error"; message: string }
  >({ status: "idle" });
  const [importDraft, setImportDraft] = useState<CorpusImportDraft>(() => ({ ...EMPTY_CORPUS_IMPORT_DRAFT }));
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingCorpus, setIsImportingCorpus] = useState(false);
  // Collapsed by default so the passage list gets the screen; the import form
  // is an occasional task while browsing is the everyday one.
  const [isImportOpen, setIsImportOpen] = useState(false);
  const normalized = search.trim().toLowerCase();
  const canImportPassage = canSubmitCorpusImportDraft(importDraft)
    && !isWorkflowBusy
    && !isImportingCorpus;
  const filtered = useMemo(() => {
    if (!normalized) return corpus;
    return corpus.filter((passage) => {
      const morphemeText = passage.morphologicalSegmentation
        .map((morpheme) => `${morpheme.surface} ${morpheme.gloss} ${morpheme.lemma} ${morpheme.features.join(" ")}`)
        .join(" ");
      return [
        passage.id,
        passage.source,
        passage.textTarget,
        passage.textTranslation,
        passage.topicTags.join(" "),
        morphemeText
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [corpus, normalized]);

  const visible = useMemo(() => {
    if (!morphFilter) return filtered;
    return filtered.filter((passage) =>
      passage.morphologicalSegmentation.some((morpheme) => morpheme.surface === morphFilter)
    );
  }, [filtered, morphFilter]);

  useEffect(() => {
    if (displayMode !== "network" || !graphLanguageId) return;

    let isCurrent = true;
    setGraphState({ status: "loading" });
    fetchNeuralMap(graphLanguageId)
      .then((data) => {
        if (isCurrent) setGraphState({ status: "ready", data });
      })
      .catch((error: Error) => {
        if (isCurrent) setGraphState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [displayMode, graphLanguageId]);

  function toggleMorphFilter(surface: string) {
    setMorphFilter((current) => (current === surface ? null : surface));
  }

  function clearImportNotice() {
    setImportMessage(null);
    setImportError(null);
  }

  function updateImportDraft(field: keyof CorpusImportDraft, value: string) {
    setImportDraft((current) => ({ ...current, [field]: value }));
    clearImportNotice();
  }

  async function handleImportCorpus(event: FormEvent) {
    event.preventDefault();
    const result = buildCorpusImportPayload(importDraft);
    if (!result.ok) {
      setImportMessage(null);
      setImportError(result.error);
      return;
    }

    setIsImportingCorpus(true);
    setImportMessage(null);
    setImportError(null);
    try {
      await onImportCorpusPassage(result.payload);
      setImportDraft({ ...EMPTY_CORPUS_IMPORT_DRAFT });
      setImportMessage(t("corpus.importSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("corpus.importFailed");
      setImportError(message);
    } finally {
      setIsImportingCorpus(false);
    }
  }

  return (
    <div className="corpus-view">
      <form className="record-card form-panel compact corpus-import-form" aria-label={t("corpus.importFormLabel")} onSubmit={handleImportCorpus}>
        <button
          type="button"
          className="secondary corpus-import-toggle"
          aria-expanded={isImportOpen}
          aria-controls="corpus-import-fields"
          onClick={() => setIsImportOpen((current) => !current)}
        >
          <span>
            <span className="detail-label">{t("corpus.importLabel")}</span>
            <span className="corpus-import-toggle-title">{t("corpus.addSourcePassage")}</span>
          </span>
          <span aria-hidden="true">{isImportOpen ? t("corpus.hide") : t("corpus.open")}</span>
        </button>
        {isImportOpen && (
        <div className="corpus-import-grid" id="corpus-import-fields">
          <div className="form-group wide">
            <label htmlFor="corpus-import-target">{t("corpus.targetTextLabel")}</label>
            <input
              id="corpus-import-target"
              value={importDraft.target}
              onChange={(event) => updateImportDraft("target", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-translation">{t("corpus.translationLabel")}</label>
            <input
              id="corpus-import-translation"
              value={importDraft.translation}
              onChange={(event) => updateImportDraft("translation", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-source">{t("corpus.sourceLabel")}</label>
            <input
              id="corpus-import-source"
              value={importDraft.source}
              onChange={(event) => updateImportDraft("source", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-author">{t("corpus.authorLabel")}</label>
            <input
              id="corpus-import-author"
              value={importDraft.author}
              onChange={(event) => updateImportDraft("author", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-year">{t("corpus.yearLabel")}</label>
            <input
              id="corpus-import-year"
              type="number"
              inputMode="numeric"
              value={importDraft.year}
              onChange={(event) => updateImportDraft("year", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-license">{t("corpus.licenseLabel")}</label>
            <input
              id="corpus-import-license"
              value={importDraft.license}
              onChange={(event) => updateImportDraft("license", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-consent-record">{t("corpus.consentRecordLabel")}</label>
            <input
              id="corpus-import-consent-record"
              value={importDraft.consentRecord}
              onChange={(event) => updateImportDraft("consentRecord", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-consent-use">{t("corpus.consentUseLabel")}</label>
            <select
              id="corpus-import-consent-use"
              value={importDraft.consentUse}
              onChange={(event) => updateImportDraft("consentUse", event.target.value)}
            >
              {CORPUS_CONSENT_USE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`corpus.consentUse.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-tags">{t("corpus.topicTagsLabel")}</label>
            <input
              id="corpus-import-tags"
              value={importDraft.tags}
              onChange={(event) => updateImportDraft("tags", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-morphemes">{t("corpus.morphemeSegmentationLabel")}</label>
            <textarea
              id="corpus-import-morphemes"
              value={importDraft.morphemes}
              onChange={(event) => updateImportDraft("morphemes", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-restrictions">{t("corpus.accessRestrictionsLabel")}</label>
            <input
              id="corpus-import-restrictions"
              value={importDraft.restrictions}
              onChange={(event) => updateImportDraft("restrictions", event.target.value)}
            />
          </div>
        </div>
        )}
        {isImportOpen && (
          <button type="submit" className="secondary" disabled={!canImportPassage}>
            {isImportingCorpus ? t("corpus.importing") : t("corpus.importPassage")}
          </button>
        )}
        {importMessage && <p className="result-notice" role="status" aria-live="polite">{importMessage}</p>}
        {importError && <p className="result-notice error" role="alert">{importError}</p>}
      </form>

      <div className="toolbar-row">
        <label className="search-field" htmlFor="corpus-search">
          <span className="visually-hidden">{t("corpus.searchLabel")}</span>
          <input
            id="corpus-search"
            type="search"
            aria-label={t("corpus.searchLabel")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("corpus.searchPlaceholder")}
          />
        </label>
        <div className="display-mode-toggle" role="group" aria-label={t("corpus.displayModeLabel")}>
          <button
            type="button"
            className={displayMode === "cards" ? "active" : ""}
            aria-pressed={displayMode === "cards"}
            onClick={() => setDisplayMode("cards")}
          >
            {t("corpus.cards")}
          </button>
          <button
            type="button"
            className={displayMode === "interlinear" ? "active" : ""}
            aria-pressed={displayMode === "interlinear"}
            onClick={() => setDisplayMode("interlinear")}
          >
            {t("corpus.interlinear")}
          </button>
          <button
            type="button"
            className={displayMode === "network" ? "active" : ""}
            aria-pressed={displayMode === "network"}
            onClick={() => setDisplayMode("network")}
          >
            {t("corpus.network")}
          </button>
        </div>
        <span className="record-count">{t("corpus.passageCount", { visible: visible.length, total: corpus.length })}</span>
      </div>

      {morphFilter && (
        <div className="active-filter-row">
          <span className="active-filter-pill">
            <span>{t("corpus.morphemeFilter", { morpheme: morphFilter })}</span>
            <button
              type="button"
              aria-label={t("corpus.clearMorphemeFilter", { morpheme: morphFilter })}
              onClick={() => setMorphFilter(null)}
            >
              ×
            </button>
          </span>
          <span className="record-count" role="status" aria-live="polite">
            {visible.length === 1
              ? t("corpus.passagesContainingOne", { count: visible.length, morpheme: morphFilter })
              : t("corpus.passagesContainingOther", { count: visible.length, morpheme: morphFilter })}
          </span>
        </div>
      )}

      <section className="corpus-list" aria-label={displayMode === "network" ? t("corpus.networkLabel") : t("corpus.passagesLabel")}>
        {displayMode === "network" ? (
          <CorpusGraph
            graphLanguageId={graphLanguageId}
            graphState={graphState}
            onRetry={() => {
              if (!graphLanguageId) return;
              setGraphState({ status: "loading" });
              fetchNeuralMap(graphLanguageId)
                .then((data) => setGraphState({ status: "ready", data }))
                .catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : t("corpus.retryNetwork");
                  setGraphState({ status: "error", message });
                });
            }}
          />
        ) : visible.length === 0 ? (
          <p className="empty-state">
            {morphFilter ? t("corpus.emptyMorpheme") : t("corpus.emptySearch")}
          </p>
        ) : displayMode === "interlinear" ? (
          visible.map((passage) => (
            <article className="igt-passage" key={passage.id}>
              <div className="igt-topline">
                <span className="id-badge">{passage.id}</span>
                <span className="pill">{passage.source}</span>
              </div>
              <div className="igt-line">
                {passage.morphologicalSegmentation.map((morpheme, index) => {
                  const isActive = morphFilter === morpheme.surface;
                  return (
                    <button
                      type="button"
                      className={`igt-word${isActive ? " active" : ""}`}
                      key={`${morpheme.surface}-${morpheme.gloss}-${index}`}
                      aria-pressed={isActive}
                      onClick={() => toggleMorphFilter(morpheme.surface)}
                    >
                      <span className="igt-surface">{morpheme.surface}</span>
                      <span className="igt-gloss">{morpheme.gloss}</span>
                    </button>
                  );
                })}
              </div>
              <p className="igt-translation">{passage.textTranslation}</p>
            </article>
          ))
        ) : (
          visible.map((passage) => (
            <article className="corpus-card" key={passage.id}>
              <div className="bead-strip" aria-hidden="true" />
              <div className="corpus-card-body">
                <div className="corpus-topline">
                  <code>{passage.textTarget}</code>
                  <span className="id-badge">{passage.id}</span>
                </div>
                <p className="translation">{passage.textTranslation}</p>
                <MorphChips
                  morphemes={passage.morphologicalSegmentation}
                  onSelect={toggleMorphFilter}
                  activeSurface={morphFilter}
                />
                <div className="pill-row">
                  {passage.topicTags.map((tag, index) => (
                    <span className="pill" key={`${index}:${tag}`}>{tag}</span>
                  ))}
                  <span className="pill">{passage.source}</span>
                  <span className="pill">{passage.consentStatus.use}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

type GraphPoint = {
  id: string;
  x: number;
  y: number;
};

const GRAPH_NODE_LIMIT = 96;
const GRAPH_EDGE_LIMIT = 180;
const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 540;

function graphNodeClass(type: string): string {
  if (type === "language") return "language";
  if (type === "corpus") return "corpus";
  if (type === "morpheme") return "morpheme";
  if (type === "topic_tag") return "topic";
  if (type === "source_asset") return "source";
  return "record";
}

function truncateGraphLabel(value: string): string {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}

function buildGraphLayout(nodes: NeuralMapResponse["nodes"]): Map<string, GraphPoint> {
  const grouped = new Map<string, NeuralMapResponse["nodes"]>();
  for (const node of nodes) {
    grouped.set(node.type, [...(grouped.get(node.type) ?? []), node]);
  }

  const ringByType: Record<string, { radius: number; offset: number }> = {
    language: { radius: 0, offset: 0 },
    corpus: { radius: 120, offset: -Math.PI / 2 },
    morpheme: { radius: 205, offset: -Math.PI / 3 },
    topic_tag: { radius: 278, offset: Math.PI / 7 },
    source_asset: { radius: 278, offset: Math.PI },
    note: { radius: 232, offset: Math.PI / 2 },
    exercise: { radius: 320, offset: Math.PI / 5 },
    ai_session: { radius: 340, offset: Math.PI / 1.5 },
    elder_correction: { radius: 340, offset: Math.PI / 1.15 },
    output: { radius: 340, offset: 0 }
  };
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const points = new Map<string, GraphPoint>();

  for (const [type, group] of grouped) {
    const ring = ringByType[type] ?? { radius: 330, offset: 0 };
    const count = group.length;
    group.forEach((node, index) => {
      const angle = ring.offset + (count === 1 ? 0 : (index / count) * Math.PI * 2);
      points.set(node.id, {
        id: node.id,
        x: centerX + Math.cos(angle) * ring.radius,
        y: centerY + Math.sin(angle) * ring.radius
      });
    });
  }

  return points;
}

function CorpusGraph({
  graphLanguageId,
  graphState,
  onRetry
}: {
  graphLanguageId: string;
  graphState: { status: "idle" | "loading" } | { status: "ready"; data: NeuralMapResponse } | { status: "error"; message: string };
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const visibleGraph = useMemo(() => {
    if (graphState.status !== "ready") return null;
    const nodes = graphState.data.nodes.slice(0, GRAPH_NODE_LIMIT);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graphState.data.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .slice(0, GRAPH_EDGE_LIMIT);
    return { nodes, edges, points: buildGraphLayout(nodes) };
  }, [graphState]);
  const graphData = graphState.status === "ready" ? graphState.data : null;

  if (graphState.status === "idle" || graphState.status === "loading") {
    return <p className="empty-state" role="status" aria-live="polite">{t("corpus.loadingNetwork")}</p>;
  }

  if (graphState.status === "error") {
    return (
      <div className="result-notice error" role="alert">
        <p>{graphState.message}</p>
        {graphLanguageId ? (
          <button type="button" className="secondary" onClick={onRetry}>
            {t("corpus.retryNetwork")}
          </button>
        ) : null}
      </div>
    );
  }

  if (!visibleGraph || !graphData || visibleGraph.nodes.length === 0) {
    return <p className="empty-state">{t("corpus.emptyNetwork")}</p>;
  }

  const nodeCounts = visibleGraph.nodes.reduce<Record<string, number>>((counts, node) => {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, {});
  const insightItems = [
    { type: "corpus", label: t("corpus.networkInsight.passages") },
    { type: "morpheme", label: t("corpus.networkInsight.morphemes") },
    { type: "topic_tag", label: t("corpus.networkInsight.topics") },
    { type: "source_asset", label: t("corpus.networkInsight.sources") },
    { type: "note", label: t("corpus.networkInsight.notes") },
    { type: "exercise", label: t("corpus.networkInsight.exercises") },
    { type: "ai_session", label: t("corpus.networkInsight.sessions") },
    { type: "elder_correction", label: t("corpus.networkInsight.corrections") }
  ].map((item) => ({ ...item, count: nodeCounts[item.type] ?? 0 }))
    .filter((item) => item.count > 0);
  const isLimited = graphData.nodes.length > visibleGraph.nodes.length
    || graphData.edges.length > visibleGraph.edges.length;

  const legendItems = [
    { kind: "language", label: t("corpus.networkKind.language") },
    { kind: "corpus", label: t("corpus.networkKind.corpus") },
    { kind: "source", label: t("corpus.networkKind.source") },
    { kind: "morpheme", label: t("corpus.networkKind.morpheme") },
    { kind: "topic", label: t("corpus.networkKind.topic") },
    { kind: "record", label: t("corpus.networkKind.record") }
  ];

  return (
    <div className="corpus-network-panel">
      <div className="corpus-network-summary">
        <span>{t("corpus.networkNodes", { count: visibleGraph.nodes.length })}</span>
        <span>{t("corpus.networkEdges", { count: visibleGraph.edges.length })}</span>
      </div>
      <div className="corpus-network-insights" aria-label={t("corpus.networkInsights")}>
        {insightItems.map((item) => (
          <span className="corpus-network-insight" key={item.type}>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </span>
        ))}
        {isLimited && (
          <span className="corpus-network-limit">
            {t("corpus.networkLimited", {
              nodes: visibleGraph.nodes.length,
              totalNodes: graphData.nodes.length,
              edges: visibleGraph.edges.length,
              totalEdges: graphData.edges.length
            })}
          </span>
        )}
      </div>
      <svg className="corpus-network-svg" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label={t("corpus.networkLabel")}>
        <g className="network-edges">
          {visibleGraph.edges.map((edge, index) => {
            const source = visibleGraph.points.get(edge.source);
            const target = visibleGraph.points.get(edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={`${edge.source}:${edge.target}:${edge.relation}:${index}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                data-relation={edge.relation}
              />
            );
          })}
        </g>
        <g className="network-nodes">
          {visibleGraph.nodes.map((node) => {
            const point = visibleGraph.points.get(node.id);
            if (!point) return null;
            return (
              <g key={node.id} className={`network-node ${graphNodeClass(node.type)}`} transform={`translate(${point.x} ${point.y})`}>
                <circle r={node.type === "language" ? 18 : node.type === "corpus" ? 12 : 9} />
                <text y={node.type === "language" ? -24 : -15}>{truncateGraphLabel(node.label)}</text>
                <title>{`${node.type}: ${node.label}`}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="corpus-network-legend" aria-label={t("corpus.networkLegend")}>
        {legendItems.map((item) => (
          <span key={item.kind}><i className={`network-dot ${item.kind}`} />{item.label}</span>
        ))}
      </div>
    </div>
  );
}
