import { useMemo, useState } from "react";
import type { NeuralMapResponse } from "../api/aiSessionApi";
import { useI18n, type MessageKey, type Translate } from "../i18n";
type GraphPoint = {
  id: string;
  x: number;
  y: number;
};

const GRAPH_NODE_LIMIT = 96;
const GRAPH_EDGE_LIMIT = 180;
const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 540;
const GRAPH_ZOOM_STEP = 0.25;
const GRAPH_MIN_ZOOM = 0.75;
const GRAPH_MAX_ZOOM = 2;

const GRAPH_NODE_TYPE_PRIORITY: Record<string, number> = {
  language: 0,
  corpus: 1,
  morpheme: 2,
  topic_tag: 3,
  source_asset: 4,
  note: 5,
  exercise: 6,
  elder_correction: 7,
  ai_session: 8,
  output: 9
};

function compareGraphNodeTypes(left: string, right: string): number {
  const priorityDifference = (GRAPH_NODE_TYPE_PRIORITY[left] ?? 100) - (GRAPH_NODE_TYPE_PRIORITY[right] ?? 100);
  if (priorityDifference !== 0) return priorityDifference;
  return left < right ? -1 : left > right ? 1 : 0;
}

function selectCappedGraphNodes(nodes: NeuralMapResponse["nodes"]): NeuralMapResponse["nodes"] {
  return [...nodes]
    .sort((left, right) => {
      const typeDifference = compareGraphNodeTypes(left.type, right.type);
      if (typeDifference !== 0) return typeDifference;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    .slice(0, GRAPH_NODE_LIMIT);
}

function graphNodeClass(type: string): string {
  if (type === "language") return "language";
  if (type === "corpus") return "corpus";
  if (type === "morpheme") return "morpheme";
  if (type === "topic_tag") return "topic";
  if (type === "source_asset") return "source";
  return "record";
}

const GRAPH_NODE_KIND_KEYS: Record<string, MessageKey> = {
  language: "corpus.networkKind.language",
  corpus: "corpus.networkKind.corpus",
  source_asset: "corpus.networkKind.source",
  morpheme: "corpus.networkKind.morpheme",
  topic_tag: "corpus.networkKind.topic",
  note: "corpus.networkKind.note",
  exercise: "corpus.networkKind.exercise",
  ai_session: "corpus.networkKind.session",
  elder_correction: "corpus.networkKind.correction",
  output: "corpus.networkKind.output"
};

function formatGraphNodeKind(type: string, t: Translate): string {
  const key = GRAPH_NODE_KIND_KEYS[type];
  return key ? t(key) : t("corpus.networkKind.record");
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

export function CorpusGraph({
  graphLanguageId,
  graphState,
  onRetry,
  onOpenSingleImport,
  onOpenBulkImport
}: {
  graphLanguageId: string;
  graphState:
    | { status: "idle" | "loading" }
    | { status: "ready"; data: NeuralMapResponse }
    | { status: "error"; message: string };
  onRetry: () => void;
  onOpenSingleImport: () => void;
  onOpenBulkImport: () => void;
}) {
  const { t } = useI18n();
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const cappedGraph = useMemo(() => {
    if (graphState.status !== "ready") return null;
    const nodes = selectCappedGraphNodes(graphState.data.nodes);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graphState.data.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .slice(0, GRAPH_EDGE_LIMIT);
    return { nodes, edges };
  }, [graphState]);
  const visibleGraph = useMemo(() => {
    if (!cappedGraph) return null;
    const nodes = cappedGraph.nodes.filter((node) => !hiddenNodeTypes.has(node.type));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = cappedGraph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { nodes, edges, points: buildGraphLayout(nodes) };
  }, [cappedGraph, hiddenNodeTypes]);
  const graphData = graphState.status === "ready" ? graphState.data : null;
  const cappedNodeCounts = (cappedGraph?.nodes ?? []).reduce<Record<string, number>>((counts, node) => {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, {});
  const availableNodeTypes = Object.keys(cappedNodeCounts).sort(compareGraphNodeTypes);
  const selectedNode = selectedNodeId ? (visibleGraph?.nodes.find((node) => node.id === selectedNodeId) ?? null) : null;
  const selectedRelationCount =
    selectedNode && visibleGraph
      ? visibleGraph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length
      : 0;
  const viewBoxWidth = GRAPH_WIDTH / zoom;
  const viewBoxHeight = GRAPH_HEIGHT / zoom;
  const graphViewBox = [
    (GRAPH_WIDTH - viewBoxWidth) / 2,
    (GRAPH_HEIGHT - viewBoxHeight) / 2,
    viewBoxWidth,
    viewBoxHeight
  ].join(" ");

  function toggleNodeType(type: string) {
    setHiddenNodeTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (!graphLanguageId) {
    return (
      <div className="empty-state corpus-network-empty" role="status" aria-live="polite">
        <p>{t("corpus.noLanguageNetwork")}</p>
      </div>
    );
  }

  if (graphState.status === "idle" || graphState.status === "loading") {
    return (
      <div className="empty-state corpus-network-empty" role="status" aria-live="polite" aria-busy="true">
        <p>{t("corpus.loadingNetwork")}</p>
        <p className="muted">{t("corpus.loadingNetworkHint")}</p>
      </div>
    );
  }

  if (graphState.status === "error") {
    return (
      <div className="result-notice error corpus-network-empty" role="alert">
        <p>{graphState.message}</p>
        <p className="muted">{t("corpus.errorNetworkHint")}</p>
        <div className="practice-next-actions">
          <button type="button" className="secondary" onClick={onRetry}>
            {t("corpus.retryNetwork")}
          </button>
          <button type="button" className="secondary" onClick={onOpenSingleImport}>
            {t("corpus.emptyNetworkAddPassage")}
          </button>
          <button type="button" className="secondary" onClick={onOpenBulkImport}>
            {t("corpus.emptyNetworkAddBulk")}
          </button>
        </div>
      </div>
    );
  }

  if (!visibleGraph || !cappedGraph || !graphData || cappedGraph.nodes.length === 0) {
    return (
      <div className="empty-state corpus-network-empty" role="status" aria-live="polite">
        <p>{t("corpus.emptyNetwork")}</p>
        <p className="muted">{t("corpus.emptyNetworkHint")}</p>
        <div className="practice-next-actions">
          <button type="button" className="secondary" onClick={onOpenSingleImport}>
            {t("corpus.emptyNetworkAddPassage")}
          </button>
          <button type="button" className="secondary" onClick={onOpenBulkImport}>
            {t("corpus.emptyNetworkAddBulk")}
          </button>
        </div>
      </div>
    );
  }

  const insightItems = [
    { type: "corpus", label: t("corpus.networkInsight.passages") },
    { type: "morpheme", label: t("corpus.networkInsight.morphemes") },
    { type: "topic_tag", label: t("corpus.networkInsight.topics") },
    { type: "source_asset", label: t("corpus.networkInsight.sources") },
    { type: "note", label: t("corpus.networkInsight.notes") },
    { type: "exercise", label: t("corpus.networkInsight.exercises") },
    { type: "ai_session", label: t("corpus.networkInsight.sessions") },
    { type: "elder_correction", label: t("corpus.networkInsight.corrections") }
  ]
    .map((item) => ({ ...item, count: cappedNodeCounts[item.type] ?? 0 }))
    .filter((item) => item.count > 0);
  const isLimited =
    graphData.nodes.length > cappedGraph.nodes.length || graphData.edges.length > cappedGraph.edges.length;

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
      <fieldset className="corpus-network-filters">
        <legend>{t("corpus.networkFilters")}</legend>
        <div className="corpus-network-filter-options">
          {availableNodeTypes.map((type) => {
            const isVisible = !hiddenNodeTypes.has(type);
            const typeLabel = formatGraphNodeKind(type, t);
            return (
              <label className={`corpus-network-filter${isVisible ? "" : " muted"}`} key={type}>
                <input
                  type="checkbox"
                  checked={isVisible}
                  aria-label={t("corpus.networkFilterNodeType", {
                    type: typeLabel,
                    count: cappedNodeCounts[type]
                  })}
                  onChange={() => toggleNodeType(type)}
                />
                <i className={`network-dot ${graphNodeClass(type)}`} aria-hidden="true" />
                <span>{typeLabel}</span>
                <span className="corpus-network-filter-count">{cappedNodeCounts[type]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
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
              nodes: cappedGraph.nodes.length,
              totalNodes: graphData.nodes.length,
              edges: cappedGraph.edges.length,
              totalEdges: graphData.edges.length
            })}
          </span>
        )}
      </div>
      <div className="corpus-network-canvas-header">
        <span className="corpus-network-zoom-level" aria-live="polite">
          {t("corpus.networkZoomLevel", { percent: Math.round(zoom * 100) })}
        </span>
        <div className="corpus-network-zoom-controls" role="group" aria-label={t("corpus.networkZoomControls")}>
          <button
            type="button"
            className="corpus-network-icon-button"
            aria-label={t("corpus.networkZoomOut")}
            title={t("corpus.networkZoomOut")}
            disabled={zoom <= GRAPH_MIN_ZOOM}
            onClick={() => setZoom((current) => Math.max(GRAPH_MIN_ZOOM, current - GRAPH_ZOOM_STEP))}
          >
            <span aria-hidden="true">-</span>
          </button>
          <button
            type="button"
            className="corpus-network-icon-button corpus-network-reset-button"
            aria-label={t("corpus.networkZoomReset")}
            title={t("corpus.networkZoomReset")}
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            <span aria-hidden="true">1:1</span>
          </button>
          <button
            type="button"
            className="corpus-network-icon-button"
            aria-label={t("corpus.networkZoomIn")}
            title={t("corpus.networkZoomIn")}
            disabled={zoom >= GRAPH_MAX_ZOOM}
            onClick={() => setZoom((current) => Math.min(GRAPH_MAX_ZOOM, current + GRAPH_ZOOM_STEP))}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
      <div className="corpus-network-stage">
        <svg className="corpus-network-svg" viewBox={graphViewBox} role="img" aria-label={t("corpus.networkLabel")}>
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
              const typeLabel = formatGraphNodeKind(node.type, t);
              const connectedRelationCount = visibleGraph.edges.filter(
                (edge) => edge.source === node.id || edge.target === node.id
              ).length;
              const isSelected = node.id === selectedNode?.id;
              return (
                <g
                  key={node.id}
                  className={`network-node ${graphNodeClass(node.type)}${isSelected ? " selected" : ""}`}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={t("corpus.networkNodeAria", {
                    type: typeLabel,
                    label: node.label,
                    count: connectedRelationCount
                  })}
                  data-node-id={node.id}
                  data-node-type={node.type}
                  onClick={() => setSelectedNodeId(node.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedNodeId(node.id);
                  }}
                >
                  <circle r={node.type === "language" ? 18 : node.type === "corpus" ? 12 : 9} />
                  <text y={node.type === "language" ? -24 : -15}>{truncateGraphLabel(node.label)}</text>
                  <title>{t("corpus.networkNodeTitle", { type: typeLabel, label: node.label })}</title>
                </g>
              );
            })}
          </g>
        </svg>
        {visibleGraph.nodes.length === 0 && (
          <p className="corpus-network-filter-empty" role="status">
            {t("corpus.networkFilterEmpty")}
          </p>
        )}
      </div>
      <aside className="corpus-network-detail" aria-label={t("corpus.networkDetails")} aria-live="polite">
        <span className="detail-label">{t("corpus.networkDetails")}</span>
        {selectedNode ? (
          <dl>
            <div>
              <dt>{t("corpus.networkDetailLabel")}</dt>
              <dd>{selectedNode.label}</dd>
            </div>
            <div>
              <dt>{t("corpus.networkDetailType")}</dt>
              <dd>{formatGraphNodeKind(selectedNode.type, t)}</dd>
            </div>
            <div>
              <dt>{t("corpus.networkDetailId")}</dt>
              <dd>{selectedNode.id}</dd>
            </div>
            <div>
              <dt>{t("corpus.networkDetailRelations")}</dt>
              <dd>{selectedRelationCount}</dd>
            </div>
          </dl>
        ) : (
          <p>{t("corpus.networkSelectNode")}</p>
        )}
      </aside>
      <div className="corpus-network-legend" aria-label={t("corpus.networkLegend")}>
        {legendItems.map((item) => (
          <span key={item.kind}>
            <i className={`network-dot ${item.kind}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
