import assert from "node:assert/strict";
import test from "node:test";
import { defaultCourseProfile } from "@/lib/agent/modules";
import { buildAgentMessages, getModuleIds } from "@/lib/agent/prompts";
import {
  getAiProtocol,
  getAnthropicMessagesUrl,
  getChatCompletionsUrl,
  getMissingAiEnv
} from "@/lib/agent/openai";

test("builds messages for every module", () => {
  for (const moduleId of getModuleIds()) {
    const messages = buildAgentMessages({
      moduleId,
      courseProfile: defaultCourseProfile,
      extraInput: "请体现课堂互动。",
      generationOptions: { outputMode: "artifact-v1" }
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "system");
    assert.match(messages[1].content, new RegExp(defaultCourseProfile.topic));
    assert.match(messages[1].content, /artifact-v1/);
    assert.match(messages[1].content, /严格 JSON/);
    assert.match(messages[1].content, /800 个中文字符以内/);
    assert.match(messages[1].content, /内容锚点（最高优先级）/);
    assert.match(messages[1].content, /不得从学习对象字段里的旧学科词汇扩展出另一门课/);
    assert.match(messages[1].content, new RegExp(`"moduleId": "${moduleId}"`));
    assert.match(messages[1].content, /教师二次调整建议/);
    assert.doesNotMatch(messages[1].content, /Markdown 表格/);
  }
});

test("slide outline prompt requires html-ppt style metadata", () => {
  const messages = buildAgentMessages({
    moduleId: "slide-outline",
    courseProfile: defaultCourseProfile,
    extraInput: "希望课件视觉不要单调。",
    generationOptions: { outputMode: "artifact-v1" }
  });
  const prompt = messages[1].content;

  assert.match(prompt, /html-ppt skill/);
  assert.match(prompt, /contentDirection/);
  assert.match(prompt, /stylePreset/);
  assert.match(prompt, /templateId/);
  assert.match(prompt, /layoutVariant/);
  assert.match(prompt, /detail/);
  assert.match(prompt, /examples/);
  assert.match(prompt, /teacherScript/);
  assert.match(prompt, /course-module \| academic-paper \| corporate-clean \| tokyo-night \| blueprint/);
  assert.match(prompt, /case-inquiry/);
  assert.match(prompt, /至少混合 3 种 layoutVariant/);
  assert.match(prompt, /8-12 页/);
  assert.match(prompt, /points 写 3-5 条/);
  assert.match(prompt, /detail 写 80-140 字/);
  assert.match(prompt, /teacherScript 写 80-160 字/);
});

test("slide outline prompt includes teacher selected preferences", () => {
  const messages = buildAgentMessages({
    moduleId: "slide-outline",
    courseProfile: defaultCourseProfile,
    slidePreferences: {
      contentDirection: "activity-co-creation",
      stylePreset: "blueprint"
    },
    generationOptions: { outputMode: "artifact-v1" }
  });
  const prompt = messages[1].content;

  assert.match(prompt, /课件生成偏好/);
  assert.match(prompt, /活动共创/);
  assert.match(prompt, /contentDirection=activity-co-creation/);
  assert.match(prompt, /stylePreset=blueprint/);
  assert.match(prompt, /templateId=blueprint/);
  assert.match(prompt, /必须把 stylePreset 和 templateId 都输出为 blueprint/);
  assert.match(prompt, /活动共创要强化任务步骤/);
});

test("quiz builder prompt includes teacher selected quiz preferences", () => {
  const messages = buildAgentMessages({
    moduleId: "quiz-builder",
    courseProfile: defaultCourseProfile,
    quizPreferences: {
      assessmentPurpose: "pre-class-diagnostic",
      questionCount: 6,
      questionTypes: ["single-choice", "case-analysis"],
      difficultyMix: "foundation"
    },
    generationOptions: { outputMode: "artifact-v1" }
  });
  const prompt = messages[1].content;

  assert.match(prompt, /试题生成偏好/);
  assert.match(prompt, /课前诊断/);
  assert.match(prompt, /assessmentPurpose=pre-class-diagnostic/);
  assert.match(prompt, /共 6 题/);
  assert.match(prompt, /questions.length 必须等于 6/);
  assert.match(prompt, /单项选择题、案例分析题/);
  assert.doesNotMatch(prompt, /简答题；不得输出未选择题型/);
  assert.match(prompt, /基础巩固/);
  assert.match(prompt, /difficultyMix=foundation/);
  assert.match(prompt, /coverageMatrix/);
  assert.match(prompt, /reviewSummary/);
});

test("homework feedback prompt requires class feedback loop metadata", () => {
  const messages = buildAgentMessages({
    moduleId: "homework-feedback",
    courseProfile: defaultCourseProfile,
    extraInput: "学生作业中 getter/setter 使用比较机械。",
    generationOptions: { outputMode: "artifact-v1" }
  });
  const prompt = messages[1].content;

  assert.match(prompt, /assignmentContext/);
  assert.match(prompt, /diagnosticSummary/);
  assert.match(prompt, /groupedFeedback/);
  assert.match(prompt, /teacherActionChecklist/);
  assert.match(prompt, /rubric 至少 3 个维度/);
  assert.match(prompt, /feedbackPhrases 至少 4 条/);
  assert.match(prompt, /2-4 组/);
  assert.match(prompt, /班级优势、共性误区和下一课处理重点/);
  assert.match(prompt, /隐私保护和发展性评价/);
});

test("normalizes chat completions url", () => {
  assert.equal(
    getChatCompletionsUrl("https://example.com/v1/"),
    "https://example.com/v1/chat/completions"
  );
});

test("normalizes anthropic messages url", () => {
  assert.equal(
    getAnthropicMessagesUrl("https://api.deepseek.com/"),
    "https://api.deepseek.com/v1/messages"
  );
  assert.equal(
    getAnthropicMessagesUrl("https://api.deepseek.com/v1"),
    "https://api.deepseek.com/v1/messages"
  );
});

test("detects ai protocol", () => {
  assert.equal(getAiProtocol({ AI_PROTOCOL: "anthropic" }), "anthropic");
  assert.equal(getAiProtocol({ AI_PROTOCOL: "openai" }), "openai");
  assert.equal(getAiProtocol({}), "openai");
});

test("reports missing env keys", () => {
  assert.deepEqual(getMissingAiEnv({ AI_BASE_URL: "https://api", AI_MODEL: "model" }), [
    "AI_API_KEY"
  ]);
});
