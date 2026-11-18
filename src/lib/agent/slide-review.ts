import { resolveSlideLayoutVariant } from "@/lib/export/pptx-style";
import type { SlideLayoutVariant, SlideOutlineArtifact } from "@/types/agent";

export type SlideReviewStatus = "ready" | "warning";

export interface SlideReviewCheck {
  id: string;
  label: string;
  status: SlideReviewStatus;
  value: string;
  target: string;
  detail: string;
  slidePages: number[];
}

export interface SlideDeckReview {
  status: SlideReviewStatus;
  pageCount: number;
  variantCount: number;
  variantLabels: SlideLayoutVariant[];
  readyCount: number;
  totalCount: number;
  checks: SlideReviewCheck[];
  warnings: SlideReviewCheck[];
}

const reviewRules = {
  minPages: 8,
  minLayoutVariants: 3,
  minPoints: 3,
  minDetailChars: 60,
  minExamples: 1,
  minTeacherScriptChars: 60
};

export function buildSlideDeckReview(artifact: SlideOutlineArtifact): SlideDeckReview {
  const slides = artifact.slides || [];
  const variants = slides.map((slide, index) =>
    resolveSlideLayoutVariant(slide, index, slides.length)
  );
  const variantLabels = Array.from(new Set(variants));

  const checks: SlideReviewCheck[] = [
    {
      id: "page-count",
      label: "页数完整度",
      status: slides.length >= reviewRules.minPages ? "ready" : "warning",
      value: `${slides.length} 页`,
      target: `建议 >= ${reviewRules.minPages} 页`,
      detail:
        slides.length >= reviewRules.minPages
          ? "页数适合常规 90 分钟课程。"
          : "页数偏少，可能更像提纲而不是可直接授课课件。",
      slidePages: []
    },
    {
      id: "layout-variety",
      label: "版式丰富度",
      status: variantLabels.length >= reviewRules.minLayoutVariants ? "ready" : "warning",
      value: `${variantLabels.length} 种`,
      target: `至少 ${reviewRules.minLayoutVariants} 种版式`,
      detail:
        variantLabels.length >= reviewRules.minLayoutVariants
          ? "整套课件已有明显版式变化。"
          : "版式变化不足，容易让课件显得单调。",
      slidePages: []
    },
    buildCoverageCheck({
      id: "points-density",
      label: "要点密度",
      slides,
      target: `每页 >= ${reviewRules.minPoints} 条`,
      readyDetail: "每页都有足够的课堂可见要点。",
      warningDetail: "部分页面要点偏少，建议补充学生可见内容。",
      isReady: (slide) => slide.points.filter(Boolean).length >= reviewRules.minPoints
    }),
    buildCoverageCheck({
      id: "detail-density",
      label: "讲解正文",
      slides,
      target: `每页 >= ${reviewRules.minDetailChars} 字`,
      readyDetail: "每页讲解正文足够支撑授课。",
      warningDetail: "部分页面讲解正文偏短，教师需要额外补充。",
      isReady: (slide) => charCount(slide.detail) >= reviewRules.minDetailChars
    }),
    buildCoverageCheck({
      id: "examples-coverage",
      label: "案例覆盖",
      slides,
      target: `每页 >= ${reviewRules.minExamples} 个案例`,
      readyDetail: "每页都有案例或例子支撑理解。",
      warningDetail: "部分页面缺少案例，课堂迁移感会偏弱。",
      isReady: (slide) => (slide.examples || []).filter(Boolean).length >= reviewRules.minExamples
    }),
    buildCoverageCheck({
      id: "interaction-coverage",
      label: "互动提示",
      slides,
      target: "每页有互动问题",
      readyDetail: "每页都有可直接抛给学生的问题。",
      warningDetail: "部分页面缺少互动提示，课堂参与点不足。",
      isReady: (slide) => charCount(slide.interactionPrompt) > 0
    }),
    buildCoverageCheck({
      id: "teacher-script-density",
      label: "讲稿备注",
      slides,
      target: `每页 >= ${reviewRules.minTeacherScriptChars} 字`,
      readyDetail: "每页都有较完整的教师讲稿备注。",
      warningDetail: "部分页面讲稿备注偏短，备注视图支持不足。",
      isReady: (slide) => charCount(slide.teacherScript) >= reviewRules.minTeacherScriptChars
    })
  ];

  const warnings = checks.filter((check) => check.status === "warning");

  return {
    status: warnings.length ? "warning" : "ready",
    pageCount: slides.length,
    variantCount: variantLabels.length,
    variantLabels,
    readyCount: checks.length - warnings.length,
    totalCount: checks.length,
    checks,
    warnings
  };
}

function buildCoverageCheck({
  id,
  isReady,
  label,
  readyDetail,
  slides,
  target,
  warningDetail
}: {
  id: string;
  isReady: (slide: SlideOutlineArtifact["slides"][number]) => boolean;
  label: string;
  readyDetail: string;
  slides: SlideOutlineArtifact["slides"];
  target: string;
  warningDetail: string;
}) {
  const failedPages = slides
    .filter((slide) => !isReady(slide))
    .map((slide) => slide.page)
    .filter((page) => Number.isFinite(page));

  return {
    id,
    label,
    status: failedPages.length ? "warning" : "ready",
    value: failedPages.length ? `${failedPages.length} 页待补` : "已覆盖",
    target,
    detail: failedPages.length ? warningDetail : readyDetail,
    slidePages: failedPages
  } satisfies SlideReviewCheck;
}

function charCount(value: string | undefined) {
  return Array.from((value || "").trim()).length;
}
