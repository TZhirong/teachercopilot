import type { HomeworkFeedbackArtifact } from "@/types/agent";

export type HomeworkFeedbackReviewSeverity = "info" | "warning" | "error";

export interface HomeworkFeedbackReviewItem {
  id: string;
  label: string;
  target: string;
  detail: string;
  passed: boolean;
  severity: HomeworkFeedbackReviewSeverity;
}

export interface HomeworkFeedbackReviewMetrics {
  rubricDimensions: number;
  phraseCount: number;
  groupCount: number;
  actionCount: number;
  complianceCount: number;
}

export interface HomeworkFeedbackReview {
  status: "ready" | "needs-review";
  metrics: HomeworkFeedbackReviewMetrics;
  items: HomeworkFeedbackReviewItem[];
  warnings: HomeworkFeedbackReviewItem[];
}

export function buildHomeworkFeedbackReview(
  artifact: HomeworkFeedbackArtifact
): HomeworkFeedbackReview {
  const groupedFeedback = artifact.groupedFeedback || [];
  const teacherActions = artifact.teacherActionChecklist || [];
  const metrics: HomeworkFeedbackReviewMetrics = {
    rubricDimensions: artifact.rubric.length,
    phraseCount: artifact.feedbackPhrases.length,
    groupCount: groupedFeedback.length,
    actionCount: teacherActions.length,
    complianceCount: artifact.complianceNotes.length
  };

  const items: HomeworkFeedbackReviewItem[] = [
    createReviewItem({
      id: "assignment-context",
      label: "作业情境",
      target: "写清作业任务、评价证据和反馈关注点",
      passed:
        Boolean(artifact.assignmentContext?.taskDescription.trim()) &&
        Boolean(artifact.assignmentContext?.expectedEvidence.length) &&
        Boolean(artifact.assignmentContext?.feedbackFocus.length),
      severity: "warning",
      detail: artifact.assignmentContext?.taskDescription || "缺少作业任务与评价证据说明。"
    }),
    createReviewItem({
      id: "rubric-depth",
      label: "量规完整",
      target: "至少 3 个维度，且每个维度有优秀/合格/待改进标准",
      passed:
        artifact.rubric.length >= 3 &&
        artifact.rubric.every(
          (item) =>
            Boolean(item.dimension.trim()) &&
            Boolean(item.excellent.trim()) &&
            Boolean(item.qualified.trim()) &&
            Boolean(item.needsImprovement.trim())
        ),
      severity: "error",
      detail: `当前 ${artifact.rubric.length} 个量规维度。`
    }),
    createReviewItem({
      id: "diagnostic-summary",
      label: "班级诊断",
      target: "包含班级优势、共性误区和下一课处理重点",
      passed:
        Boolean(artifact.diagnosticSummary?.classStrengths.length) &&
        Boolean(artifact.diagnosticSummary?.commonMisconceptions.length) &&
        Boolean(artifact.diagnosticSummary?.nextLessonFocus.length),
      severity: "warning",
      detail: artifact.diagnosticSummary?.overallLevel || "缺少班级层面的诊断摘要。"
    }),
    createReviewItem({
      id: "feedback-phrases",
      label: "反馈语库",
      target: "至少 4 条可直接使用的反馈语",
      passed:
        artifact.feedbackPhrases.length >= 4 &&
        artifact.feedbackPhrases.every(
          (item) => Boolean(item.scenario.trim()) && Boolean(item.phrase.trim())
        ),
      severity: "warning",
      detail: `当前 ${artifact.feedbackPhrases.length} 条反馈语。`
    }),
    createReviewItem({
      id: "grouped-feedback",
      label: "分层反馈",
      target: "2-4 组表现类型，每组有证据表现、反馈语和下一步任务",
      passed:
        groupedFeedback.length >= 2 &&
        groupedFeedback.length <= 4 &&
        groupedFeedback.every(
          (item) =>
            Boolean(item.group.trim()) &&
            Boolean(item.evidencePattern.trim()) &&
            Boolean(item.teacherFeedback.trim()) &&
            Boolean(item.nextStep.trim())
        ),
      severity: "warning",
      detail: `当前 ${groupedFeedback.length} 组分层反馈。`
    }),
    createReviewItem({
      id: "teacher-actions",
      label: "教师行动",
      target: "至少 2 条讲评、追问或二次批改动作",
      passed: teacherActions.length >= 2,
      severity: "warning",
      detail: `当前 ${teacherActions.length} 条教师行动建议。`
    }),
    createReviewItem({
      id: "compliance-notes",
      label: "合规提醒",
      target: "包含隐私保护或发展性反馈提醒",
      passed:
        artifact.complianceNotes.length > 0 &&
        artifact.complianceNotes.some((item) => /隐私|匿名|姓名|去标识|发展性|鼓励/u.test(item)),
      severity: "warning",
      detail: artifact.complianceNotes.length
        ? `当前 ${artifact.complianceNotes.length} 条合规提醒。`
        : "缺少学生隐私与发展性评价提醒。"
    })
  ];
  const warnings = items.filter((item) => !item.passed);

  return {
    status: warnings.length ? "needs-review" : "ready",
    metrics,
    items,
    warnings
  };
}

function createReviewItem(input: HomeworkFeedbackReviewItem) {
  return input;
}
