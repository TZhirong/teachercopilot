import assert from "node:assert/strict";
import test from "node:test";
import { buildSlideDeckReview } from "@/lib/agent/slide-review";
import type { SlideLayoutVariant, SlideOutlineArtifact } from "@/types/agent";

const variants: SlideLayoutVariant[] = [
  "case-card",
  "objectives",
  "matrix",
  "process",
  "two-column",
  "activity",
  "card-list",
  "summary"
];

test("rich slide artifact passes the main deck review checks", () => {
  const review = buildSlideDeckReview(buildRichArtifact());

  assert.equal(review.status, "ready");
  assert.equal(review.pageCount, 8);
  assert.equal(review.variantCount >= 3, true);
  assert.equal(review.readyCount, review.totalCount);
  assert.deepEqual(review.warnings, []);
});

test("sparse slide artifact reports actionable warnings", () => {
  const artifact = buildRichArtifact({
    slides: [
      {
        ...makeSlide(1, "case-card"),
        points: ["问题导入"],
        detail: "太短",
        examples: [],
        interactionPrompt: "",
        teacherScript: ""
      },
      {
        ...makeSlide(2, "case-card"),
        detail: "",
        examples: [],
        teacherScript: "偏短"
      }
    ]
  });
  const review = buildSlideDeckReview(artifact);
  const warningIds = review.warnings.map((warning) => warning.id);

  assert.equal(review.status, "warning");
  assert.ok(warningIds.includes("page-count"));
  assert.ok(warningIds.includes("layout-variety"));
  assert.ok(warningIds.includes("points-density"));
  assert.ok(warningIds.includes("detail-density"));
  assert.ok(warningIds.includes("examples-coverage"));
  assert.ok(warningIds.includes("interaction-coverage"));
  assert.ok(warningIds.includes("teacher-script-density"));
});

test("legacy slide artifact without rich fields stays reviewable", () => {
  const artifact = buildRichArtifact({
    slides: [
      {
        page: 1,
        title: "旧课件页面",
        layout: "旧版式",
        points: ["旧要点"],
        visualSuggestion: "旧视觉建议",
        interactionPrompt: "",
        teacherNotes: ""
      }
    ]
  });
  const review = buildSlideDeckReview(artifact);

  assert.equal(review.status, "warning");
  assert.equal(review.pageCount, 1);
  assert.equal(review.warnings.length > 0, true);
});

function buildRichArtifact(
  overrides: Partial<SlideOutlineArtifact> = {}
): SlideOutlineArtifact {
  return {
    schemaVersion: "artifact-v1",
    moduleId: "slide-outline",
    title: "学习动机与课堂激励课件",
    markdownFallback: "## 学习动机与课堂激励课件",
    theme: "案例探究 · 教学模块",
    contentDirection: "case-inquiry",
    stylePreset: "course-module",
    templateId: "course-module",
    slides: variants.map((variant, index) => makeSlide(index + 1, variant)),
    transitionLines: ["从课堂问题进入理论解释。", "从理论解释回到教学设计。"],
    extensionTasks: ["观察一次真实课堂中的动机线索。"],
    ...overrides
  };
}

function makeSlide(page: number, layoutVariant: SlideLayoutVariant) {
  return {
    page,
    title: `第 ${page} 页教学主题`,
    layout: "结构化课件页面",
    layoutVariant,
    points: ["识别课堂现象", "解释动机原因", "选择教学策略"],
    detail:
      "本页围绕一个真实课堂场景展开，引导学生先观察行为证据，再联系学习动机理论作出解释，最后形成可以落地的教学策略判断。教师可以把学生回答分成事实、推测和策略三层，帮助课堂讨论逐步收束。",
    examples: ["学生不愿公开回答问题，可能与失败归因和课堂安全感有关。"],
    visualSuggestion: "用案例卡片和理论标签组合呈现。",
    interactionPrompt: "如果你是任课教师，会先追问学生哪个问题？",
    teacherNotes: "先让学生独立判断，再组织同伴互评。",
    teacherScript:
      "这一页请先呈现课堂片段，不要急着给出理论答案。让学生用自己的话解释行为原因，再逐步把解释连接到学习动机理论和教学策略。最后请追问策略能否被观察验证，让学生意识到教学设计需要证据闭环。"
  };
}
