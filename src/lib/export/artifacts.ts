import JSZip from "jszip";
import type PptxGenJS from "pptxgenjs";
import { agentModules } from "@/lib/agent/modules";
import { getResultMarkdown } from "@/lib/agent/results";
import {
  buildHomeworkFeedbackDocxBlob,
  buildLessonPlanDocxBlob,
  buildQuizStudentDocxBlob,
  buildQuizTeacherDocxBlob
} from "@/lib/export/docx";
import { safeFilename } from "@/lib/export/markdown";
import {
  resolvePptxStyle,
  resolveSlideLayoutVariant,
  type PptxStyle
} from "@/lib/export/pptx-style";
import type {
  CourseProfile,
  KnowledgeMapArtifact,
  ModuleId,
  ModuleOutputs,
  ModuleResult,
  SlideOutlineArtifact
} from "@/types/agent";

export interface ArtifactFile {
  filename: string;
  blob: Blob;
}

const pptxMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const slideWidth = 13.333;
const slideHeight = 7.5;

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;
type SlideData = SlideOutlineArtifact["slides"][number];

export async function buildModuleExportFiles(
  courseProfile: CourseProfile,
  moduleId: ModuleId,
  result: ModuleResult
): Promise<ArtifactFile[]> {
  const base = `${safeFilename(courseProfile.courseName || "高校备课助手")}-${moduleLabel(moduleId)}`;
  const artifact = result.artifact;

  if (!artifact) {
    return [
      {
        filename: `${base}-fallback.md`,
        blob: new Blob([getResultMarkdown(result) || result.rawText || "暂无生成内容。"], {
          type: "text/markdown;charset=utf-8"
        })
      }
    ];
  }

  switch (artifact.moduleId) {
    case "knowledge-map": {
      const svg = buildKnowledgeSvg(artifact);
      return [
        {
          filename: `${base}.svg`,
          blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
        },
        {
          filename: `${base}.html`,
          blob: new Blob([buildKnowledgeHtml(artifact, svg)], {
            type: "text/html;charset=utf-8"
          })
        }
      ];
    }
    case "lesson-plan":
      return [
        {
          filename: `${base}.docx`,
          blob: await buildLessonPlanDocxBlob(courseProfile, artifact)
        }
      ];
    case "slide-outline":
      return [
        {
          filename: `${base}.pptx`,
          blob: await buildSlidePptxBlob(courseProfile, artifact)
        }
      ];
    case "quiz-builder":
      return [
        {
          filename: `${base}-学生卷.docx`,
          blob: await buildQuizStudentDocxBlob(courseProfile, artifact)
        },
        {
          filename: `${base}-教师用卷.docx`,
          blob: await buildQuizTeacherDocxBlob(courseProfile, artifact)
        }
      ];
    case "homework-feedback":
      return [
        {
          filename: `${base}.docx`,
          blob: await buildHomeworkFeedbackDocxBlob(courseProfile, artifact)
        }
      ];
  }
}

