import { agentModules } from "@/lib/agent/modules";
import { isSlideContentDirection } from "@/lib/agent/slide-preferences";
import { jsonrepair } from "jsonrepair";
import type {
  AgentArtifact,
  CourseProfile,
  HomeworkFeedbackArtifact,
  KnowledgeMapArtifact,
  LessonPlanArtifact,
  ModuleId,
  ModuleOutputs,
  ModuleResult,
  QuizBuilderArtifact,
  SlideContentDirection,
  SlideLayoutVariant,
  SlideOutlineArtifact,
  SlideStylePreset
} from "@/types/agent";

type JsonRecord = Record<string, unknown>;

const moduleIds = agentModules.map((module) => module.id);
const courseProfileSignatureVersion = "course-profile-v3-generic-anchor-validation";
const slideStylePresets = new Set<SlideStylePreset>([
  "course-module",
  "academic-paper",
  "corporate-clean",
  "tokyo-night",
  "blueprint"
]);
const slideLayoutVariants = new Set<SlideLayoutVariant>([
  "cover",
  "objectives",
  "two-column",
  "process",
  "matrix",
  "case-card",
  "activity",
  "summary",
  "card-list"
]);

export function parseArtifactResult(
  moduleId: ModuleId,
  rawText: string,
  generatedAt = new Date().toISOString(),
  courseProfileSignature?: string
): ModuleResult {
  try {
    const jsonText = extractJsonObject(rawText);
    const parsed = parseJson(jsonText);
    const artifact = coerceAgentArtifact(moduleId, parsed);

    return {
      rawText,
      artifact,
      courseProfileSignature,
      markdownFallback: artifact.markdownFallback,
      generatedAt
    };
  } catch (error) {
    return {
      rawText,
      courseProfileSignature,
      markdownFallback: rawText,
      generatedAt,
      parseError: formatParseError(error)
    };
  }
}

function parseJson(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText) as unknown;
  } catch (firstError) {
    const normalized = normalizeCommonModelJsonIssues(jsonText);
    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      // Continue to the more general repair pass below.
    }

    try {
      return JSON.parse(jsonrepair(normalized)) as unknown;
    } catch {
      try {
        return recoverTruncatedMarkdownFallback(normalized);
      } catch {
        // Report the original parser error so the failure points at the model output.
      }
      throw firstError instanceof Error ? firstError : new Error("JSON 解析失败。");
    }
  }
}

function normalizeCommonModelJsonIssues(jsonText: string) {
  return jsonText.replace(/:\s*""(?=[^,\]}\s])/g, ':"');
}

function recoverTruncatedMarkdownFallback(jsonText: string): unknown {
  const marker = /,\s*"markdownFallback"\s*:/u.exec(jsonText);
  if (!marker) {
    throw new Error("无法定位 markdownFallback 字段。");
  }

  const prefix = jsonText.slice(0, marker.index).trimEnd().replace(/,\s*$/u, "");
  const fallback =
    "结构化内容已恢复；兼容 Markdown 因模型输出截断未完整返回。请使用模块导出文件，或点击重新生成获取完整兼容文本。";
  return JSON.parse(`${prefix},"markdownFallback":${JSON.stringify(fallback)}}`) as unknown;
}

function formatParseError(error: unknown) {
  const message = error instanceof Error ? error.message : "JSON 解析失败。";
  if (/Unterminated string|Unexpected end|unterminated/i.test(message)) {
    return "模型输出疑似被截断，JSON 字符串没有完整闭合。系统已保留原文，请重试生成。";
  }
  return message;
}

