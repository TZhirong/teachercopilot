import type { QuizBuilderArtifact } from "@/types/agent";

export type QuizReviewSeverity = "info" | "warning" | "error";

export interface QuizReviewItem {
  id: string;
  label: string;
  target: string;
  detail: string;
  passed: boolean;
  severity: QuizReviewSeverity;
}

export interface QuizReview {
  status: "ready" | "needs-review";
  totalQuestions: number;
  totalScore: number;
  estimatedMinutes: number;
  coverageCount: number;
  items: QuizReviewItem[];
  warnings: QuizReviewItem[];
}

export function buildQuizReview(artifact: QuizBuilderArtifact): QuizReview {
  const totalQuestions = artifact.questions.length;
  const totalScore = sum(artifact.questions.map((question) => question.score));
  const estimatedMinutes =
    artifact.reviewSummary?.estimatedMinutes ||
    sum(artifact.questions.map((question) => question.estimatedMinutes || 0));
  const coverageCount = new Set(
    artifact.questions
      .map((question) => question.knowledgePoint)
      .concat((artifact.coverageMatrix || []).map((item) => item.knowledgePoint))
      .map((item) => item?.trim())
      .filter(isNonEmptyString)
  ).size;
  const questionIds = artifact.questions.map((question) => question.id);
  const uniqueQuestionIds = new Set(questionIds);
  const blueprintCount = sum(artifact.blueprint.map((item) => item.count));
  const blueprintScore = sum(artifact.blueprint.map((item) => item.score));
  const coverageReferences = (artifact.coverageMatrix || []).flatMap((item) => item.questionIds);
  const knownIds = new Set(questionIds);

  const items: QuizReviewItem[] = [
    createReviewItem({
      id: "blueprint-count",
      label: "题量一致",
      target: "blueprint.count 合计 = questions.length",
      passed: blueprintCount === totalQuestions,
      severity: "error",
      detail: `蓝图 ${blueprintCount} 题，实际 ${totalQuestions} 题。`
    }),
    createReviewItem({
      id: "blueprint-score",
      label: "分值一致",
      target: "blueprint.score 合计 = questions.score 合计",
      passed: blueprintScore > 0 && blueprintScore === totalScore,
      severity: "error",
      detail: `蓝图 ${blueprintScore} 分，题目合计 ${totalScore} 分。`
    }),
    createReviewItem({
      id: "unique-question-ids",
      label: "题号唯一",
      target: "每道题拥有唯一 id",
      passed: uniqueQuestionIds.size === questionIds.length,
      severity: "error",
      detail:
        uniqueQuestionIds.size === questionIds.length
          ? "题号未重复。"
          : "存在重复题号，请复核题目顺序。"
    }),
    createReviewItem({
      id: "objective-options",
      label: "客观题完整",
      target: "选择题至少 3 个选项，答案对应选项",
      passed: artifact.questions.filter(isObjectiveQuestion).every(hasUsableObjectiveAnswer),
      severity: "warning",
      detail: "客观题需要有足够选项，并能从答案定位到选项。"
    }),
    createReviewItem({
      id: "answer-analysis",
      label: "答案解析完整",
      target: "每题都有答案、解析和评分点",
      passed: artifact.questions.every(
        (question) =>
          Boolean(question.answer.trim()) &&
          Boolean(question.analysis.trim()) &&
          question.scoringPoints.length > 0
      ),
      severity: "warning",
      detail: "答案、解析和评分点用于教师复核与学生自查。"
    }),
    createReviewItem({
      id: "knowledge-coverage",
      label: "知识点覆盖",
      target: "每题标注 knowledgePoint，coverageMatrix 引用真实题号",
      passed:
        coverageCount > 0 &&
        artifact.questions.every((question) => Boolean(question.knowledgePoint?.trim())) &&
        coverageReferences.length > 0 &&
        coverageReferences.every((id) => knownIds.has(id)),
      severity: "warning",
      detail: `当前识别到 ${coverageCount} 个覆盖点。`
    })
  ];
  const warnings = items.filter((item) => !item.passed);

  return {
    status: warnings.length ? "needs-review" : "ready",
    totalQuestions,
    totalScore,
    estimatedMinutes,
    coverageCount,
    items,
    warnings
  };
}

function createReviewItem(input: Omit<QuizReviewItem, "detail"> & { detail: string }) {
  return input;
}

function isObjectiveQuestion(question: QuizBuilderArtifact["questions"][number]) {
  return question.options.length > 0 || /选择|单选|客观/u.test(question.type);
}

function hasUsableObjectiveAnswer(question: QuizBuilderArtifact["questions"][number]) {
  if (question.options.length < 3) return false;
  const optionLabels = new Set(
    question.options
      .map((option) => option.trim().match(/^([A-H])[\s.、．]/iu)?.[1]?.toUpperCase())
      .filter(isNonEmptyString)
  );
  if (!optionLabels.size) return Boolean(question.answer.trim());

  const answerLabels = Array.from(question.answer.matchAll(/\b([A-H])\b/giu))
    .map((match) => match[1]?.toUpperCase())
    .filter(isNonEmptyString);
  if (!answerLabels.length) {
    return question.options.some((option) => option.includes(question.answer.trim()));
  }
  return answerLabels.every((label) => optionLabels.has(label));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
