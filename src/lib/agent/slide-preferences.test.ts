import assert from "node:assert/strict";
import test from "node:test";
import { defaultCourseProfile } from "@/lib/agent/modules";
import {
  coerceSlideGenerationPreferences,
  recommendSlideStylePreset
} from "@/lib/agent/slide-preferences";

test("recommends tokyo-night for Java and AI courses", () => {
  assert.equal(
    recommendSlideStylePreset({
      ...defaultCourseProfile,
      courseName: "Java 程序设计",
      topic: "封装与访问控制"
    }),
    "tokyo-night"
  );
  assert.equal(
    recommendSlideStylePreset({
      ...defaultCourseProfile,
      courseName: "人工智能导论",
      topic: "机器学习模型评估"
    }),
    "tokyo-night"
  );
});

test("recommends blueprint for architecture and process courses", () => {
  assert.equal(
    recommendSlideStylePreset({
      ...defaultCourseProfile,
      topic: "教学系统设计流程与模块关系"
    }),
    "blueprint"
  );
});

test("recommends academic-paper for research and theory courses", () => {
  assert.equal(
    recommendSlideStylePreset({
      ...defaultCourseProfile,
      topic: "学习动机理论与文献研究"
    }),
    "academic-paper"
  );
});

test("falls back to course-module for regular teaching topics", () => {
  assert.equal(recommendSlideStylePreset(defaultCourseProfile), "course-module");
});

test("coerces slide generation preferences with course-aware defaults", () => {
  assert.deepEqual(
    coerceSlideGenerationPreferences(
      {
        contentDirection: "assessment-consolidation",
        stylePreset: "corporate-clean"
      },
      defaultCourseProfile
    ),
    {
      contentDirection: "assessment-consolidation",
      stylePreset: "corporate-clean"
    }
  );

  assert.deepEqual(
    coerceSlideGenerationPreferences({ contentDirection: "bad", stylePreset: "bad" }, {
      ...defaultCourseProfile,
      courseName: "Python 编程基础"
    }),
    {
      contentDirection: "case-inquiry",
      stylePreset: "tokyo-night"
    }
  );
});
