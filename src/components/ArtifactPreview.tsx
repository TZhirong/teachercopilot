"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { AlertTriangle, ChevronLeft, ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  getSlideContentDirectionOption,
  getSlideStylePresetOption
} from "@/lib/agent/slide-preferences";
import { buildHomeworkFeedbackReview } from "@/lib/agent/homework-feedback-review";
import { buildQuizReview } from "@/lib/agent/quiz-review";
import { buildSlideDeckReview, type SlideDeckReview } from "@/lib/agent/slide-review";
import { resolvePptxStyle, resolveSlideLayoutVariant } from "@/lib/export/pptx-style";
import type {
  AgentArtifact,
  HomeworkFeedbackArtifact,
  KnowledgeMapArtifact,
  LessonPlanArtifact,
  ModuleResult,
  QuizBuilderArtifact,
  SlideOutlineArtifact
} from "@/types/agent";

type KnowledgeFlowNodeData = Record<string, unknown> & {
  active: boolean;
  dimmed: boolean;
  label: string;
  level: number;
  matched: boolean;
  relatedCount: number;
  root: boolean;
  summary: string;
};

type RelationCategory =
  | "application"
  | "assessment"
  | "contain"
  | "generic"
  | "misconception"
  | "prerequisite"
  | "support";

type KnowledgeTab = "misconceptions" | "nodes" | "relations" | "teaching";
type KnowledgeViewMode = "application" | "core" | "full" | "misconception";

type KnowledgeFlowNode = Node<KnowledgeFlowNodeData, "knowledgeNode">;
type KnowledgeFlowEdge = Edge<{
  category: RelationCategory;
  index: number;
  relation: string;
  sourceLabel: string;
  targetLabel: string;
}>;

const knowledgeNodeTypes = {
  knowledgeNode: KnowledgeGraphNode
};

const knowledgeNodeOrigin: [number, number] = [0.5, 0.5];

const relationCategoryLabels: Record<RelationCategory, string> = {
  application: "应用",
  assessment: "评价",
  contain: "包含",
  generic: "关联",
  misconception: "误区",
  prerequisite: "先修",
  support: "支撑"
};

const knowledgeTabs: Array<{ id: KnowledgeTab; label: string }> = [
  { id: "relations", label: "关系索引" },
  { id: "nodes", label: "节点库" },
  { id: "teaching", label: "教学转化" },
  { id: "misconceptions", label: "易错纠偏" }
];

const knowledgeViewModes: Array<{ id: KnowledgeViewMode; label: string }> = [
  { id: "full", label: "全图" },
  { id: "core", label: "核心链路" },
  { id: "misconception", label: "易错点" },
  { id: "application", label: "课堂应用" }
];