export function migrateModuleOutputs(input: unknown): ModuleOutputs {
  if (!isRecord(input)) return {};

  const migrated: ModuleOutputs = {};

  for (const moduleId of moduleIds) {
    const value = input[moduleId];
    if (typeof value === "string") {
      migrated[moduleId] = {
        rawText: value,
        markdownFallback: value
      };
      continue;
    }

    if (!isRecord(value)) continue;

    const rawText = readString(value.rawText);
    const courseProfileSignature = readOptionalString(value.courseProfileSignature);
    const generatedAt = readOptionalString(value.generatedAt);
    const markdownFallback = readOptionalString(value.markdownFallback);
    const parseError = readOptionalString(value.parseError);

    let artifact: AgentArtifact | undefined;
    if (value.artifact !== undefined) {
      try {
        artifact = coerceAgentArtifact(moduleId, value.artifact);
      } catch {
        artifact = undefined;
      }
    }

    if (!artifact && rawText) {
      const reparsed = parseArtifactResult(moduleId, rawText, generatedAt, courseProfileSignature);
      if (reparsed.artifact && !reparsed.parseError) {
        migrated[moduleId] = reparsed;
        continue;
      }
    }

    migrated[moduleId] = {
      rawText,
      artifact,
      courseProfileSignature,
      markdownFallback: artifact?.markdownFallback || markdownFallback || rawText,
      generatedAt,
      parseError
    };
  }

  return migrated;
}

export function getResultMarkdown(result: ModuleResult | undefined) {
  return result?.markdownFallback?.trim() || result?.artifact?.markdownFallback.trim() || result?.rawText.trim() || "";
}

export function hasResult(result: ModuleResult | undefined) {
  return Boolean(getResultMarkdown(result) || result?.artifact);
}

export function buildCourseProfileSignature(courseProfile: CourseProfile) {
  const normalized = {
    signatureVersion: courseProfileSignatureVersion,
    courseName: normalizeSignatureField(courseProfile.courseName),
    topic: normalizeSignatureField(courseProfile.topic),
    learnerProfile: normalizeSignatureField(courseProfile.learnerProfile),
    classDuration: normalizeSignatureField(courseProfile.classDuration),
    teachingGoals: normalizeSignatureField(courseProfile.teachingGoals),
    existingMaterials: normalizeSignatureField(courseProfile.existingMaterials),
    constraints: normalizeSignatureField(courseProfile.constraints)
  };

  return JSON.stringify(normalized);
}

export function filterOutputsForCourse(outputs: ModuleOutputs, courseProfileSignature: string) {
  const filtered: ModuleOutputs = {};

  for (const moduleId of moduleIds) {
    const result = outputs[moduleId];
    if (!result || !hasResult(result)) continue;
    if (result.courseProfileSignature !== courseProfileSignature) continue;
    filtered[moduleId] = result;
  }

  return filtered;
}

export function pruneOutputsForCourse(outputs: ModuleOutputs, courseProfileSignature: string) {
  const pruned: ModuleOutputs = {};
  let removed = 0;

  for (const moduleId of moduleIds) {
    const result = outputs[moduleId];
    if (!result || !hasResult(result)) continue;

    if (result.courseProfileSignature === courseProfileSignature) {
      pruned[moduleId] = result;
    } else {
      removed += 1;
    }
  }

  return { outputs: removed ? pruned : outputs, removed };
}

export function validateResultMatchesCourse(
  result: ModuleResult,
  courseProfile: CourseProfile
) {
  if (result.parseError || !result.artifact) return undefined;

  const anchors = buildCourseAnchorKeywords(courseProfile);
  if (!anchors.length) return undefined;

  const artifactText = normalizeAnchorText(JSON.stringify(result.artifact));
  const matched = anchors.some((anchor) => artifactText.includes(anchor));

  if (matched) return undefined;

  return `生成结果疑似偏离当前课程主题：结果中未出现“${anchors.slice(0, 3).join(" / ")}”等课程锚点。请检查课程画像后重新生成。`;
}

