import type {
  QuizAssessmentPurpose,
  QuizDifficultyMix,
  QuizGenerationPreferences,
  QuizQuestionType
} from "@/types/agent";

export const quizAssessmentPurposeOptions: Array<{
  id: QuizAssessmentPurpose;
  label: string;
  summary: string;
  promptGuidance: string;
}> = [
  {
    id: "pre-class-diagnostic",
    label: "课前诊断",
    summary: "摸底基础、暴露先修缺口",
    promptGuidance:
      "优先检测先修概念、关键误区和学习准备度，诊断建议要指向课前补救或导入调整。"
  },
  {
    id: "in-class-check",
    label: "课堂形成性",
    summary: "即时检测、边教边评",
    promptGuidance:
      "题目要短而聚焦，适合课堂即时作答，诊断建议要能支持教师当堂追问或重讲。"
  },
  {
    id: "after-class-consolidation",
    label: "课后巩固",
    summary: "复盘重点、迁移应用",
    promptGuidance:
      "覆盖本课核心知识点、易错边界和迁移应用，答案解析要帮助学生课后自查。"
  },
  {
    id: "unit-assessment",
    label: "单元测验",
    summary: "综合考查、区分水平",
    promptGuidance:
      "题目要形成基础到挑战的梯度，覆盖理解、应用和分析层级，评分点要更细。"
  }
];

export const quizDifficultyMixOptions: Array<{
  id: QuizDifficultyMix;
  label: string;
  summary: string;
  promptGuidance: string;
}> = [
  {
    id: "foundation",
    label: "基础巩固",
    summary: "基础约 70%，中等约 30%",
    promptGuidance: "基础题为主，少量中等题用于检查迁移，不设置高压挑战题。"
  },
  {
    id: "balanced",
    label: "均衡难度",
    summary: "基础/中等/挑战约 4:4:2",
    promptGuidance: "保持基础、中等和挑战题的合理梯度，挑战题不超过总题量的 25%。"
  },
  {
    id: "challenge",
    label: "挑战提升",
    summary: "中等与挑战占主导",
    promptGuidance: "增加案例分析、综合判断和迁移题，但仍保留必要基础题作为入口。"
  }
];

export const quizQuestionTypeOptions: Array<{
  id: QuizQuestionType;
  label: string;
  summary: string;
  promptLabel: string;
}> = [
  {
    id: "single-choice",
    label: "单选",
    summary: "快速判断概念与误区",
    promptLabel: "单项选择题"
  },
  {
    id: "short-answer",
    label: "简答",
    summary: "解释概念、说明理由",
    promptLabel: "简答题"
  },
  {
    id: "case-analysis",
    label: "案例",
    summary: "课堂情境与迁移分析",
    promptLabel: "案例分析题"
  }
];

export const defaultQuizGenerationPreferences: QuizGenerationPreferences = {
  assessmentPurpose: "after-class-consolidation",
  questionCount: 8,
  questionTypes: ["single-choice", "short-answer", "case-analysis"],
  difficultyMix: "balanced"
};

const quizAssessmentPurposeIds = new Set(quizAssessmentPurposeOptions.map((option) => option.id));
const quizDifficultyMixIds = new Set(quizDifficultyMixOptions.map((option) => option.id));
const quizQuestionTypeIds = new Set(quizQuestionTypeOptions.map((option) => option.id));

export function getQuizAssessmentPurposeOption(id: QuizAssessmentPurpose) {
  return (
    quizAssessmentPurposeOptions.find((option) => option.id === id) ||
    quizAssessmentPurposeOptions[2]
  );
}

export function getQuizDifficultyMixOption(id: QuizDifficultyMix) {
  return quizDifficultyMixOptions.find((option) => option.id === id) || quizDifficultyMixOptions[1];
}

export function getQuizQuestionTypeOption(id: QuizQuestionType) {
  return quizQuestionTypeOptions.find((option) => option.id === id) || quizQuestionTypeOptions[0];
}

export function coerceQuizGenerationPreferences(input: unknown): QuizGenerationPreferences {
  if (!isRecord(input)) return { ...defaultQuizGenerationPreferences };

  const assessmentPurpose = isQuizAssessmentPurpose(input.assessmentPurpose)
    ? input.assessmentPurpose
    : defaultQuizGenerationPreferences.assessmentPurpose;
  const difficultyMix = isQuizDifficultyMix(input.difficultyMix)
    ? input.difficultyMix
    : defaultQuizGenerationPreferences.difficultyMix;
  const questionCount = clampQuestionCount(input.questionCount);
  const questionTypes = Array.isArray(input.questionTypes)
    ? input.questionTypes.filter(isQuizQuestionType)
    : defaultQuizGenerationPreferences.questionTypes;

  return {
    assessmentPurpose,
    questionCount,
    questionTypes: questionTypes.length ? uniqueQuestionTypes(questionTypes) : defaultQuizGenerationPreferences.questionTypes,
    difficultyMix
  };
}

export function isQuizAssessmentPurpose(value: unknown): value is QuizAssessmentPurpose {
  return (
    typeof value === "string" &&
    quizAssessmentPurposeIds.has(value as QuizAssessmentPurpose)
  );
}

export function isQuizDifficultyMix(value: unknown): value is QuizDifficultyMix {
  return typeof value === "string" && quizDifficultyMixIds.has(value as QuizDifficultyMix);
}

export function isQuizQuestionType(value: unknown): value is QuizQuestionType {
  return typeof value === "string" && quizQuestionTypeIds.has(value as QuizQuestionType);
}

function clampQuestionCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return defaultQuizGenerationPreferences.questionCount;
  return Math.max(3, Math.min(20, Math.round(parsed)));
}

function uniqueQuestionTypes(questionTypes: QuizQuestionType[]) {
  return quizQuestionTypeOptions
    .map((option) => option.id)
    .filter((id) => questionTypes.includes(id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