export async function buildArtifactPackageZip(
  courseProfile: CourseProfile,
  outputs: ModuleOutputs
) {
  const zip = new JSZip();

  for (const agentModule of agentModules) {
    const result = outputs[agentModule.id];
    if (!result) continue;

    const files = await buildModuleExportFiles(courseProfile, agentModule.id, result);
    for (const file of files) {
      zip.file(file.filename, await file.blob.arrayBuffer());
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export function buildKnowledgeSvg(artifact: KnowledgeMapArtifact) {
  const layout = layoutKnowledgeGraph(artifact);
  const { height, width } = layout;

  const edgeMarkup = buildKnowledgeEdgeMarkup(artifact.edges, layout);

  const laneMarkup = layout.lanes
    .map(
      (lane) =>
        `<g class="graph-ring" transform="translate(${lane.x} 0)">
  <rect x="-112" y="${layout.graphTop - 28}" width="224" height="${layout.graphHeight + 56}" rx="18" />
  <text x="0" y="${layout.graphTop - 42}">${escapeXml(lane.title)}</text>
</g>`
    )
    .join("\n");

  const nodeMarkup = layout.nodes
    .map((nodeLayout) => {
      const { node, position } = nodeLayout;
      const labelLines = wrapSvgText(node.label, nodeLayout.isRoot ? 12 : 10).slice(0, 2);
      const relationCount = layout.relationCount.get(node.id) || 0;
      return `<g class="node ${nodeLayout.isRoot ? "root" : `level-${position.column}`}" transform="translate(${position.x} ${position.y})">
  <title>${escapeXml(`${node.label}：${node.summary}`)}</title>
  <rect class="node-shell" x="${-position.width / 2}" y="${-position.height / 2}" width="${position.width}" height="${position.height}" rx="14" />
  <rect class="level-badge" x="${-position.width / 2 + 12}" y="${-position.height / 2 + 12}" width="30" height="24" rx="9" />
  <text class="level-text" x="${-position.width / 2 + 27}" y="${-position.height / 2 + 29}">L${Math.max(
        1,
        Math.round(node.level || 1)
      )}</text>
  <text class="node-title" x="${-position.width / 2 + 52}" y="${labelLines.length > 1 ? -11 : -4}">
  ${labelLines
    .map(
      (line, lineIndex) =>
        `<tspan x="${-position.width / 2 + 52}" dy="${lineIndex === 0 ? 0 : 16}">${escapeXml(line)}</tspan>`
    )
    .join("\n    ")}
  </text>
  <text class="node-meta" x="${-position.width / 2 + 52}" y="${position.height / 2 - 15}">${relationCount} 关系</text>
</g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
    artifact.title
  )}">
<style>
  svg { background: #f7f8fa; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  .title { fill: #244a80; font-size: 30px; font-weight: 950; }
  .subtitle { fill: #566274; font-size: 13px; font-weight: 800; }
  .metric { fill: #2d5b9a; font-size: 12px; font-weight: 950; }
  .graph-ring rect { fill: rgba(232, 239, 249, .24); stroke: #dde3ec; stroke-width: 1; stroke-dasharray: 4 10; }
  .graph-ring text { fill: #7a869a; font-size: 11px; font-weight: 950; text-anchor: middle; }
  .edge-halo { fill: none; stroke: #f7f8fa; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-opacity: .9; }
  .edge-context,
  .edge-skeleton { fill: none; stroke-linecap: round; stroke-linejoin: round; marker-end: url(#arrow-soft); }
  .edge-context { stroke: #9aaac4; stroke-width: 1.15; stroke-opacity: .28; }
  .edge-skeleton { stroke: #2d5b9a; stroke-width: 2.05; stroke-opacity: .7; marker-end: url(#arrow); }
  .node-shell { fill: #ffffff; stroke: #c7d8ef; stroke-width: 1.7; filter: drop-shadow(0 12px 24px rgba(16,24,40,.10)); }
  .node.root .node-shell { fill: #2d5b9a; stroke: #244a80; filter: drop-shadow(0 16px 32px rgba(16,24,40,.18)); }
  .level-badge { fill: #e8eff9; }
  .node.root .level-badge { fill: #e8eff9; }
  .level-text { fill: #2d5b9a; font-size: 11px; font-weight: 950; text-anchor: middle; }
  .node-title { fill: #1b2330; font-size: 13px; font-weight: 950; }
  .node-meta { fill: #7a869a; font-size: 11px; font-weight: 850; }
  .node.root .node-title { fill: #ffffff; font-size: 15px; }
  .node.root .node-meta { fill: #d7e6f7; }
</style>
<defs>
  <pattern id="graph-grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dde3ec" stroke-width="1" stroke-opacity=".44" />
  </pattern>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M 0 0 L 8 4 L 0 8 z" fill="#9aaac4" fill-opacity=".58" />
  </marker>
  <marker id="arrow-soft" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M 0 0 L 8 4 L 0 8 z" fill="#2d5b9a" fill-opacity=".32" />
  </marker>
</defs>
<rect width="${width}" height="${height}" rx="24" fill="#f7f8fa" />
<rect width="${width}" height="${height}" rx="24" fill="url(#graph-grid)" />
<text class="title" x="46" y="56">${escapeXml(artifact.title)}</text>
<text class="subtitle" x="46" y="82">节点表示知识实体，线条表示关系；完整说明见下方关系索引与节点库</text>
<text class="metric" x="${width - 190}" y="56">${artifact.nodes.length} 个节点 / ${artifact.edges.length} 条关系</text>
${laneMarkup}
${edgeMarkup}
${nodeMarkup}
</svg>`;
}

type KnowledgeNode = KnowledgeMapArtifact["nodes"][number];

interface KnowledgeNodePosition {
  column: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

function layoutKnowledgeGraph(artifact: KnowledgeMapArtifact) {
  const nodes = artifact.nodes;
  const grouped = new Map<number, KnowledgeNode[]>();
  const ranks = new Map<string, number>();
  const positions = new Map<string, KnowledgeNodePosition>();
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const root = nodes[0];

  nodes.forEach((node, index) => {
    const levelRank = Math.max(1, Math.round(node.level || 2) - 1);
    ranks.set(node.id, index === 0 ? 0 : levelRank);
  });

  const maxAllowedRank = Math.max(4, Math.min(8, Math.max(...nodes.map((node) => node.level || 1)) + 2));
  for (let iteration = 0; iteration < nodes.length; iteration += 1) {
    artifact.edges.forEach((edge) => {
      if (edge.source === edge.target || edge.target === root?.id) return;
      const sourceRank = ranks.get(edge.source);
      const targetRank = ranks.get(edge.target);
      if (sourceRank === undefined || targetRank === undefined) return;
      if (targetRank < sourceRank) {
        ranks.set(edge.target, Math.min(maxAllowedRank, sourceRank + 1));
      }
    });
  }

  nodes.forEach((node) => {
    const rank = ranks.get(node.id) || 0;
    grouped.set(rank, [...(grouped.get(rank) || []), node]);
  });

  const orderScore = new Map(nodes.map((node, index) => [node.id, index]));
  for (let iteration = 0; iteration < 6; iteration += 1) {
    Array.from(grouped.keys())
      .sort((a, b) => a - b)
      .forEach((rank) => {
        const columnNodes = grouped.get(rank) || [];
        columnNodes.sort((a, b) => {
          const aScore = connectedOrderScore(a.id, artifact, ranks, orderScore, originalOrder);
          const bScore = connectedOrderScore(b.id, artifact, ranks, orderScore, originalOrder);
          return aScore - bScore;
        });
        columnNodes.forEach((node, index) => {
          orderScore.set(node.id, rank * 100 + index);
        });
      });
  }

  const relationCount = new Map<string, number>();
  artifact.edges.forEach((edge) => {
    relationCount.set(edge.source, (relationCount.get(edge.source) || 0) + 1);
    relationCount.set(edge.target, (relationCount.get(edge.target) || 0) + 1);
  });

  const columnGap = 258;
  const left = 154;
  const graphTop = 154;
  const graphBottomPadding = 76;
  const maxRank = Math.max(...Array.from(grouped.keys()), 0);
  const width = Math.max(1280, left + maxRank * columnGap + 300);
  const columnHeights = Array.from(grouped.values()).map((columnNodes) =>
    columnNodes.reduce((total, node, index) => {
      const size = nodeBubbleSize(node.label, node.id === root?.id);
      return total + size.height + (index > 0 ? 34 : 0);
    }, 0)
  );
  const graphHeight = Math.max(470, Math.max(...columnHeights, 0) + 68);
  const height = Math.max(720, graphTop + graphHeight + graphBottomPadding);
  const graphCenterY = graphTop + graphHeight / 2;
  const nodeLayouts: Array<{
    isRoot: boolean;
    node: KnowledgeNode;
    position: KnowledgeNodePosition;
  }> = [];

  Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([rank, columnNodes]) => {
      const columnHeight = columnNodes.reduce((total, node, index) => {
        const size = nodeBubbleSize(node.label, node.id === root?.id);
        return total + size.height + (index > 0 ? 34 : 0);
      }, 0);
      let y = graphCenterY - columnHeight / 2;

      columnNodes.forEach((node) => {
        const size = nodeBubbleSize(node.label, node.id === root?.id);
        const position = {
          column: rank,
          height: size.height,
          width: size.width,
          x: left + rank * columnGap,
          y: Math.round(y + size.height / 2)
        };
        positions.set(node.id, position);
        nodeLayouts.push({ isRoot: node.id === root?.id, node, position });
        y += size.height + 34;
      });
    });

  return {
    graphHeight,
    graphTop,
    height,
    lanes: Array.from(grouped.keys())
      .sort((a, b) => a - b)
      .map((rank) => ({
        title: knowledgeColumnTitle(rank),
        x: left + rank * columnGap
      })),
    nodes: nodeLayouts,
    positions,
    relationCount,
    width
  };
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

function nodeBubbleSize(label: string, root: boolean) {
  const width = root ? 222 : Math.min(214, Math.max(174, visualLength(label) * 12 + 56));
  const height = root ? 82 : visualLength(label) > 8 ? 76 : 68;
  return { height, width };
}

function buildForwardPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  edgeIndex: number,
  isSkeleton: boolean
) {
  const dx = targetX - sourceX;
  const bend = (isSkeleton ? 8 : 16) * (((edgeIndex % 5) - 2) / 2);
  const midX = sourceX + dx / 2;
  return `M ${Math.round(sourceX)} ${Math.round(sourceY)} C ${Math.round(midX)} ${Math.round(
    sourceY + bend
  )}, ${Math.round(midX)} ${Math.round(targetY + bend)}, ${Math.round(targetX)} ${Math.round(targetY)}`;
}

function buildLoopPath(sourceX: number, sourceY: number, targetX: number, targetY: number, edgeIndex: number) {
  const loopX = Math.max(sourceX, targetX) + 70 + (edgeIndex % 4) * 18;
  return `M ${Math.round(sourceX)} ${Math.round(sourceY)} C ${Math.round(loopX)} ${Math.round(
    sourceY
  )}, ${Math.round(loopX)} ${Math.round(targetY)}, ${Math.round(targetX)} ${Math.round(targetY)}`;
}

function knowledgeColumnTitle(rank: number) {
  if (rank === 0) return "核心概念";
  if (rank === 1) return "直接支撑";
  if (rank === 2) return "方法与规则";
  if (rank === 3) return "拓展关联";
  return `第 ${rank + 1} 层`;
}

function buildKnowledgeEdgeMarkup(
  edges: KnowledgeMapArtifact["edges"],
  layout: ReturnType<typeof layoutKnowledgeGraph>
) {
  const visibleEdges = edges
    .map((edge, index) => ({ edge, index }))
    .filter(
      (item) => layout.positions.has(item.edge.source) && layout.positions.has(item.edge.target)
    );
  const rootNode = layout.nodes.find((node) => node.isRoot);
  const rootId = rootNode?.node.id;
  const skeletonEdges = selectKnowledgeSkeletonEdges(visibleEdges, layout.positions, rootId);
  const skeletonKeys = new Set(skeletonEdges.map((item) => knowledgeEdgeKey(item.edge)));
  const contextEdges = visibleEdges.filter((item) => !skeletonKeys.has(knowledgeEdgeKey(item.edge)));

  return [...contextEdges, ...skeletonEdges]
    .map((item) =>
      buildGraphEdge(item.edge, layout.positions, item.index, skeletonKeys.has(knowledgeEdgeKey(item.edge)))
    )
    .join("\n");
}

function knowledgeEdgeKey(edge: KnowledgeMapArtifact["edges"][number]) {
  return `${edge.source}->${edge.target}->${edge.label}`;
}

function selectKnowledgeSkeletonEdges(
  edges: Array<{ edge: KnowledgeMapArtifact["edges"][number]; index: number }>,
  positions: Map<string, KnowledgeNodePosition>,
  rootId?: string
) {
  const selected = new Map<string, { edge: KnowledgeMapArtifact["edges"][number]; index: number }>();
  const add = (item: { edge: KnowledgeMapArtifact["edges"][number]; index: number }) => {
    selected.set(`${item.edge.source}->${item.edge.target}->${item.edge.label}`, item);
  };

  edges
    .filter((item) => {
      const target = positions.get(item.edge.target);
      return item.edge.source === rootId && target?.column === 1;
    })
    .forEach(add);

  const nodeIds = Array.from(positions.keys()).filter((nodeId) => nodeId !== rootId);
  nodeIds.forEach((nodeId) => {
    if (Array.from(selected.values()).some((item) => item.edge.target === nodeId)) return;

    const preferredIncoming = edges.filter((item) => {
      const source = positions.get(item.edge.source);
      const target = positions.get(item.edge.target);
      return item.edge.target === nodeId && !!source && !!target && source.column < target.column;
    });
    const fallbackEdges = edges.filter((item) => item.edge.target === nodeId || item.edge.source === nodeId);
    const candidates = (preferredIncoming.length ? preferredIncoming : fallbackEdges)
      .sort((a, b) => edgeReadabilityScore(a.edge, nodeId, positions) - edgeReadabilityScore(b.edge, nodeId, positions));
    const candidate = candidates[0];
    if (candidate) add(candidate);
  });

  return Array.from(selected.values()).sort((a, b) => a.index - b.index);
}

function edgeReadabilityScore(
  edge: KnowledgeMapArtifact["edges"][number],
  nodeId: string,
  positions: Map<string, KnowledgeNodePosition>
) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  const node = positions.get(nodeId);
  if (!source || !target || !node) return Number.MAX_SAFE_INTEGER;

  const levelDistance = Math.abs(source.column - target.column);
  const nodeIsTarget = edge.target === nodeId ? 0 : 18;
  const visualDistance = Math.hypot(source.x - target.x, source.y - target.y) / 100;
  return nodeIsTarget + levelDistance * 8 + visualDistance;
}

function buildGraphEdge(
  edge: KnowledgeMapArtifact["edges"][number],
  positions: Map<string, KnowledgeNodePosition>,
  edgeIndex: number,
  isSkeleton: boolean
) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return "";

  const forward = target.x > source.x + 24;
  const sourceX = source.x + source.width / 2;
  const sourceY = source.y;
  const targetX = forward ? target.x - target.width / 2 : target.x + target.width / 2;
  const targetY = target.y;
  const path = forward
    ? buildForwardPath(sourceX, sourceY, targetX, targetY, edgeIndex, isSkeleton)
    : buildLoopPath(sourceX, sourceY, targetX, targetY, edgeIndex);
  const edgeId = `R${String(edgeIndex + 1).padStart(2, "0")}`;

  return `<g class="edge">
  <title>${escapeXml(`${edgeId} ${edge.label}: ${edge.source} -> ${edge.target}`)}</title>
  <path class="edge-halo" d="${path}" />
  <path class="${isSkeleton ? "edge-skeleton" : "edge-context"}" d="${path}" />
</g>`;
}

export function buildKnowledgeHtml(artifact: KnowledgeMapArtifact, svg = buildKnowledgeSvg(artifact)) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    body { margin: 0; background: #f7f8fa; color: #1b2330; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
    main { max-width: 1160px; margin: 0 auto; padding: 28px; }
    h1 { color: #244a80; margin: 0 0 18px; }
    section { background: #fff; border: 1px solid #dde3ec; border-radius: 18px; padding: 18px; margin-top: 16px; }
    .graph { overflow: auto; }
    svg { width: 100%; min-width: 760px; height: auto; }
    li { margin: 8px 0; line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(artifact.title)}</h1>
    <section class="graph">${svg}</section>
    <section>
      <h2>先修关系</h2>
      <ul>${artifact.prerequisites
        .map((item) => `<li><strong>${escapeHtml(item.title)}</strong>：${escapeHtml(item.detail)}</li>`)
        .join("")}</ul>
    </section>
    <section>
      <h2>教学重难点</h2>
      <ul>${artifact.keyPoints
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.type)} / ${escapeHtml(item.title)}</strong>：${escapeHtml(
              item.strategy
            )}</li>`
        )
        .join("")}</ul>
    </section>
    <section>
      <h2>易错点与纠偏</h2>
      <ul>${artifact.misconceptions
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.title)}</strong>：${escapeHtml(
              item.correction
            )}<br />追问：${escapeHtml(item.prompt)}</li>`
        )
        .join("")}</ul>
    </section>
  </main>
</body>
</html>`;
}

export async function buildSlidePptxBlob(
  courseProfile: CourseProfile,
  artifact: SlideOutlineArtifact
) {
  const { default: PptxGen } = await import("pptxgenjs");
  const style = resolvePptxStyle(artifact);
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "高校备课助手";
  pptx.company = "高校备课助手";
  pptx.subject = courseProfile.topic;
  pptx.title = artifact.title;
  pptx.theme = {
    headFontFace: style.fontHead,
    bodyFontFace: style.fontBody
  };

  const slides = ensureMinimumSlides(artifact);
  addTitleSlide(pptx, courseProfile, { ...artifact, slides }, style);
  slides.forEach((slide, index) => addContentSlide(pptx, artifact, slide, style, index, slides.length));

  const output = await pptx.write({ outputType: "blob" });
  return toBlob(output, pptxMime);
}

function addTitleSlide(
  pptx: PptxGenJS,
  courseProfile: CourseProfile,
  artifact: SlideOutlineArtifact,
  style: PptxStyle
) {
  const slide = pptx.addSlide();
  addStyledBackground(pptx, slide, style, true);

  const titleColor = style.dark ? style.colors.ink : style.colors.inverseText;
  const mutedColor = style.dark ? style.colors.muted : style.colors.surfaceAlt;
  const panelFill = style.dark ? style.colors.surface : style.colors.surface;

  slide.addText(style.label.toUpperCase(), {
    x: 0.72,
    y: 0.62,
    w: 4.2,
    h: 0.22,
    fontFace: style.fontMono,
    fontSize: 8.5,
    bold: true,
    color: style.colors.accent3,
    margin: 0
  });
  slide.addText(courseProfile.courseName || "高校备课助手", {
    x: 0.72,
    y: 1.05,
    w: 6.8,
    h: 0.45,
    fontFace: style.fontBody,
    fontSize: 18,
    bold: true,
    color: mutedColor,
    margin: 0
  });
  slide.addText(artifact.title, {
    x: 0.72,
    y: 1.68,
    w: 7.4,
    h: 1.55,
    fontFace: style.fontHead,
    fontSize: style.id === "academic-paper" ? 36 : 40,
    bold: true,
    color: titleColor,
    breakLine: false,
    fit: "shrink",
    margin: 0
  });
  slide.addText(`${courseProfile.topic} · ${courseProfile.classDuration}`, {
    x: 0.75,
    y: 3.45,
    w: 7.4,
    h: 0.42,
    fontFace: style.fontBody,
    fontSize: 15,
    color: mutedColor,
    margin: 0
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.72,
    y: 4.28,
    w: 1.58,
    h: 0.08,
    fill: { color: style.colors.accent },
    line: { color: style.colors.accent }
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.55,
    y: 0.9,
    w: 3.65,
    h: 4.9,
    rectRadius: 0.08,
    fill: { color: panelFill, transparency: style.dark ? 0 : 6 },
    line: { color: style.colors.border, transparency: style.dark ? 0 : 12 }
  });
  slide.addText("课件结构", {
    x: 8.95,
    y: 1.25,
    w: 2.8,
    h: 0.35,
    fontFace: style.fontHead,
    fontSize: 17,
    bold: true,
    color: style.colors.ink,
    margin: 0
  });
  const structureLines = artifact.slides
    .slice(0, 10)
    .map((item) => `${item.page}. ${item.title}`);
  if (artifact.slides.length > 10) {
    structureLines.push(`... 共 ${artifact.slides.length} 页`);
  }
  slide.addText(structureLines.join("\n"), {
    x: 8.95,
    y: 1.85,
    w: 2.8,
    h: 3.3,
    fontFace: style.fontBody,
    fontSize: 12,
    color: style.colors.muted,
    breakLine: false,
    fit: "shrink",
    valign: "middle",
    margin: 0.04
  });
}

function addContentSlide(
  pptx: PptxGenJS,
  artifact: SlideOutlineArtifact,
  slideData: SlideOutlineArtifact["slides"][number],
  style: PptxStyle,
  index: number,
  total: number
) {
  const slide = pptx.addSlide();
  addStyledBackground(pptx, slide, style);
  addSlideHeader(pptx, slide, style, artifact, slideData);

  const variant = resolveSlideLayoutVariant(slideData, index, total);
  switch (variant) {
    case "objectives":
      addObjectivesLayout(pptx, slide, style, slideData);
      break;
    case "two-column":
      addTwoColumnLayout(pptx, slide, style, slideData);
      break;
    case "process":
      addProcessLayout(pptx, slide, style, slideData);
      break;
    case "matrix":
      addMatrixLayout(pptx, slide, style, slideData);
      break;
    case "case-card":
      addCaseLayout(pptx, slide, style, slideData);
      break;
    case "activity":
      addActivityLayout(pptx, slide, style, slideData);
      break;
    case "summary":
      addSummaryLayout(pptx, slide, style, slideData, artifact);
      break;
    case "card-list":
    case "cover":
      addCardListLayout(pptx, slide, style, slideData);
      break;
  }

  addTeacherNotePanel(pptx, slide, style, slideData);
  slide.addNotes(buildSlideSpeakerNotes(artifact, slideData));
}

function addStyledBackground(pptx: PptxGenJS, slide: PptxSlide, style: PptxStyle, title = false) {
  const bg = title ? style.colors.inverse : style.colors.bg;
  slide.background = { color: bg };

  if (style.id === "blueprint") {
    for (let x = 0; x <= slideWidth; x += 0.62) {
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y: 0,
        w: 0.006,
        h: slideHeight,
        fill: { color: title ? "1B4B76" : "C9DEEF", transparency: title ? 32 : 8 },
        line: { color: title ? "1B4B76" : "C9DEEF", transparency: title ? 32 : 8 }
      });
    }
    for (let y = 0; y <= slideHeight; y += 0.48) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y,
        w: slideWidth,
        h: 0.006,
        fill: { color: title ? "1B4B76" : "C9DEEF", transparency: title ? 32 : 8 },
        line: { color: title ? "1B4B76" : "C9DEEF", transparency: title ? 32 : 8 }
      });
    }
  }

  if (style.id === "tokyo-night") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: slideWidth,
      h: slideHeight,
      fill: { color: title ? style.colors.inverse : style.colors.bg },
      line: { color: title ? style.colors.inverse : style.colors.bg }
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: title ? 0.52 : 0.28,
      w: 12.25,
      h: 0.04,
      fill: { color: style.colors.accent2, transparency: 20 },
      line: { color: style.colors.accent2, transparency: 20 }
    });
  }

  if (style.id === "course-module" && !title) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 1.16,
      h: slideHeight,
      fill: { color: style.colors.surfaceAlt },
      line: { color: style.colors.surfaceAlt }
    });
  }

  if (style.id === "corporate-clean" && !title) {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: slideWidth,
      h: 0.2,
      fill: { color: style.colors.accent },
      line: { color: style.colors.accent }
    });
  }
}

function addSlideHeader(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  artifact: SlideOutlineArtifact,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.55,
    y: 0.44,
    w: 0.12,
    h: 0.72,
    fill: { color: style.colors.accent },
    line: { color: style.colors.accent }
  });
  slide.addText(`${slideData.page.toString().padStart(2, "0")} / ${artifact.title}`, {
    x: 0.82,
    y: 0.5,
    w: 4.8,
    h: 0.28,
    fontFace: style.fontMono,
    fontSize: 10,
    bold: true,
    color: style.colors.accent,
    margin: 0
  });
  slide.addText(slideData.title, {
    x: 0.82,
    y: 0.9,
    w: 8.15,
    h: 0.8,
    fontFace: style.fontHead,
    fontSize: 29,
    bold: true,
    color: style.colors.ink,
    fit: "shrink",
    margin: 0
  });
  slide.addText(slideData.layout || "课堂呈现", {
    x: 9.55,
    y: 0.56,
    w: 2.85,
    h: 0.32,
    fontFace: style.fontBody,
    fontSize: 10,
    bold: true,
    color: style.colors.muted,
    align: "right",
    fit: "shrink",
    margin: 0
  });
}

interface RichTextPanelOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  text: string;
  fill?: string;
  accent?: string;
  inverse?: boolean;
  fontSize?: number;
}

function addRichTextPanel(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  options: RichTextPanelOptions
) {
  const inverse = options.inverse || false;
  const fill = options.fill || (inverse ? style.colors.inverse : style.colors.surfaceAlt);
  const accent = options.accent || (inverse ? style.colors.accent3 : style.colors.accent);
  const bodyColor = inverse ? style.colors.inverseText : style.colors.ink;
  const labelColor = inverse ? style.colors.accent3 : accent;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: options.x,
    y: options.y,
    w: options.w,
    h: options.h,
    rectRadius: 0.035,
    fill: { color: fill, transparency: inverse || style.dark ? 0 : 6 },
    line: { color: inverse ? fill : style.colors.border, transparency: inverse ? 0 : 10 }
  });
  slide.addText(options.label, {
    x: options.x + 0.22,
    y: options.y + 0.14,
    w: options.w - 0.44,
    h: 0.18,
    fontFace: style.fontMono,
    fontSize: 7.8,
    bold: true,
    color: labelColor,
    margin: 0
  });
  slide.addText(options.text || "结合课堂反馈补充讲解。", {
    x: options.x + 0.22,
    y: options.y + 0.42,
    w: options.w - 0.44,
    h: Math.max(0.18, options.h - 0.55),
    fontFace: style.fontBody,
    fontSize: options.fontSize || 10.4,
    color: bodyColor,
    breakLine: false,
    fit: "shrink",
    valign: "middle",
    margin: 0.01
  });
}

function buildDetailText(slideData: SlideData) {
  return slideData.detail || slideData.visualSuggestion || ensurePoints(slideData).join("；");
}

function ensureExamples(slideData: SlideData) {
  return (slideData.examples || []).map((item) => item.trim()).filter(Boolean);
}

function buildExamplesText(slideData: SlideData, maxItems = 2) {
  const examples = ensureExamples(slideData);
  if (examples.length) {
    return examples.slice(0, maxItems).map((item) => `• ${item}`).join("\n");
  }
  return slideData.interactionPrompt || slideData.visualSuggestion || "结合本课主题补充一个课堂案例。";
}

function buildPointListText(slideData: SlideData, maxItems = 5) {
  return ensurePoints(slideData).slice(0, maxItems).map((point) => `• ${point}`).join("\n");
}

function buildSlideSpeakerNotes(artifact: SlideOutlineArtifact, slideData: SlideData) {
  const points = ensurePoints(slideData);
  const examples = ensureExamples(slideData);
  return [
    `《${artifact.title}》第 ${slideData.page} 页：${slideData.title}`,
    slideData.teacherScript ? `讲稿提示：${slideData.teacherScript}` : "",
    buildDetailText(slideData) ? `讲解正文：${buildDetailText(slideData)}` : "",
    points.length ? `页面要点：\n${points.map((point) => `- ${point}`).join("\n")}` : "",
    examples.length ? `案例/例子：\n${examples.map((item) => `- ${item}`).join("\n")}` : "",
    slideData.interactionPrompt ? `互动问题：${slideData.interactionPrompt}` : "",
    slideData.teacherNotes ? `讲授备注：${slideData.teacherNotes}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function addCardListLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const points = ensurePoints(slideData);
  const cardCount = Math.min(4, Math.max(3, points.length));
  const cardW = 2.85;
  points.slice(0, cardCount).forEach((point, itemIndex) => {
    const x = 0.72 + itemIndex * 3.12;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.06,
      w: cardW,
      h: 2.72,
      rectRadius: 0.05,
      fill: { color: itemIndex % 2 === 0 ? style.colors.surface : style.colors.surfaceAlt, transparency: style.dark ? 0 : 4 },
      line: { color: style.colors.border }
    });
    slide.addText(String(itemIndex + 1).padStart(2, "0"), {
      x: x + 0.26,
      y: 2.34,
      w: 0.72,
      h: 0.28,
      fontFace: style.fontMono,
      fontSize: 10,
      bold: true,
      color: style.colors.accent,
      margin: 0
    });
    slide.addText(point, {
      x: x + 0.3,
      y: 2.88,
      w: cardW - 0.6,
      h: 1.24,
      fontFace: style.fontBody,
      fontSize: 15,
      bold: itemIndex === 0,
      color: style.colors.ink,
      fit: "shrink",
      valign: "middle",
      margin: 0.02
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.3,
      y: 4.46,
      w: 0.78,
      h: 0.06,
      fill: { color: [style.colors.accent, style.colors.accent2, style.colors.accent3, style.colors.accent][itemIndex] },
      line: { color: [style.colors.accent, style.colors.accent2, style.colors.accent3, style.colors.accent][itemIndex] }
    });
  });
  addRichTextPanel(pptx, slide, style, {
    x: 0.82,
    y: 5.05,
    w: 7.18,
    h: 0.95,
    label: "TEACHING DETAIL",
    text: buildDetailText(slideData),
    fontSize: 10.2
  });
  addRichTextPanel(pptx, slide, style, {
    x: 8.3,
    y: 5.05,
    w: 3.9,
    h: 0.95,
    label: "EXAMPLE",
    text: buildExamplesText(slideData, 2),
    accent: style.colors.accent2,
    fontSize: 9.5
  });
}

function addObjectivesLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const points = ensurePoints(slideData);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.74,
    y: 2.02,
    w: 4.2,
    h: 4.12,
    rectRadius: 0.06,
    fill: { color: style.colors.inverse },
    line: { color: style.colors.inverse }
  });
  slide.addText("LEARNING\nOBJECTIVES", {
    x: 1.05,
    y: 2.45,
    w: 2.9,
    h: 1.0,
    fontFace: style.fontMono,
    fontSize: 19,
    bold: true,
    color: style.colors.inverseText,
    breakLine: false,
    fit: "shrink",
    margin: 0
  });
  slide.addText(buildDetailText(slideData), {
    x: 1.05,
    y: 3.72,
    w: 3.2,
    h: 1.14,
    fontFace: style.fontBody,
    fontSize: 12,
    color: style.colors.inverseText,
    fit: "shrink",
    margin: 0
  });
  slide.addText(buildExamplesText(slideData, 1), {
    x: 1.05,
    y: 5.25,
    w: 3.2,
    h: 0.44,
    fontFace: style.fontBody,
    fontSize: 9.6,
    color: style.colors.inverseText,
    fit: "shrink",
    margin: 0
  });
  points.slice(0, 4).forEach((point, itemIndex) => {
    const y = 2.1 + itemIndex * 1.02;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.28,
      y,
      w: 6.68,
      h: 0.78,
      rectRadius: 0.04,
      fill: { color: style.colors.surface },
      line: { color: style.colors.border }
    });
    slide.addText(`${itemIndex + 1}`, {
      x: 5.55,
      y: y + 0.19,
      w: 0.32,
      h: 0.3,
      fontFace: style.fontMono,
      fontSize: 12,
      bold: true,
      color: style.colors.accent,
      margin: 0
    });
    slide.addText(point, {
      x: 6.1,
      y: y + 0.15,
      w: 5.35,
      h: 0.42,
      fontFace: style.fontBody,
      fontSize: 14,
      color: style.colors.ink,
      fit: "shrink",
      margin: 0
    });
  });
}

function addTwoColumnLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const [left, right] = splitPoints(ensurePoints(slideData));
  addColumnPanel(pptx, slide, style, 0.74, "关键理解", left, style.colors.accent);
  addColumnPanel(
    pptx,
    slide,
    style,
    6.74,
    "案例/迁移",
    ensureExamples(slideData).length ? ensureExamples(slideData) : right.length ? right : left,
    style.colors.accent2
  );
  addRichTextPanel(pptx, slide, style, {
    x: 0.74,
    y: 5.48,
    w: 11.42,
    h: 0.72,
    label: "TEACHING DETAIL",
    text: buildDetailText(slideData),
    fontSize: 10.2
  });
}

function addColumnPanel(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  x: number,
  heading: string,
  points: string[],
  accent: string
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y: 2.0,
    w: 5.42,
    h: 3.22,
    rectRadius: 0.05,
    fill: { color: style.colors.surface },
    line: { color: style.colors.border }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y: 2.0,
    w: 5.42,
    h: 0.15,
    fill: { color: accent },
    line: { color: accent }
  });
  slide.addText(heading, {
    x: x + 0.36,
    y: 2.42,
    w: 4.45,
    h: 0.32,
    fontFace: style.fontHead,
    fontSize: 17,
    bold: true,
    color: style.colors.ink,
    margin: 0
  });
  slide.addText(points.slice(0, 4).map((point) => `• ${point}`).join("\n"), {
    x: x + 0.38,
    y: 3.03,
    w: 4.55,
    h: 1.58,
    fontFace: style.fontBody,
    fontSize: 13.5,
    color: style.colors.muted,
    breakLine: false,
    fit: "shrink",
    margin: 0.02
  });
}

function addProcessLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const points = ensurePoints(slideData).slice(0, 5);
  const gap = 0.22;
  const stepW = (11.64 - gap * (points.length - 1)) / points.length;
  points.forEach((point, itemIndex) => {
    const x = 0.82 + itemIndex * (stepW + gap);
    const y = 2.38 + (itemIndex % 2) * 0.38;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: stepW,
      h: 2.35,
      rectRadius: 0.05,
      fill: { color: itemIndex % 2 ? style.colors.surfaceAlt : style.colors.surface },
      line: { color: style.colors.border }
    });
    slide.addText(`STEP ${itemIndex + 1}`, {
      x: x + 0.2,
      y: y + 0.28,
      w: stepW - 0.4,
      h: 0.25,
      fontFace: style.fontMono,
      fontSize: 8.5,
      bold: true,
      color: style.colors.accent,
      margin: 0
    });
    slide.addText(point, {
      x: x + 0.22,
      y: y + 0.88,
      w: stepW - 0.44,
      h: 0.92,
      fontFace: style.fontBody,
      fontSize: 12.5,
      bold: itemIndex === 0,
      color: style.colors.ink,
      fit: "shrink",
      valign: "middle",
      margin: 0.02
    });
    if (itemIndex < points.length - 1) {
      slide.addText("→", {
        x: x + stepW - 0.02,
        y: 3.36,
        w: 0.28,
        h: 0.28,
        fontFace: style.fontMono,
        fontSize: 15,
        bold: true,
        color: style.colors.accent2,
        margin: 0
      });
    }
  });
  addRichTextPanel(pptx, slide, style, {
    x: 0.82,
    y: 5.36,
    w: 7.1,
    h: 0.76,
    label: "WHY IT MATTERS",
    text: buildDetailText(slideData),
    fontSize: 9.8
  });
  addRichTextPanel(pptx, slide, style, {
    x: 8.22,
    y: 5.36,
    w: 3.98,
    h: 0.76,
    label: "CLASSROOM EXAMPLE",
    text: buildExamplesText(slideData, 1),
    accent: style.colors.accent2,
    fontSize: 9.2
  });
}

function addMatrixLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const points = ensurePoints(slideData).slice(0, 4);
  points.forEach((point, itemIndex) => {
    const col = itemIndex % 2;
    const row = Math.floor(itemIndex / 2);
    const x = 0.82 + col * 5.78;
    const y = 2.05 + row * 1.82;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 5.36,
      h: 1.48,
      rectRadius: 0.04,
      fill: { color: style.colors.surface },
      line: { color: style.colors.border }
    });
    slide.addText(["A", "B", "C", "D"][itemIndex], {
      x: x + 0.22,
      y: y + 0.18,
      w: 0.42,
      h: 0.35,
      fontFace: style.fontMono,
      fontSize: 13,
      bold: true,
      color: [style.colors.accent, style.colors.accent2, style.colors.accent3, style.colors.accent][itemIndex],
      margin: 0
    });
    slide.addText(point, {
      x: x + 0.82,
      y: y + 0.22,
      w: 4.05,
      h: 0.84,
      fontFace: style.fontBody,
      fontSize: 13,
      color: style.colors.ink,
      fit: "shrink",
      valign: "middle",
      margin: 0.02
    });
  });
  addRichTextPanel(pptx, slide, style, {
    x: 0.86,
    y: 5.48,
    w: 7.04,
    h: 0.72,
    label: "EXPLANATION",
    text: buildDetailText(slideData),
    fontSize: 9.7
  });
  addRichTextPanel(pptx, slide, style, {
    x: 8.18,
    y: 5.48,
    w: 4.02,
    h: 0.72,
    label: "EXAMPLE",
    text: buildExamplesText(slideData, 1),
    accent: style.colors.accent2,
    fontSize: 9.1
  });
}

function addCaseLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.82,
    y: 2.0,
    w: 7.25,
    h: 3.92,
    rectRadius: 0.06,
    fill: { color: style.colors.surface },
    line: { color: style.colors.border }
  });
  slide.addText("课堂案例", {
    x: 1.2,
    y: 2.38,
    w: 2.2,
    h: 0.3,
    fontFace: style.fontHead,
    fontSize: 16,
    bold: true,
    color: style.colors.accent,
    margin: 0
  });
  slide.addText(buildDetailText(slideData), {
    x: 1.2,
    y: 2.92,
    w: 6.15,
    h: 1.18,
    fontFace: style.fontBody,
    fontSize: 12.5,
    color: style.colors.ink,
    breakLine: false,
    fit: "shrink",
    valign: "middle",
    margin: 0.02
  });
  slide.addText(buildPointListText(slideData, 3), {
    x: 1.2,
    y: 4.25,
    w: 3.1,
    h: 0.86,
    fontFace: style.fontBody,
    fontSize: 10.8,
    color: style.colors.muted,
    breakLine: false,
    fit: "shrink",
    margin: 0
  });
  slide.addText(buildExamplesText(slideData, 2), {
    x: 4.68,
    y: 4.25,
    w: 2.64,
    h: 0.86,
    fontFace: style.fontBody,
    fontSize: 10.4,
    color: style.colors.accent,
    breakLine: false,
    fit: "shrink",
    margin: 0
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.54,
    y: 2.0,
    w: 3.65,
    h: 3.92,
    rectRadius: 0.06,
    fill: { color: style.colors.inverse },
    line: { color: style.colors.inverse }
  });
  slide.addText("追问", {
    x: 8.92,
    y: 2.45,
    w: 1.7,
    h: 0.34,
    fontFace: style.fontHead,
    fontSize: 17,
    bold: true,
    color: style.colors.inverseText,
    margin: 0
  });
  slide.addText(slideData.interactionPrompt || "请学生先给出判断，再说明依据。", {
    x: 8.92,
    y: 3.06,
    w: 2.75,
    h: 1.55,
    fontFace: style.fontBody,
    fontSize: 13.5,
    color: style.colors.inverseText,
    fit: "shrink",
    valign: "middle",
    margin: 0
  });
}

function addActivityLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const points = ensurePoints(slideData);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.82,
    y: 2.08,
    w: 11.38,
    h: 3.95,
    rectRadius: 0.06,
    fill: { color: style.colors.surface },
    line: { color: style.colors.border }
  });
  slide.addText("课堂活动脚本", {
    x: 1.18,
    y: 2.45,
    w: 3.0,
    h: 0.34,
    fontFace: style.fontHead,
    fontSize: 17,
    bold: true,
    color: style.colors.ink,
    margin: 0
  });
  points.slice(0, 4).forEach((point, itemIndex) => {
    const y = 3.15 + itemIndex * 0.52;
    slide.addShape(pptx.ShapeType.rect, {
      x: 1.22,
      y: y + 0.08,
      w: 0.16,
      h: 0.16,
      fill: { color: [style.colors.accent, style.colors.accent2, style.colors.accent3, style.colors.accent][itemIndex] },
      line: { color: [style.colors.accent, style.colors.accent2, style.colors.accent3, style.colors.accent][itemIndex] }
    });
    slide.addText(point, {
      x: 1.62,
      y,
      w: 5.5,
      h: 0.32,
      fontFace: style.fontBody,
      fontSize: 12.8,
      color: style.colors.muted,
      fit: "shrink",
      margin: 0
    });
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.72,
    y: 2.68,
    w: 3.85,
    h: 2.72,
    rectRadius: 0.05,
    fill: { color: style.colors.surfaceAlt },
    line: { color: style.colors.border }
  });
  slide.addText("即时互动", {
    x: 8.05,
    y: 3.02,
    w: 2.4,
    h: 0.32,
    fontFace: style.fontHead,
    fontSize: 16,
    bold: true,
    color: style.colors.accent,
    margin: 0
  });
  slide.addText(slideData.interactionPrompt || "请学生两两讨论后提交一句判断。", {
    x: 8.05,
    y: 3.62,
    w: 2.95,
    h: 0.76,
    fontFace: style.fontBody,
    fontSize: 12.2,
    color: style.colors.ink,
    fit: "shrink",
    valign: "middle",
    margin: 0
  });
  slide.addText(buildExamplesText(slideData, 1), {
    x: 8.05,
    y: 4.62,
    w: 2.95,
    h: 0.48,
    fontFace: style.fontBody,
    fontSize: 9.6,
    color: style.colors.muted,
    fit: "shrink",
    margin: 0
  });
  addRichTextPanel(pptx, slide, style, {
    x: 1.18,
    y: 5.48,
    w: 10.38,
    h: 0.68,
    label: "TEACHING DETAIL",
    text: buildDetailText(slideData),
    fontSize: 9.1
  });
}