export function ArtifactPreview({
  result,
  isGenerating,
  streamingText,
  title
}: {
  result?: ModuleResult;
  isGenerating: boolean;
  streamingText: string;
  title: string;
}) {
  if (isGenerating) {
    return (
      <div className="artifact-skeleton" aria-live="polite">
        <Loader2 className="spin" size={24} />
        <strong>正在生成结构化成果</strong>
        <span>已接收 {streamingText.length} 字</span>
        <div className="skeleton-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  if (result?.parseError) {
    return (
      <div className="fallback-output">
        <div className="fallback-head">
          <AlertTriangle size={18} />
          <strong>结构化解析失败</strong>
          <span>{result.parseError}</span>
        </div>
        <pre>{result.rawText || result.markdownFallback || "暂无可展示内容。"}</pre>
      </div>
    );
  }

  if (!result?.artifact) {
    return (
      <div className="empty-output">
        <div className="empty-badge" aria-hidden="true">
          <FileText size={28} />
        </div>
        <strong>{title}结果将在这里生成</strong>
        <span>填写左侧课程画像后点击「生成」，结构化成果会在此预览。</span>
      </div>
    );
  }

  return <ArtifactView artifact={result.artifact} />;
}

function ArtifactView({ artifact }: { artifact: AgentArtifact }) {
  switch (artifact.moduleId) {
    case "knowledge-map":
      return <KnowledgeMapPreview artifact={artifact} />;
    case "lesson-plan":
      return <LessonPlanPreview artifact={artifact} />;
    case "slide-outline":
      return <SlideOutlinePreview artifact={artifact} />;
    case "quiz-builder":
      return <QuizPreview artifact={artifact} />;
    case "homework-feedback":
      return <HomeworkPreview artifact={artifact} />;
  }
}

function KnowledgeMapPreview({ artifact }: { artifact: KnowledgeMapArtifact }) {
  const rootId = artifact.nodes[0]?.id;
  const nodeLabels = new Map(artifact.nodes.map((node) => [node.id, node.label]));
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredEdgeId, setHoveredEdgeId] = useState("");
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("relations");
  const [disabledCategories, setDisabledCategories] = useState<Set<RelationCategory>>(
    () => new Set()
  );
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>("full");
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const selectedNode = selectedNodeId
    ? artifact.nodes.find((node) => node.id === selectedNodeId)
    : undefined;
  const selectedRelations = selectedNode
    ? artifact.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : [];
  const searchResultNodes = useMemo(() => {
    if (!normalizedSearch) return [];
    return artifact.nodes.filter((node) =>
      `${node.label} ${node.summary} Level ${node.level}`.toLowerCase().includes(normalizedSearch)
    );
  }, [artifact.nodes, normalizedSearch]);
  const searchMatchedNodeIds = useMemo(
    () => new Set(searchResultNodes.map((node) => node.id)),
    [searchResultNodes]
  );
  const relationLegend = useMemo(() => {
    const categories = Array.from(
      new Set(artifact.edges.map((edge) => classifyRelation(edge.label || "")))
    );
    return categories.length ? categories : (["generic"] as RelationCategory[]);
  }, [artifact.edges]);
  const activeCategories = useMemo(
    () => new Set(relationLegend.filter((category) => !disabledCategories.has(category))),
    [disabledCategories, relationLegend]
  );
  const graphArtifact = useMemo(
    () => buildKnowledgeGraphView(artifact, viewMode, activeCategories),
    [activeCategories, artifact, viewMode]
  );
  const visibleNodeIds = useMemo(
    () => new Set(graphArtifact.nodes.map((node) => node.id)),
    [graphArtifact.nodes]
  );
  const graphSelectedNodeId = selectedNode?.id && visibleNodeIds.has(selectedNode.id)
    ? selectedNode.id
    : undefined;
  const visibleSearchMatchedNodeIds = useMemo(
    () => new Set(Array.from(searchMatchedNodeIds).filter((nodeId) => visibleNodeIds.has(nodeId))),
    [searchMatchedNodeIds, visibleNodeIds]
  );
  const { edges, nodes } = useMemo(
    () =>
      buildKnowledgeFlowElements(
        graphArtifact,
        graphSelectedNodeId,
        visibleSearchMatchedNodeIds,
        !!normalizedSearch,
        hoveredEdgeId
      ),
    [graphArtifact, graphSelectedNodeId, hoveredEdgeId, normalizedSearch, visibleSearchMatchedNodeIds]
  );
  const graphViewKey = useMemo(
    () =>
      [
        viewMode,
        Array.from(activeCategories).sort().join(","),
        graphArtifact.nodes.map((node) => node.id).join(","),
        graphArtifact.edges.map((edge) => `${edge.source}>${edge.target}:${edge.label}`).join(",")
      ].join("|"),
    [activeCategories, graphArtifact.edges, graphArtifact.nodes, viewMode]
  );
  const hoveredRelation = edges.find((edge) => edge.id === hoveredEdgeId)?.data;
  const misconceptionRelations = artifact.edges.filter(
    (edge) => classifyRelation(edge.label || "") === "misconception"
  );

  function toggleRelationCategory(category: RelationCategory) {
    setDisabledCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
        return next;
      }

      const enabledCount = relationLegend.filter((item) => !current.has(item)).length;
      if (enabledCount <= 1) return current;
      next.add(category);
      return next;
    });
  }

  return (
    <div className="artifact-view knowledge-layout knowledge-focus">
      <section className="preview-hero">
        <p>知识图谱</p>
        <h3>{artifact.title}</h3>
      </section>
      <section className="knowledge-stage">
        <div className="knowledge-stage-head">
          <div className="knowledge-stage-title">
            <span>交互知识图谱</span>
            <strong>{graphArtifact.nodes.length} 个可见节点 / {graphArtifact.edges.length} 条可见关系</strong>
          </div>
          <div className="knowledge-stage-tools">
            <div className="knowledge-view-switch" aria-label="知识图谱视图模式">
              {knowledgeViewModes.map((mode) => (
                <button
                  className={viewMode === mode.id ? "selected" : ""}
                  key={mode.id}
                  type="button"
                  onClick={() => setViewMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <label className="knowledge-search">
              <Search size={15} />
              <input
                aria-label="搜索知识节点"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索节点"
              />
            </label>
            <div className="relation-legend" aria-label="关系类型图例">
              {relationLegend.map((category) => (
                <button
                  className={`relation-${category} ${
                    activeCategories.has(category) ? "selected" : ""
                  }`}
                  key={category}
                  type="button"
                  onClick={() => toggleRelationCategory(category)}
                >
                  <i />
                  {relationCategoryLabels[category]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {normalizedSearch ? (
          <div className="knowledge-search-results" aria-live="polite">
            {searchResultNodes.length ? (
              searchResultNodes.slice(0, 6).map((node) => (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    if (!visibleNodeIds.has(node.id)) setViewMode("full");
                  }}
                >
                  <span>L{node.level}</span>
                  {node.label}
                </button>
              ))
            ) : (
              <small>没有匹配的知识节点</small>
            )}
          </div>
        ) : null}
        <div className="knowledge-flow-shell">
          <div className="knowledge-flow-canvas">
            <ReactFlow<KnowledgeFlowNode, KnowledgeFlowEdge>
              key={graphViewKey}
              nodes={nodes}
              edges={edges}
              nodeTypes={knowledgeNodeTypes}
              nodeOrigin={knowledgeNodeOrigin}
              fitView
              fitViewOptions={{ maxZoom: 1.08, padding: 0.16 }}
              minZoom={0.45}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              onlyRenderVisibleElements
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
              onEdgeMouseLeave={() => setHoveredEdgeId("")}
              onPaneClick={() => {
                setSelectedNodeId("");
                setHoveredEdgeId("");
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--color-edge)" gap={30} />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </div>
          <aside className="knowledge-focus-panel">
            <div className="focus-node-title">
              <span>{selectedNode ? `Level ${selectedNode.level}` : "全图浏览"}</span>
              <strong>{selectedNode?.label || "未选择节点"}</strong>
            </div>
            <article className="focus-teaching-card">
              <b>教学解释</b>
              <p>
                {selectedNode?.summary ||
                  "当前展示完整知识图谱。点击任一节点可聚焦它的一跳关系；点击画布空白处可回到全图浏览。"}
              </p>
              <small>
                {selectedNode
                  ? `可追问：${selectedNode.label} 和它相邻节点之间是什么教学关系？`
                  : "可先用搜索定位概念，再让学生说明该节点与前后概念的关系。"}
              </small>
            </article>
            <div className="focus-relations">
              <b>{selectedNode ? "相关关系" : "聚焦关系"}</b>
              {hoveredRelation ? (
                <article className={`edge-hover-card relation-${hoveredRelation.category}`}>
                  <span>当前悬停关系</span>
                  <strong>
                    {hoveredRelation.sourceLabel}
                    <em>{hoveredRelation.relation || "关联"}</em>
                    {hoveredRelation.targetLabel}
                  </strong>
                  <small>{relationCategoryLabels[hoveredRelation.category]}关系</small>
                </article>
              ) : null}
              {selectedRelations.length ? (
                <ul>
                  {selectedRelations.map((edge) => (
                    <li
                      className={`relation-${classifyRelation(edge.label || "")}`}
                      key={`${edge.source}-${edge.target}-${edge.label}`}
                    >
                      <i>{nodeLabels.get(edge.source) || edge.source}</i>
                      <em>{edge.label || "关联"}</em>
                      <i>{nodeLabels.get(edge.target) || edge.target}</i>
                    </li>
                  ))}
                </ul>
              ) : (
                <small>选择一个节点后，这里会显示它直接连接的关系。</small>
              )}
            </div>
          </aside>
        </div>
      </section>
      <section className="knowledge-tabs" aria-label="知识图谱详情">
        <div className="knowledge-tab-list" role="tablist" aria-label="知识图谱详情分类">
          {knowledgeTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "selected" : ""}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="knowledge-tab-panel">
          {activeTab === "relations" ? (
            <KnowledgeRelationsPanel
              edges={artifact.edges}
              nodeLabels={nodeLabels}
              rootId={rootId}
              selectedNodeId={selectedNode?.id}
            />
          ) : null}
          {activeTab === "nodes" ? (
            <KnowledgeNodeBankPanel artifact={artifact} nodeLabels={nodeLabels} />
          ) : null}
          {activeTab === "teaching" ? <KnowledgeTeachingPanel artifact={artifact} /> : null}
          {activeTab === "misconceptions" ? (
            <KnowledgeMisconceptionPanel
              artifact={artifact}
              misconceptionRelations={misconceptionRelations}
              nodeLabels={nodeLabels}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function KnowledgeRelationsPanel({
  edges,
  nodeLabels,
  rootId,
  selectedNodeId
}: {
  edges: KnowledgeMapArtifact["edges"];
  nodeLabels: Map<string, string>;
  rootId?: string;
  selectedNodeId?: string;
}) {
  if (!edges.length) return <EmptyTabNote text="暂无关系链路。" />;

  return (
    <section className="knowledge-relations" aria-label="完整关系链路">
      <div className="relation-heading">
        <span>完整关系索引</span>
        <strong>{edges.length} 条关系全部展示</strong>
      </div>
      <div className="relation-chip-grid">
        {edges.map((edge, index) => (
          <article
            className={`relation-${classifyRelation(edge.label || "")} ${
              edge.source === rootId ? "primary-relation" : ""
            } ${selectedNodeId === edge.source || selectedNodeId === edge.target ? "active-relation" : ""}`}
            key={`${edge.source}-${edge.target}-${edge.label}`}
          >
            <div className="relation-chip-head">
              <b>{`R${String(index + 1).padStart(2, "0")}`}</b>
              <strong>{edge.label || "支撑"}</strong>
            </div>
            <p className="relation-chip-path">
              <span>{nodeLabels.get(edge.source) || edge.source}</span>
              <span>{nodeLabels.get(edge.target) || edge.target}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function KnowledgeNodeBankPanel({
  artifact,
  nodeLabels
}: {
  artifact: KnowledgeMapArtifact;
  nodeLabels: Map<string, string>;
}) {
  return (
    <section className="knowledge-node-bank" aria-label="节点细节库">
      <div className="relation-heading">
        <span>节点细节库</span>
        <strong>{artifact.nodes.length} 个知识节点</strong>
      </div>
      <div className="node-detail-grid">
        {artifact.nodes.map((node) => {
          const linkedEdges = artifact.edges.filter(
            (edge) => edge.source === node.id || edge.target === node.id
          );

          return (
            <article key={node.id}>
              <div>
                <span>Level {node.level}</span>
                <strong>{node.label}</strong>
              </div>
              <p>{node.summary}</p>
              {linkedEdges.length ? (
                <ul>
                  {linkedEdges.slice(0, 4).map((edge) => (
                    <li key={`${node.id}-${edge.source}-${edge.target}-${edge.label}`}>
                      {nodeLabels.get(edge.source) || edge.source}
                      <em>{edge.label || "关联"}</em>
                      {nodeLabels.get(edge.target) || edge.target}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function KnowledgeTeachingPanel({ artifact }: { artifact: KnowledgeMapArtifact }) {
  return (
    <div className="knowledge-teaching-panel">
      <div className="knowledge-insights">
        <PreviewBlock title="先修关系">
          {artifact.prerequisites.length ? (
            artifact.prerequisites.map((item) => (
              <FactLine key={`${item.title}-${item.detail}`} title={item.title} text={item.detail} />
            ))
          ) : (
            <EmptyTabNote text="暂无先修关系说明。" />
          )}
        </PreviewBlock>
        <PreviewBlock title="教学重难点">
          {artifact.keyPoints.length ? (
            artifact.keyPoints.map((item) => (
              <FactLine
                key={`${item.type}-${item.title}`}
                title={`${item.type} · ${item.title}`}
                text={item.strategy}
              />
            ))
          ) : (
            <EmptyTabNote text="暂无教学重难点。" />
          )}
        </PreviewBlock>
      </div>
      <section className="activity-strip">
        {artifact.activities.length ? (
          artifact.activities.map((activity) => (
            <article key={activity.title}>
              <strong>{activity.title}</strong>
              <ol>
                {activity.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          ))
        ) : (
          <article>
            <strong>课堂活动</strong>
            <p>暂无课堂活动建议。</p>
          </article>
        )}
      </section>
    </div>
  );
}

function KnowledgeMisconceptionPanel({
  artifact,
  misconceptionRelations,
  nodeLabels
}: {
  artifact: KnowledgeMapArtifact;
  misconceptionRelations: KnowledgeMapArtifact["edges"];
  nodeLabels: Map<string, string>;
}) {
  return (
    <div className="knowledge-misconception-panel">
      <PreviewBlock title="易错点纠偏">
        {artifact.misconceptions.length ? (
          artifact.misconceptions.map((item) => (
            <FactLine
              key={`${item.title}-${item.prompt}`}
              title={item.title}
              text={`${item.correction} 追问：${item.prompt}`}
            />
          ))
        ) : (
          <EmptyTabNote text="暂无易错点纠偏内容。" />
        )}
      </PreviewBlock>
      <section className="knowledge-relations" aria-label="误区关系链路">
        <div className="relation-heading">
          <span>误区关系</span>
          <strong>{misconceptionRelations.length} 条</strong>
        </div>
        {misconceptionRelations.length ? (
          <div className="relation-chip-grid">
            {misconceptionRelations.map((edge, index) => (
              <article
                className={`relation-${classifyRelation(edge.label || "")}`}
                key={`${edge.source}-${edge.target}-${edge.label}`}
              >
                <div className="relation-chip-head">
                  <b>{`M${String(index + 1).padStart(2, "0")}`}</b>
                  <strong>{edge.label || "误区"}</strong>
                </div>
                <p className="relation-chip-path">
                  <span>{nodeLabels.get(edge.source) || edge.source}</span>
                  <span>{nodeLabels.get(edge.target) || edge.target}</span>
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyTabNote text="暂无误区关系。" />
        )}
      </section>
    </div>
  );
}

function EmptyTabNote({ text }: { text: string }) {
  return <p className="empty-tab-note">{text}</p>;
}

function KnowledgeGraphNode({ data }: NodeProps<KnowledgeFlowNode>) {
  return (
    <div
      className={`knowledge-flow-node ${data.root ? "root" : ""} ${
        data.active ? "active" : ""
      } ${data.matched ? "matched" : ""} ${data.dimmed ? "dimmed" : ""}`}
    >
      <Handle className="knowledge-flow-handle" type="target" position={Position.Left} />
      <div className="flow-node-level">L{data.level}</div>
      <strong>{data.label}</strong>
      <span>{data.relatedCount} 关系</span>
      <Handle className="knowledge-flow-handle" type="source" position={Position.Right} />
    </div>
  );
}

function buildKnowledgeGraphView(
  artifact: KnowledgeMapArtifact,
  viewMode: KnowledgeViewMode,
  activeCategories: Set<RelationCategory>
): KnowledgeMapArtifact {
  const rootNode = artifact.nodes[0];
  const rootId = rootNode?.id;
  const modeCategories: Record<KnowledgeViewMode, Set<RelationCategory> | null> = {
    application: new Set(["application", "assessment"]),
    core: new Set(["contain", "generic", "prerequisite", "support"]),
    full: null,
    misconception: new Set(["misconception"])
  };
  const preferredCategories = modeCategories[viewMode];
  const visibleEdges = artifact.edges.filter((edge) => {
    const category = classifyRelation(edge.label || "");
    if (!activeCategories.has(category)) return false;
    if (!preferredCategories) return true;
    return (
      preferredCategories.has(category) ||
      (viewMode === "core" && !!rootId && (edge.source === rootId || edge.target === rootId))
    );
  });
  const visibleNodeIds = new Set<string>();

  if (rootId) visibleNodeIds.add(rootId);
  visibleEdges.forEach((edge) => {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  });

  const visibleNodes = artifact.nodes.filter((node) => visibleNodeIds.has(node.id));

  return {
    ...artifact,
    nodes: visibleNodes.length ? visibleNodes : rootNode ? [rootNode] : [],
    edges: visibleEdges
  };
}

function buildKnowledgeFlowElements(
  artifact: KnowledgeMapArtifact,
  selectedNodeId?: string,
  matchedNodeIds = new Set<string>(),
  searchActive = false,
  hoveredEdgeId = ""
): {
  edges: KnowledgeFlowEdge[];
  nodes: KnowledgeFlowNode[];
} {
  const positions = layoutKnowledgeFlowNodes(artifact);
  const relatedEdgeIds = new Set<string>();
  const relatedNodeIds = new Set<string>();

  if (selectedNodeId) {
    relatedNodeIds.add(selectedNodeId);
    artifact.edges.forEach((edge, index) => {
      if (edge.source !== selectedNodeId && edge.target !== selectedNodeId) return;
      relatedEdgeIds.add(knowledgeEdgeId(edge, index));
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
    });
  }

  const relationCount = new Map<string, number>();
  artifact.edges.forEach((edge) => {
    relationCount.set(edge.source, (relationCount.get(edge.source) || 0) + 1);
    relationCount.set(edge.target, (relationCount.get(edge.target) || 0) + 1);
  });

  const nodes: KnowledgeFlowNode[] = artifact.nodes.map((node, index) => {
    const position = positions.get(node.id) || { x: index * 120, y: 0 };
    const active = node.id === selectedNodeId;
    const related = !selectedNodeId || relatedNodeIds.has(node.id);
    const matched = searchActive && matchedNodeIds.has(node.id);

    return {
      id: node.id,
      type: "knowledgeNode",
      position,
      data: {
        active,
        dimmed: !related || (searchActive && !matched),
        label: node.label,
        level: node.level,
        matched,
        relatedCount: relationCount.get(node.id) || 0,
        root: index === 0,
        summary: node.summary
      }
    };
  });

  const edges: KnowledgeFlowEdge[] = artifact.edges.map((edge, index) => {
    const id = knowledgeEdgeId(edge, index);
    const active = relatedEdgeIds.has(id);
    const hovered = id === hoveredEdgeId;
    const category = classifyRelation(edge.label || "");
    const searchRelated =
      !searchActive || matchedNodeIds.has(edge.source) || matchedNodeIds.has(edge.target);
    const faded = (!!selectedNodeId && !active && !hovered) || !searchRelated;

    return {
      id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: active || hovered,
      label: hovered ? `R${String(index + 1).padStart(2, "0")} ${edge.label || "关联"}` : undefined,
      data: {
        category,
        index,
        relation: edge.label,
        sourceLabel: artifact.nodes.find((node) => node.id === edge.source)?.label || edge.source,
        targetLabel: artifact.nodes.find((node) => node.id === edge.target)?.label || edge.target
      },
      markerEnd: {
        type: MarkerType.ArrowClosed
      },
      className: `knowledge-flow-edge relation-${category} ${active ? "active" : ""} ${
        hovered ? "hovered" : ""
      } ${faded ? "faded" : ""}`,
      style: {
        strokeWidth: active || hovered ? 2.7 : 1.35
      }
    };
  });

  return { edges, nodes };
}

function knowledgeEdgeId(edge: KnowledgeMapArtifact["edges"][number], index: number) {
  return `edge-${index}-${edge.source}-${edge.target}-${edge.label || "rel"}`;
}

function classifyRelation(label: string): RelationCategory {
  const text = label.toLowerCase();
  if (/先修|前置|依赖|基础|准备/u.test(text)) return "prerequisite";
  if (/包含|组成|属于|细化|分解|分类/u.test(text)) return "contain";
  if (/误区|纠偏|警惕|反证|导致|风险|危害|混淆/u.test(text)) return "misconception";
  if (/应用|落地|实践|案例|活动|迁移|改造|目标/u.test(text)) return "application";
  if (/评价|诊断|测验|反馈|考核|证据/u.test(text)) return "assessment";
  if (/支撑|维护|建立|符合|体现|通过|关联|连接/u.test(text)) return "support";
  return "generic";
}

function layoutKnowledgeFlowNodes(artifact: KnowledgeMapArtifact) {
  const positions = new Map<string, { x: number; y: number }>();
  const ranks = new Map<string, number>();
  const originalOrder = new Map(artifact.nodes.map((node, index) => [node.id, index]));
  const root = artifact.nodes[0];

  artifact.nodes.forEach((node, index) => {
    const levelRank = Math.max(0, Math.round(node.level || 1) - 1);
    ranks.set(node.id, index === 0 ? 0 : levelRank);
  });

  const maxRank = Math.max(4, Math.min(8, Math.max(...artifact.nodes.map((node) => node.level || 1)) + 2));
  for (let iteration = 0; iteration < artifact.nodes.length; iteration += 1) {
    artifact.edges.forEach((edge) => {
      if (edge.source === edge.target || edge.target === root?.id) return;
      const sourceRank = ranks.get(edge.source);
      const targetRank = ranks.get(edge.target);
      if (sourceRank === undefined || targetRank === undefined) return;
      if (targetRank < sourceRank) {
        ranks.set(edge.target, Math.min(maxRank, sourceRank + 1));
      }
    });
  }

  const grouped = new Map<number, KnowledgeMapArtifact["nodes"]>();
  artifact.nodes.forEach((node) => {
    const rank = ranks.get(node.id) || 0;
    grouped.set(rank, [...(grouped.get(rank) || []), node]);
  });

  const orderScore = new Map(artifact.nodes.map((node, index) => [node.id, index]));
  for (let iteration = 0; iteration < 6; iteration += 1) {
    Array.from(grouped.keys())
      .sort((a, b) => a - b)
      .forEach((rank) => {
        const nodes = grouped.get(rank) || [];
        nodes.sort((a, b) => {
          const aScore = connectedOrderScore(a.id, artifact, ranks, orderScore, originalOrder);
          const bScore = connectedOrderScore(b.id, artifact, ranks, orderScore, originalOrder);
          return aScore - bScore;
        });
        nodes.forEach((node, index) => {
          orderScore.set(node.id, rank * 100 + index);
        });
      });
  }

  Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([rank, nodes]) => {
      const columnHeight = nodes.reduce((total, node, index) => {
        const size = flowNodeSize(node.label, node.id === root?.id);
        return total + size.height + (index > 0 ? 34 : 0);
      }, 0);
      let y = -columnHeight / 2;

      nodes.forEach((node) => {
        const size = flowNodeSize(node.label, node.id === root?.id);
        positions.set(node.id, {
          x: rank * 258,
          y: Math.round(y + size.height / 2)
        });
        y += size.height + 34;
      });
    });

  relaxKnowledgeFlowPositions(positions, artifact.nodes);
  return positions;
}

function connectedOrderScore(
  nodeId: string,
  artifact: KnowledgeMapArtifact,
  ranks: Map<string, number>,
  orderScore: Map<string, number>,
  originalOrder: Map<string, number>
) {
  const nodeRank = ranks.get(nodeId) || 0;
  const connectedScores = artifact.edges
    .flatMap((edge) => {
      if (edge.target === nodeId) return [edge.source];
      if (edge.source === nodeId) return [edge.target];
      return [];
    })
    .filter((id) => (ranks.get(id) || 0) < nodeRank)
    .map((id) => orderScore.get(id))
    .filter((score): score is number => score !== undefined);

  if (!connectedScores.length) return originalOrder.get(nodeId) || 0;
  return connectedScores.reduce((total, score) => total + score, 0) / connectedScores.length;
}

function relaxKnowledgeFlowPositions(
  positions: Map<string, { x: number; y: number }>,
  nodes: KnowledgeMapArtifact["nodes"]
) {
  const sizes = new Map(nodes.map((node, index) => [node.id, flowNodeSize(node.label, index === 0)]));

  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let aIndex = 0; aIndex < nodes.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < nodes.length; bIndex += 1) {
        const a = nodes[aIndex];
        const b = nodes[bIndex];
        const aPosition = positions.get(a.id);
        const bPosition = positions.get(b.id);
        const aSize = sizes.get(a.id);
        const bSize = sizes.get(b.id);
        if (!aPosition || !bPosition || !aSize || !bSize) continue;

        const dx = bPosition.x - aPosition.x || 1;
        const dy = bPosition.y - aPosition.y || 1;
        const overlapX = (aSize.width + bSize.width) / 2 + 28 - Math.abs(dx);
        const overlapY = (aSize.height + bSize.height) / 2 + 24 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const moveAlongX = overlapX < overlapY;
        const direction = moveAlongX ? Math.sign(dx) || 1 : Math.sign(dy) || 1;
        const amount = Math.min(moveAlongX ? overlapX : overlapY, 30) / 2;

        if (aIndex !== 0) {
          if (moveAlongX) aPosition.x -= direction * amount;
          else aPosition.y -= direction * amount;
        }
        if (bIndex !== 0) {
          if (moveAlongX) bPosition.x += direction * amount;
          else bPosition.y += direction * amount;
        }
      }
    }
  }
}

function flowNodeSize(label: string, root: boolean) {
  const width = root ? 220 : Math.min(210, Math.max(174, visualTextLength(label) * 12 + 54));
  const height = root ? 82 : visualTextLength(label) > 8 ? 76 : 68;
  return { height, width };
}

function visualTextLength(text: string) {
  return Array.from(text).reduce((total, char) => total + (/^[\x00-\x7F]$/u.test(char) ? 0.66 : 1), 0);
}

function LessonPlanPreview({ artifact }: { artifact: LessonPlanArtifact }) {
  return (
    <div className="artifact-view">
      <section className="preview-hero">
        <p>教案设计</p>
        <h3>{artifact.title}</h3>
      </section>
      <section className="objective-grid">
        {artifact.objectives.map((item) => (
          <article key={`${item.dimension}-${item.objective}`}>
            <span>{item.dimension}</span>
            <strong>{item.objective}</strong>
            <p>{item.evidence}</p>
          </article>
        ))}
      </section>
      <section className="timeline-list">
        {artifact.timeline.map((item, index) => (
          <article key={`${item.phase}-${index}`}>
            <div className="timeline-index">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <div className="timeline-head">
                <strong>{item.phase}</strong>
                <span>{item.duration}</span>
              </div>
              <div className="two-column-list">
                <ListGroup title="教师活动" items={item.teacherActions} />
                <ListGroup title="学生活动" items={item.studentActions} />
              </div>
              <p className="assessment-line">评价：{item.assessment}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="artifact-columns">
        <PreviewBlock title="重难点处理">
          {artifact.keyPoints.map((item) => (
            <FactLine key={`${item.type}-${item.title}`} title={item.title} text={item.strategy} />
          ))}
        </PreviewBlock>
        <PreviewBlock title="板书/课件结构">
          <p>{artifact.blackboardDesign || "暂无。"}</p>
        </PreviewBlock>
      </section>
    </div>
  );
}

type PptxPreviewItem =
  | { kind: "cover" }
  | {
      contentIndex: number;
      kind: "slide";
      slide: SlideOutlineArtifact["slides"][number];
    };

function SlideReviewWorkbench({ artifact }: { artifact: SlideOutlineArtifact }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const previewItems = useMemo<PptxPreviewItem[]>(
    () => [{ kind: "cover" }, ...artifact.slides.map((slide, contentIndex) => ({ contentIndex, kind: "slide" as const, slide }))],
    [artifact.slides]
  );
  const review = useMemo(() => buildSlideDeckReview(artifact), [artifact]);
  const style = resolvePptxStyle(artifact);
  const maxIndex = Math.max(0, previewItems.length - 1);
  const clampedIndex = Math.min(activeIndex, maxIndex);
  const activeItem = previewItems[clampedIndex] || { kind: "cover" };
  const previewStyle = {
    "--ppt-accent": pptColor(style.colors.accent),
    "--ppt-accent-2": pptColor(style.colors.accent2),
    "--ppt-accent-3": pptColor(style.colors.accent3),
    "--ppt-bg": pptColor(style.colors.bg),
    "--ppt-border": pptColor(style.colors.border),
    "--ppt-ink": pptColor(style.colors.ink),
    "--ppt-inverse": pptColor(style.colors.inverse),
    "--ppt-inverse-text": pptColor(style.colors.inverseText),
    "--ppt-muted": pptColor(style.colors.muted),
    "--ppt-surface": pptColor(style.colors.surface),
    "--ppt-surface-alt": pptColor(style.colors.surfaceAlt)
  } as CSSProperties;

  function movePreview(delta: number) {
    setActiveIndex((current) => Math.min(maxIndex, Math.max(0, current + delta)));
  }

  return (
    <section className="slide-review-workbench" style={previewStyle}>
      <div className="slide-review-main">
        <section className={`pptx-preview ${style.dark ? "dark" : ""}`}>
          <div className="pptx-preview-toolbar">
            <div>
              <span>PPTX 预览</span>
              <strong>{style.label}</strong>
            </div>
            <div className="pptx-preview-controls">
              <button
                aria-label="上一页"
                className="icon-button"
                disabled={clampedIndex === 0}
                onClick={() => movePreview(-1)}
                type="button"
              >
                <ChevronLeft size={16} />
              </button>
              <span>{clampedIndex + 1} / {previewItems.length}</span>
              <button
                aria-label="下一页"
                className="icon-button"
                disabled={clampedIndex === maxIndex}
                onClick={() => movePreview(1)}
                type="button"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="pptx-preview-frame">
            {activeItem.kind === "cover" ? (
              <PptxCoverPreview artifact={artifact} />
            ) : (
              <PptxContentPreview
                artifact={artifact}
                contentIndex={activeItem.contentIndex}
                slide={activeItem.slide}
              />
            )}
          </div>
        </section>

        <nav className="pptx-filmstrip" aria-label="课件缩略图导航">
          {previewItems.map((item, index) => {
            const selected = index === clampedIndex;
            const variant =
              item.kind === "cover"
                ? "封面"
                : variantLabel(resolveSlideLayoutVariant(item.slide, item.contentIndex, artifact.slides.length));
            const title = item.kind === "cover" ? artifact.title : item.slide.title;
            return (
              <button
                aria-pressed={selected}
                className={`pptx-thumb ${selected ? "selected" : ""}`}
                key={item.kind === "cover" ? "cover" : `${item.slide.page}-${item.slide.title}`}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <span>{item.kind === "cover" ? "封面" : String(item.slide.page).padStart(2, "0")}</span>
                <strong>{title}</strong>
                <small>{variant}</small>
              </button>
            );
          })}
        </nav>
      </div>

      <aside className="slide-review-panel" aria-label="课件审核">
        <SlideQualityPanel review={review} />
        <SlideActiveDetail
          activeItem={activeItem}
          artifact={artifact}
          contentIndex={activeItem.kind === "slide" ? activeItem.contentIndex : undefined}
        />
      </aside>
    </section>
  );
}

function SlideQualityPanel({ review }: { review: SlideDeckReview }) {
  return (
    <section className={`slide-review-card ${review.status}`}>
      <div className="slide-review-card-head">
        <div>
          <span>质量体检</span>
          <strong>{review.status === "ready" ? "可直接预览导出" : "建议补强后导出"}</strong>
        </div>
        <em>{review.readyCount}/{review.totalCount}</em>
      </div>
      <div className="slide-review-metrics">
        <span>{review.pageCount} 页</span>
        <span>{review.variantCount} 种版式</span>
        <span>{review.warnings.length ? `${review.warnings.length} 项提醒` : "全部通过"}</span>
      </div>
      <ul className="slide-review-checks">
        {review.checks.map((check) => (
          <li className={check.status} key={check.id}>
            <div>
              <strong>{check.label}</strong>
              <small>{check.target}</small>
            </div>
            <span>{check.value}</span>
            <p>{check.detail}</p>
            {check.slidePages.length ? <em>{formatSlidePages(check.slidePages)}</em> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SlideActiveDetail({
  activeItem,
  artifact,
  contentIndex
}: {
  activeItem: PptxPreviewItem;
  artifact: SlideOutlineArtifact;
  contentIndex?: number;
}) {
  if (activeItem.kind === "cover") {
    return (
      <section className="slide-review-card slide-page-detail">
        <div className="slide-review-card-head">
          <div>
            <span>当前页详情</span>
            <strong>封面与课件结构</strong>
          </div>
        </div>
        <dl>
          <div>
            <dt>课件主题</dt>
            <dd>{artifact.theme || artifact.title}</dd>
          </div>
          <div>
            <dt>风格 preset</dt>
            <dd>{artifact.stylePreset || "course-module"}</dd>
          </div>
          <div>
            <dt>页面结构</dt>
            <dd>{artifact.slides.slice(0, 6).map((slide) => slide.title).join(" / ")}</dd>
          </div>
        </dl>
      </section>
    );
  }

  const slide = activeItem.slide;
  const variant = variantLabel(
    resolveSlideLayoutVariant(slide, contentIndex || 0, artifact.slides.length)
  );

  return (
    <section className="slide-review-card slide-page-detail">
      <div className="slide-review-card-head">
        <div>
          <span>当前页详情</span>
          <strong>{String(slide.page).padStart(2, "0")} · {variant}</strong>
        </div>
      </div>
      <dl>
        <div>
          <dt>讲解正文</dt>
          <dd>{limitText(slide.detail || slide.visualSuggestion || "暂无讲解正文。", 140)}</dd>
        </div>
        <div>
          <dt>案例/例子</dt>
          <dd>{slide.examples?.length ? slide.examples.slice(0, 3).join(" / ") : "暂无案例。"}</dd>
        </div>
        <div>
          <dt>互动提示</dt>
          <dd>{slide.interactionPrompt || "暂无互动提示。"}</dd>
        </div>
        <div>
          <dt>教师备注</dt>
          <dd>{limitText(slide.teacherNotes || "暂无教师备注。", 120)}</dd>
        </div>
        <div>
          <dt>讲稿摘要</dt>
          <dd>{limitText(slide.teacherScript || "暂无讲稿备注。", 160)}</dd>
        </div>
      </dl>
    </section>
  );
}

function PptxCoverPreview({ artifact }: { artifact: SlideOutlineArtifact }) {
  return (
    <article className="pptx-slide-preview pptx-cover-preview">
      <div className="pptx-cover-kicker">{artifact.stylePreset || "course-module"}</div>
      <h4>{artifact.title}</h4>
      <p>{artifact.theme || "结构化课件 · 可导出 PPTX"}</p>
      <div className="pptx-cover-line" />
      <aside>
        <strong>课件结构</strong>
        <ol>
          {artifact.slides.slice(0, 8).map((slide) => (
            <li key={`${slide.page}-${slide.title}`}>{slide.title}</li>
          ))}
        </ol>
      </aside>
    </article>
  );
}

function PptxContentPreview({
  artifact,
  contentIndex,
  slide
}: {
  artifact: SlideOutlineArtifact;
  contentIndex: number;
  slide: SlideOutlineArtifact["slides"][number];
}) {
  const variant = resolveSlideLayoutVariant(slide, contentIndex, artifact.slides.length);
  const examples = slide.examples?.filter(Boolean).slice(0, 3) || [];
  const detail = slide.detail || slide.visualSuggestion || "结合课堂反馈补充讲解。";
  const points = slide.points.length ? slide.points : [detail];
  const [leftPoints, rightPoints] = splitPreviewPoints(points);

  return (
    <article className={`pptx-slide-preview pptx-content-preview variant-${variant}`}>
      <header>
        <span>{String(slide.page).padStart(2, "0")}</span>
        <small>{variantLabel(variant)}</small>
      </header>
      <h4>{slide.title}</h4>

      {variant === "case-card" ? (
        <div className="pptx-case-layout">
          <section>
            <strong>课堂案例</strong>
            <p>{detail}</p>
            <PptxExamplePills examples={examples} />
          </section>
          <aside>
            <strong>追问</strong>
            <p>{slide.interactionPrompt || "请学生先给出判断，再说明依据。"}</p>
          </aside>
        </div>
      ) : null}

      {variant === "objectives" ? (
        <div className="pptx-objectives-layout">
          <section>
            <strong>学习目标</strong>
            <p>{detail}</p>
          </section>
          <PptxPointList points={points.slice(0, 5)} numbered />
        </div>
      ) : null}

      {variant === "two-column" ? (
        <div className="pptx-two-column-layout">
          <section>
            <strong>关键理解</strong>
            <PptxPointList points={leftPoints} />
          </section>
          <section>
            <strong>案例/迁移</strong>
            <PptxPointList points={examples.length ? examples : rightPoints} />
          </section>
          <p>{detail}</p>
        </div>
      ) : null}

      {variant === "process" ? (
        <div className="pptx-process-layout">
          {points.slice(0, 5).map((point, index) => (
            <section key={point}>
              <small>STEP {index + 1}</small>
              <p>{point}</p>
            </section>
          ))}
          <p>{detail}</p>
        </div>
      ) : null}

      {variant === "matrix" ? (
        <div className="pptx-matrix-layout">
          {points.slice(0, 4).map((point, index) => (
            <section key={point}>
              <small>{["A", "B", "C", "D"][index]}</small>
              <p>{point}</p>
            </section>
          ))}
          <p>{detail}</p>
        </div>
      ) : null}

      {variant === "activity" ? (
        <div className="pptx-activity-layout">
          <section>
            <strong>课堂活动脚本</strong>
            <PptxPointList points={points.slice(0, 5)} />
          </section>
          <aside>
            <strong>即时互动</strong>
            <p>{slide.interactionPrompt || detail}</p>
            <PptxExamplePills examples={examples.slice(0, 2)} />
          </aside>
        </div>
      ) : null}

      {variant === "summary" ? (
        <div className="pptx-summary-layout">
          <section>
            <PptxPointList points={points.slice(0, 4)} numbered />
            <p>{detail}</p>
          </section>
          <aside>
            <strong>课后延伸</strong>
            <PptxPointList points={artifact.extensionTasks.slice(0, 3)} />
          </aside>
        </div>
      ) : null}

      {variant === "card-list" || variant === "cover" ? (
        <div className="pptx-card-list-layout">
          {points.slice(0, 4).map((point, index) => (
            <section key={point}>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <p>{point}</p>
            </section>
          ))}
          <p>{detail}</p>
        </div>
      ) : null}
    </article>
  );
}

function PptxPointList({ numbered = false, points }: { numbered?: boolean; points: string[] }) {
  const items = points.length ? points : ["结合本页主题补充课堂要点"];
  return (
    <ol className={numbered ? "numbered" : undefined}>
      {items.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ol>
  );
}

function PptxExamplePills({ examples }: { examples: string[] }) {
  if (!examples.length) return null;
  return (
    <div className="pptx-example-pills">
      {examples.map((example) => (
        <span key={example}>{example}</span>
      ))}
    </div>
  );
}

function pptColor(color: string) {
  return `#${color}`;
}

function formatSlidePages(pages: number[]) {
  return `P${pages.slice(0, 6).join(" / P")}${pages.length > 6 ? " ..." : ""}`;
}

function limitText(value: string, maxLength: number) {
  const characters = Array.from(value.trim());
  if (characters.length <= maxLength) return value;
  return `${characters.slice(0, maxLength).join("")}...`;
}

function splitPreviewPoints(points: string[]) {
  const midpoint = Math.max(1, Math.ceil(points.length / 2));
  return [points.slice(0, midpoint), points.slice(midpoint)] as const;
}

function variantLabel(variant: ReturnType<typeof resolveSlideLayoutVariant>) {
  const labels: Record<ReturnType<typeof resolveSlideLayoutVariant>, string> = {
    activity: "课堂活动",
    "card-list": "卡片列表",
    "case-card": "案例追问",
    cover: "封面",
    matrix: "矩阵拆解",
    objectives: "学习目标",
    process: "流程步骤",
    summary: "总结迁移",
    "two-column": "双栏对比"
  };
  return labels[variant];
}

function SlideOutlinePreview({ artifact }: { artifact: SlideOutlineArtifact }) {
  const contentDirection = artifact.contentDirection
    ? getSlideContentDirectionOption(artifact.contentDirection)
    : undefined;
  const stylePreset = artifact.stylePreset
    ? getSlideStylePresetOption(artifact.stylePreset)
    : undefined;

  return (
    <div className="artifact-view">
      <SlideReviewWorkbench artifact={artifact} />
      <details className="slide-outline-details">
        <summary>
          <span>
            <strong>完整页纲与讲稿</strong>
            <small>{artifact.slides.length} 页 · 可展开查看全部正文、备注和延伸任务</small>
          </span>
        </summary>
        <section className="preview-hero slide-hero">
          <p>{artifact.theme || "课件大纲"}</p>
          <h3>{artifact.title}</h3>
          {contentDirection || stylePreset ? (
            <div className="slide-hero-tags">
              {contentDirection ? <span>{contentDirection.label}</span> : null}
              {stylePreset ? <span>{stylePreset.label}</span> : null}
            </div>
          ) : null}
        </section>
        <section className="slide-board">
          {artifact.slides.map((slide) => (
            <article className="slide-card" key={`${slide.page}-${slide.title}`}>
              <div className="slide-canvas">
                <span>{String(slide.page).padStart(2, "0")}</span>
                <strong>{slide.title}</strong>
                <ul>
                  {slide.points.slice(0, 5).map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                {slide.detail ? <p className="slide-detail">{slide.detail}</p> : null}
                {slide.examples?.length ? (
                  <div className="slide-examples">
                    {slide.examples.slice(0, 3).map((example) => (
                      <span key={example}>{example}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="slide-meta">
                <p>{slide.layout}</p>
                <small>{slide.visualSuggestion}</small>
                <em>{slide.interactionPrompt}</em>
                {slide.teacherNotes ? <span>{slide.teacherNotes}</span> : null}
                {slide.teacherScript ? <strong>讲稿：{slide.teacherScript}</strong> : null}
              </div>
            </article>
          ))}
        </section>
        <section className="artifact-columns">
          <PreviewBlock title="过渡语">
            <ul>
              {artifact.transitionLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </PreviewBlock>
          <PreviewBlock title="课后延伸">
            <ul>
              {artifact.extensionTasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          </PreviewBlock>
        </section>
      </details>
    </div>
  );
}

function QuizPreview({ artifact }: { artifact: QuizBuilderArtifact }) {
  const [paperView, setPaperView] = useState<"student" | "teacher">("student");
  const review = buildQuizReview(artifact);
  const summary = artifact.reviewSummary;
  const estimatedMinutes = summary?.estimatedMinutes || review.estimatedMinutes;
  const coverageStatus =
    summary?.coverageStatus ||
    (review.status === "ready" ? "覆盖核心知识点，可直接使用" : "存在质量提醒，建议教师复核");

  return (
    <div className="artifact-view quiz-workbench">
      <section className="preview-hero quiz-hero">
        <p>试题组卷</p>
        <h3>{artifact.title}</h3>
      </section>
      <section className={`quiz-review-card ${review.status}`}>
        <div className="quiz-review-head">
          <div>
            <span>试卷体检</span>
            <strong>{review.status === "ready" ? "可直接使用" : "需教师复核"}</strong>
          </div>
          <em>{review.warnings.length ? `${review.warnings.length} 项提醒` : "全部通过"}</em>
        </div>
        <div className="quiz-stat-grid" aria-label="试卷摘要">
          <span>
            <strong>{summary?.totalQuestions || review.totalQuestions}</strong>
            题
          </span>
          <span>
            <strong>{summary?.totalScore || review.totalScore}</strong>
            分
          </span>
          <span>
            <strong>{estimatedMinutes || "-"}</strong>
            分钟
          </span>
          <span>
            <strong>{review.coverageCount || "-"}</strong>
            覆盖点
          </span>
        </div>
        <p>{coverageStatus}</p>
        <ul className="quiz-review-checks">
          {review.items.map((item) => (
            <li className={item.passed ? "ready" : item.severity} key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.passed ? "通过" : "提醒"}</span>
              <small>{item.target}</small>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="table-preview">
        <table>
          <thead>
            <tr>
              <th>题型</th>
              <th>数量</th>
              <th>分值</th>
              <th>难度</th>
            </tr>
          </thead>
          <tbody>
            {artifact.blueprint.map((item) => (
              <tr key={`${item.questionType}-${item.difficulty}`}>
                <td>{item.questionType}</td>
                <td>{item.count}</td>
                <td>{item.score}</td>
                <td>{item.difficulty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {artifact.coverageMatrix?.length ? (
        <section className="table-preview coverage-table">
          <table>
            <thead>
              <tr>
                <th>知识点</th>
                <th>测评目标</th>
                <th>题号</th>
                <th>难度</th>
              </tr>
            </thead>
            <tbody>
              {artifact.coverageMatrix.map((item) => (
                <tr key={`${item.knowledgePoint}-${item.questionIds.join("-")}`}>
                  <td>{item.knowledgePoint}</td>
                  <td>{item.objective}</td>
                  <td>{item.questionIds.join(" / ")}</td>
                  <td>{item.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section className="quiz-section">
        <div className="quiz-section-head">
          <span>试卷</span>
          <strong>{paperView === "student" ? "学生卷 · 作答区" : "教师卷 · 答案与解析"}</strong>
        </div>
        <div className="paper-toggle" role="tablist" aria-label="切换试卷视图">
          <button
            className={paperView === "student" ? "selected" : ""}
            type="button"
            role="tab"
            aria-selected={paperView === "student"}
            onClick={() => setPaperView("student")}
          >
            学生卷
          </button>
          <button
            className={paperView === "teacher" ? "selected" : ""}
            type="button"
            role="tab"
            aria-selected={paperView === "teacher"}
            onClick={() => setPaperView("teacher")}
          >
            教师卷
          </button>
        </div>
        {paperView === "student" ? (
          <div className="question-list">
            {artifact.questions.map((question) => (
              <article key={question.id}>
                <div className="question-head">
                  <strong>{question.id}</strong>
                  <span>{question.type}</span>
                  <small>{question.score} 分</small>
                </div>
                <div className="question-meta-row">
                  {question.knowledgePoint ? <span>{question.knowledgePoint}</span> : null}
                  {question.difficulty ? <span>{question.difficulty}</span> : null}
                  {question.cognitiveLevel ? <span>{question.cognitiveLevel}</span> : null}
                  {question.estimatedMinutes ? <span>{question.estimatedMinutes} 分钟</span> : null}
                </div>
                <p>{question.stem}</p>
                {question.options.length ? (
                  <ul>
                    {question.options.map((option) => (
                      <li key={option}>{option}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="question-list">
            {artifact.questions.map((question) => (
              <article key={`${question.id}-answer`}>
                <div className="question-head">
                  <strong>{question.id}</strong>
                  <span>{question.type}</span>
                  <small>{question.diagnosticTag || "诊断标签待补充"}</small>
                </div>
                <p>答案：{question.answer || "暂无参考答案。"}</p>
                <p>解析：{question.analysis || "暂无解析。"}</p>
                <ul>
                  {(question.scoringPoints.length ? question.scoringPoints : ["教师复核后补充评分点。"]).map(
                    (point) => (
                      <li key={point}>{point}</li>
                    )
                  )}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
      <PreviewBlock title="教学诊断建议">
        <ul>
          {artifact.diagnosisSuggestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PreviewBlock>
    </div>
  );
}

function HomeworkPreview({ artifact }: { artifact: HomeworkFeedbackArtifact }) {
  const review = buildHomeworkFeedbackReview(artifact);
  const assignmentContext = artifact.assignmentContext;
  const diagnosticSummary = artifact.diagnosticSummary;
  const groupedFeedback = artifact.groupedFeedback || [];
  const teacherActionChecklist = artifact.teacherActionChecklist || [];
  const hasAssignmentContext = Boolean(
    assignmentContext?.taskDescription ||
      assignmentContext?.expectedEvidence.length ||
      assignmentContext?.feedbackFocus.length
  );
  const hasDiagnosticSummary = Boolean(
    diagnosticSummary?.overallLevel ||
      diagnosticSummary?.classStrengths.length ||
      diagnosticSummary?.commonMisconceptions.length ||
      diagnosticSummary?.nextLessonFocus.length
  );

  return (
    <div className="artifact-view feedback-workbench">
      <section className="preview-hero feedback-hero">
        <p>作业反馈</p>
        <h3>{artifact.title}</h3>
      </section>
      <section className={`quiz-review-card feedback-review-card ${review.status}`}>
        <div className="quiz-review-head">
          <div>
            <span>反馈体检</span>
            <strong>{review.status === "ready" ? "可用于班级讲评" : "建议补强后使用"}</strong>
          </div>
          <em>{review.warnings.length ? `${review.warnings.length} 项提醒` : "全部通过"}</em>
        </div>
        <div className="quiz-stat-grid feedback-stat-grid" aria-label="反馈摘要">
          <span>
            <strong>{review.metrics.rubricDimensions}</strong>
            量规维度
          </span>
          <span>
            <strong>{review.metrics.phraseCount}</strong>
            反馈语
          </span>
          <span>
            <strong>{review.metrics.groupCount || "-"}</strong>
            分层组
          </span>
          <span>
            <strong>{review.metrics.actionCount || "-"}</strong>
            行动项
          </span>
        </div>
        <p>
          {review.status === "ready"
            ? "已覆盖作业情境、班级诊断、分层反馈和合规提醒。"
            : "当前反馈仍缺少闭环要素，教师使用前建议先复核。"}
        </p>
        <ul className="quiz-review-checks">
          {review.items.map((item) => (
            <li className={item.passed ? "ready" : item.severity} key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.passed ? "通过" : "提醒"}</span>
              <small>{item.target}</small>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
      {hasAssignmentContext && assignmentContext ? (
        <PreviewBlock title="作业情境">
          <FactLine title="任务要求" text={assignmentContext.taskDescription} />
          <div className="two-column-list feedback-context-lists">
            <ListGroup title="评价证据" items={assignmentContext.expectedEvidence} />
            <ListGroup title="反馈关注点" items={assignmentContext.feedbackFocus} />
          </div>
        </PreviewBlock>
      ) : null}
      <section className="table-preview rubric-table">
        <table>
          <thead>
            <tr>
              <th>维度</th>
              <th>优秀</th>
              <th>合格</th>
              <th>待改进</th>
            </tr>
          </thead>
          <tbody>
            {artifact.rubric.map((item) => (
              <tr key={item.dimension}>
                <td>{item.dimension}</td>
                <td>{item.excellent}</td>
                <td>{item.qualified}</td>
                <td>{item.needsImprovement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {hasDiagnosticSummary && diagnosticSummary ? (
        <PreviewBlock title="班级诊断摘要">
          <FactLine title="整体水平" text={diagnosticSummary.overallLevel} />
          <div className="two-column-list feedback-diagnosis-lists">
            <ListGroup title="班级优势" items={diagnosticSummary.classStrengths} />
            <ListGroup title="共性误区" items={diagnosticSummary.commonMisconceptions} />
            <ListGroup title="下一课重点" items={diagnosticSummary.nextLessonFocus} />
          </div>
        </PreviewBlock>
      ) : null}
      <section className="phrase-grid">
        {artifact.feedbackPhrases.map((item) => (
          <article key={`${item.scenario}-${item.phrase}`}>
            <span>{item.scenario}</span>
            <p>{item.phrase}</p>
          </article>
        ))}
      </section>
      {groupedFeedback.length ? (
        <section className="feedback-group-section" aria-label="分层反馈建议">
          <h4>分层反馈建议</h4>
          <div className="feedback-group-grid">
            {groupedFeedback.map((item) => (
              <article key={`${item.group}-${item.evidencePattern}`}>
                <span>{item.group}</span>
                <FactLine title="证据表现" text={item.evidencePattern} />
                <FactLine title="教师反馈" text={item.teacherFeedback} />
                <FactLine title="下一步任务" text={item.nextStep} />
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="artifact-columns">
        <PreviewBlock title="改进建议">
          <BulletList items={artifact.improvementSuggestions} />
        </PreviewBlock>
        <PreviewBlock title="教师行动清单">
          <BulletList items={teacherActionChecklist} />
        </PreviewBlock>
      </section>
      <section className="artifact-columns">
        <PreviewBlock title="班级共性问题">
          <BulletList items={artifact.classIssues} />
        </PreviewBlock>
        <PreviewBlock title="合规提醒">
          <BulletList items={artifact.complianceNotes} />
        </PreviewBlock>
      </section>
    </div>
  );
}

function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="preview-block">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function FactLine({ title, text }: { title: string; text: string }) {
  return (
    <article className="fact-line">
      <strong>{title || "未命名"}</strong>
      <p>{text || "暂无说明。"}</p>
    </article>
  );
}

function ListGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <span>{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (!normalized.length) return <p>暂无说明。</p>;

  return (
    <ul>
      {normalized.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