function normalizeSignatureField(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function buildCourseAnchorKeywords(courseProfile: CourseProfile) {
  const fullAnchors = [courseProfile.courseName, courseProfile.topic]
    .map(normalizeAnchorText)
    .filter((item) => item.length >= 2);
  const segmentAnchors = fullAnchors.flatMap((item) =>
    item
      .split(/[\\/:：,，、;；|｜\s]+/u)
      .map(normalizeAnchorText)
      .filter((segment) => segment.length >= 2 && !["课程", "主题", "章节"].includes(segment))
  );

  return Array.from(new Set([...fullAnchors, ...segmentAnchors]));
}

function normalizeAnchorText(value: string) {
  return value
    .toLowerCase()
    .replace(/[《》“”"'`~!！?？.。,:：;；、，\s()[\]{}【】<>]/gu, "")
    .trim();
}

export function coerceAgentArtifact(moduleId: ModuleId, input: unknown): AgentArtifact {
  const base = readBase(moduleId, input);

  switch (moduleId) {
    case "knowledge-map":
      return coerceKnowledgeMap(base.record, base.common);
    case "lesson-plan":
      return coerceLessonPlan(base.record, base.common);
    case "slide-outline":
      return coerceSlideOutline(base.record, base.common);
    case "quiz-builder":
      return coerceQuizBuilder(base.record, base.common);
    case "homework-feedback":
      return coerceHomeworkFeedback(base.record, base.common);
  }
}

function extractJsonObject(rawText: string) {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = fenceMatch?.[1]?.trim() || trimmed;
  const start = unfenced.indexOf("{");

  if (start === -1) {
    throw new Error("模型没有返回完整 JSON 对象。");
  }

  const candidate = unfenced.slice(start);
  const rootEnd = findRootObjectEnd(candidate);
  return rootEnd === null ? candidate : candidate.slice(0, rootEnd);
}

function findRootObjectEnd(jsonText: string) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  return null;
}

function readBase(moduleId: ModuleId, input: unknown) {
  if (!isRecord(input)) {
    throw new Error("artifact 不是 JSON 对象。");
  }

  const schemaVersion = readString(input.schemaVersion);
  const parsedModuleId = readString(input.moduleId);
  const title = readString(input.title);
  const markdownFallback = readString(input.markdownFallback);

  if (schemaVersion !== "artifact-v1") {
    throw new Error("artifact.schemaVersion 不是 artifact-v1。");
  }

  if (parsedModuleId !== moduleId) {
    throw new Error(`artifact.moduleId 与当前模块不匹配：${parsedModuleId || "空"}`);
  }

  if (!title || !markdownFallback) {
    throw new Error("artifact 缺少 title 或 markdownFallback。");
  }

  return {
    record: input,
    common: {
      schemaVersion: "artifact-v1" as const,
      moduleId,
      title,
      markdownFallback
    }
  };
}

function coerceKnowledgeMap(
  record: JsonRecord,
  common: ReturnType<typeof readBase>["common"]
): KnowledgeMapArtifact {
  const nodes = readRecords(record.nodes).map((item, index) => ({
    id: readString(item.id) || `node-${index + 1}`,
    label: readString(item.label),
    level: readNumber(item.level, 1),
    summary: readString(item.summary)
  }));
  const edges = readRecords(record.edges).map((item) => ({
    source: readString(item.source),
    target: readString(item.target),
    label: readString(item.label)
  }));

  if (nodes.length === 0) throw new Error("知识图谱缺少 nodes。");

  return {
    ...common,
    moduleId: "knowledge-map",
    nodes: nodes.filter((node) => node.label),
    edges: edges.filter((edge) => edge.source && edge.target),
    prerequisites: readRecords(record.prerequisites).map((item) => ({
      title: readString(item.title),
      detail: readString(item.detail)
    })),
    keyPoints: readRecords(record.keyPoints).map((item) => ({
      type: readString(item.type),
      title: readString(item.title),
      strategy: readString(item.strategy)
    })),
    misconceptions: readRecords(record.misconceptions).map((item) => ({
      title: readString(item.title),
      correction: readString(item.correction),
      prompt: readString(item.prompt)
    })),
    activities: readRecords(record.activities).map((item) => ({
      title: readString(item.title),
      steps: readStringArray(item.steps)
    }))
  };
}

function coerceLessonPlan(
  record: JsonRecord,
  common: ReturnType<typeof readBase>["common"]
): LessonPlanArtifact {
  const timeline = readRecords(record.timeline).map((item) => ({
    phase: readString(item.phase),
    duration: readString(item.duration),
    teacherActions: readStringArray(item.teacherActions),
    studentActions: readStringArray(item.studentActions),
    assessment: readString(item.assessment)
  }));

  if (timeline.length === 0) throw new Error("教案缺少 timeline。");

  return {
    ...common,
    moduleId: "lesson-plan",
    objectives: readRecords(record.objectives).map((item) => ({
      dimension: readString(item.dimension),
      objective: readString(item.objective),
      evidence: readString(item.evidence)
    })),
    keyPoints: readRecords(record.keyPoints).map((item) => ({
      type: readString(item.type),
      title: readString(item.title),
      strategy: readString(item.strategy)
    })),
    timeline,
    materials: readStringArray(record.materials),
    blackboardDesign: readString(record.blackboardDesign),
    adjustmentTips: readStringArray(record.adjustmentTips)
  };
}

function coerceSlideOutline(
  record: JsonRecord,
  common: ReturnType<typeof readBase>["common"]
): SlideOutlineArtifact {
  const contentDirection = readSlideContentDirection(record.contentDirection);
  const stylePreset = readSlideStylePreset(record.stylePreset);
  const templateId = readSlideStylePreset(record.templateId) || stylePreset;
  const slides = readRecords(record.slides).map((item, index) => ({
    page: readNumber(item.page, index + 1),
    title: readString(item.title),
    layout: readString(item.layout),
    layoutVariant: readSlideLayoutVariant(item.layoutVariant),
    points: readStringArray(item.points),
    detail: readString(item.detail),
    examples: readStringArray(item.examples),
    visualSuggestion: readString(item.visualSuggestion),
    interactionPrompt: readString(item.interactionPrompt),
    teacherNotes: readString(item.teacherNotes),
    teacherScript: readString(item.teacherScript)
  }));

  if (slides.length === 0) throw new Error("课件大纲缺少 slides。");

  return {
    ...common,
    moduleId: "slide-outline",
    theme: readString(record.theme),
    contentDirection,
    stylePreset,
    templateId,
    slides,
    transitionLines: readStringArray(record.transitionLines),
    extensionTasks: readStringArray(record.extensionTasks)
  };
}

function coerceQuizBuilder(
  record: JsonRecord,
  common: ReturnType<typeof readBase>["common"]
): QuizBuilderArtifact {
  const questions = readRecords(record.questions).map((item, index) => ({
    id: readString(item.id) || `Q${index + 1}`,
    type: readString(item.type),
    stem: readString(item.stem),
    options: readStringArray(item.options),
    answer: readString(item.answer),
    analysis: readString(item.analysis),
    score: readNumber(item.score, 0),
    scoringPoints: readStringArray(item.scoringPoints),
    knowledgePoint: readOptionalString(item.knowledgePoint),
    difficulty: readOptionalString(item.difficulty),
    cognitiveLevel: readOptionalString(item.cognitiveLevel),
    diagnosticTag: readOptionalString(item.diagnosticTag),
    estimatedMinutes: readOptionalNumber(item.estimatedMinutes)
  }));

  if (questions.length === 0) throw new Error("试题组卷缺少 questions。");

  const reviewSummaryRecord = isRecord(record.reviewSummary) ? record.reviewSummary : undefined;
  const reviewSummary = reviewSummaryRecord
    ? {
        totalQuestions: readNumber(reviewSummaryRecord.totalQuestions, questions.length),
        totalScore: readNumber(
          reviewSummaryRecord.totalScore,
          questions.reduce((sum, question) => sum + question.score, 0)
        ),
        estimatedMinutes: readNumber(
          reviewSummaryRecord.estimatedMinutes,
          questions.reduce((sum, question) => sum + (question.estimatedMinutes || 0), 0)
        ),
        coverageStatus: readString(reviewSummaryRecord.coverageStatus)
      }
    : undefined;

  return {
    ...common,
    moduleId: "quiz-builder",
    blueprint: readRecords(record.blueprint).map((item) => ({
      questionType: readString(item.questionType),
      count: readNumber(item.count, 0),
      score: readNumber(item.score, 0),
      difficulty: readString(item.difficulty),
      knowledgePoint: readOptionalString(item.knowledgePoint),
      objective: readOptionalString(item.objective)
    })),
    questions,
    coverageMatrix: readRecords(record.coverageMatrix).map((item) => ({
      knowledgePoint: readString(item.knowledgePoint),
      objective: readString(item.objective),
      questionIds: readStringArray(item.questionIds),
      difficulty: readString(item.difficulty)
    })),
    reviewSummary,
    diagnosisSuggestions: readStringArray(record.diagnosisSuggestions)
  };
}

function coerceHomeworkFeedback(
  record: JsonRecord,
  common: ReturnType<typeof readBase>["common"]
): HomeworkFeedbackArtifact {
  const assignmentContextRecord = isRecord(record.assignmentContext)
    ? record.assignmentContext
    : undefined;
  const assignmentContext = assignmentContextRecord
    ? {
        taskDescription: readString(assignmentContextRecord.taskDescription),
        expectedEvidence: readStringArray(assignmentContextRecord.expectedEvidence),
        feedbackFocus: readStringArray(assignmentContextRecord.feedbackFocus)
      }
    : undefined;
  const rubric = readRecords(record.rubric).map((item) => ({
    dimension: readString(item.dimension),
    excellent: readString(item.excellent),
    qualified: readString(item.qualified),
    needsImprovement: readString(item.needsImprovement)
  }));
  const diagnosticSummaryRecord = isRecord(record.diagnosticSummary)
    ? record.diagnosticSummary
    : undefined;
  const diagnosticSummary = diagnosticSummaryRecord
    ? {
        overallLevel: readString(diagnosticSummaryRecord.overallLevel),
        classStrengths: readStringArray(diagnosticSummaryRecord.classStrengths),
        commonMisconceptions: readStringArray(diagnosticSummaryRecord.commonMisconceptions),
        nextLessonFocus: readStringArray(diagnosticSummaryRecord.nextLessonFocus)
      }
    : undefined;
  const groupedFeedback = readRecords(record.groupedFeedback).map((item) => ({
    group: readString(item.group),
    evidencePattern: readString(item.evidencePattern),
    teacherFeedback: readString(item.teacherFeedback),
    nextStep: readString(item.nextStep)
  }));
  const teacherActionChecklist = readStringArray(record.teacherActionChecklist);

  if (rubric.length === 0) throw new Error("作业反馈缺少 rubric。");

  return {
    ...common,
    moduleId: "homework-feedback",
    ...(assignmentContext &&
    (assignmentContext.taskDescription ||
      assignmentContext.expectedEvidence.length ||
      assignmentContext.feedbackFocus.length)
      ? { assignmentContext }
      : {}),
    rubric,
    ...(diagnosticSummary &&
    (diagnosticSummary.overallLevel ||
      diagnosticSummary.classStrengths.length ||
      diagnosticSummary.commonMisconceptions.length ||
      diagnosticSummary.nextLessonFocus.length)
      ? { diagnosticSummary }
      : {}),
    feedbackPhrases: readRecords(record.feedbackPhrases).map((item) => ({
      scenario: readString(item.scenario),
      phrase: readString(item.phrase)
    })),
    ...(groupedFeedback.length ? { groupedFeedback } : {}),
    improvementSuggestions: readStringArray(record.improvementSuggestions),
    classIssues: readStringArray(record.classIssues),
    ...(teacherActionChecklist.length ? { teacherActionChecklist } : {}),
    complianceNotes: readStringArray(record.complianceNotes)
  };
}

function readRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item === "number") return String(item);
      return "";
    })
    .filter(Boolean);
}

function readString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function readOptionalString(value: unknown) {
  const text = readString(value);
  return text || undefined;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readSlideStylePreset(value: unknown): SlideStylePreset | undefined {
  const preset = readString(value) as SlideStylePreset;
  return slideStylePresets.has(preset) ? preset : undefined;
}

function readSlideContentDirection(value: unknown): SlideContentDirection | undefined {
  const direction = readString(value);
  return isSlideContentDirection(direction) ? direction : undefined;
}

function readSlideLayoutVariant(value: unknown): SlideLayoutVariant | undefined {
  const variant = readString(value) as SlideLayoutVariant;
  return slideLayoutVariants.has(variant) ? variant : undefined;
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