function addSummaryLayout(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number],
  artifact: SlideOutlineArtifact
) {
  const points = ensurePoints(slideData).slice(0, 3);
  points.forEach((point, itemIndex) => {
    const y = 2.1 + itemIndex * 1.08;
    slide.addText(`0${itemIndex + 1}`, {
      x: 0.9,
      y,
      w: 0.8,
      h: 0.38,
      fontFace: style.fontMono,
      fontSize: 14,
      bold: true,
      color: [style.colors.accent, style.colors.accent2, style.colors.accent3][itemIndex],
      margin: 0
    });
    slide.addText(point, {
      x: 1.85,
      y: y - 0.04,
      w: 6.75,
      h: 0.5,
      fontFace: style.fontBody,
      fontSize: 16,
      bold: itemIndex === 0,
      color: style.colors.ink,
      fit: "shrink",
      margin: 0
    });
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 9.15,
    y: 2.0,
    w: 2.96,
    h: 3.25,
    rectRadius: 0.05,
    fill: { color: style.colors.inverse },
    line: { color: style.colors.inverse }
  });
  slide.addText("课后延伸", {
    x: 9.48,
    y: 2.38,
    w: 2.15,
    h: 0.32,
    fontFace: style.fontHead,
    fontSize: 15,
    bold: true,
    color: style.colors.inverseText,
    margin: 0
  });
  slide.addText((artifact.extensionTasks.length ? artifact.extensionTasks : ["整理课堂要点", "完成一次迁移练习"]).slice(0, 3).map((item) => `• ${item}`).join("\n"), {
    x: 9.48,
    y: 3.0,
    w: 2.1,
    h: 1.45,
    fontFace: style.fontBody,
    fontSize: 11.5,
    color: style.colors.inverseText,
    breakLine: false,
    fit: "shrink",
    margin: 0
  });
  addRichTextPanel(pptx, slide, style, {
    x: 0.9,
    y: 5.35,
    w: 7.7,
    h: 0.78,
    label: "SUMMARY DETAIL",
    text: buildDetailText(slideData),
    fontSize: 9.7
  });
}

function addTeacherNotePanel(
  pptx: PptxGenJS,
  slide: PptxSlide,
  style: PptxStyle,
  slideData: SlideOutlineArtifact["slides"][number]
) {
  const noteText = slideData.teacherNotes || slideData.teacherScript || slideData.visualSuggestion || "根据课堂反馈调整讲授节奏。";
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.82,
    y: 6.36,
    w: 11.36,
    h: 0.52,
    rectRadius: 0.03,
    fill: { color: style.colors.surfaceAlt, transparency: style.dark ? 0 : 10 },
    line: { color: style.colors.border, transparency: style.dark ? 0 : 18 }
  });
  slide.addText(`讲授备注：${noteText}`, {
    x: 1.05,
    y: 6.5,
    w: 10.86,
    h: 0.24,
    fontFace: style.fontBody,
    fontSize: 9.5,
    color: style.colors.muted,
    fit: "shrink",
    margin: 0
  });
}

function ensurePoints(slideData: SlideOutlineArtifact["slides"][number]) {
  return slideData.points.length
    ? slideData.points
    : [slideData.detail || slideData.visualSuggestion || slideData.layout || "呈现本页核心概念"];
}

function splitPoints(points: string[]) {
  const midpoint = Math.max(1, Math.ceil(points.length / 2));
  return [points.slice(0, midpoint), points.slice(midpoint)] as const;
}

function ensureMinimumSlides(artifact: SlideOutlineArtifact) {
  if (artifact.slides.length >= 6) return artifact.slides;

  const filled = [...artifact.slides];
  while (filled.length < 6) {
    const page = filled.length + 1;
    filled.push({
      page,
      title: page === 1 ? "核心概念导入" : page >= 6 ? "课堂总结与迁移" : `课堂活动 ${page}`,
      layout: "要点卡片 + 教师提问",
      layoutVariant: page === 1 ? "case-card" : page >= 6 ? "summary" : "activity",
      points: artifact.extensionTasks.slice(0, 3).length
        ? artifact.extensionTasks.slice(0, 3)
        : ["回顾课程画像中的学习目标", "组织学生进行小组讨论", "用形成性评价检查理解"],
      detail: "这是为短课件大纲自动补齐的教学页，教师可根据前后页面内容继续细化讲解、案例和活动要求，确保课件具备完整课堂节奏。",
      examples: artifact.extensionTasks.slice(0, 2).length
        ? artifact.extensionTasks.slice(0, 2)
        : ["结合本课主题补充一个课堂案例", "让学生给出迁移应用示例"],
      visualSuggestion: "使用流程卡或对比表呈现。",
      interactionPrompt: artifact.transitionLines[page - 1] || "请学生用自己的话解释本页关键点。",
      teacherNotes: "根据课堂反馈调整讲授节奏，并把学生回答记录为后续讲解素材。",
      teacherScript: "这一页是自动补齐的授课提示。请结合上一页内容先做简短回顾，再抛出一个具体问题，让学生用自己的话说明理解。"
    });
  }
  return filled;
}

function toBlob(value: string | ArrayBuffer | Blob | Uint8Array, mimeType: string) {
  if (value instanceof Blob) return value;
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return new Blob([copy.buffer], { type: mimeType });
  }
  return new Blob([value], { type: mimeType });
}

function moduleLabel(moduleId: ModuleId) {
  return agentModules.find((module) => module.id === moduleId)?.shortTitle || moduleId;
}

function wrapSvgText(text: string, maxChars: number) {
  const tokens = Array.from(text.matchAll(/[A-Za-z0-9_+/#.-]+|[\u4e00-\u9fff]|[^\s]/gu)).map(
    (match) => match[0]
  );
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = `${current}${token}`;
    if (current && visualLength(candidate) > maxChars) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function visualLength(text: string) {
  return Array.from(text).reduce((total, char) => total + (/^[\x00-\x7F]$/u.test(char) ? 0.72 : 1), 0);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtml(value: string) {
  return escapeXml(value).replace(/'/g, "&#39;");
}
