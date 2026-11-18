import assert from "node:assert/strict";
import test from "node:test";
import {
  coerceQuizGenerationPreferences,
  defaultQuizGenerationPreferences
} from "@/lib/agent/quiz-preferences";

test("coerces quiz generation preferences with safe defaults", () => {
  assert.deepEqual(coerceQuizGenerationPreferences(undefined), defaultQuizGenerationPreferences);

  assert.deepEqual(
    coerceQuizGenerationPreferences({
      assessmentPurpose: "unit-assessment",
      questionCount: 99,
      questionTypes: ["case-analysis", "bad", "single-choice"],
      difficultyMix: "challenge"
    }),
    {
      assessmentPurpose: "unit-assessment",
      questionCount: 20,
      questionTypes: ["single-choice", "case-analysis"],
      difficultyMix: "challenge"
    }
  );

  assert.deepEqual(
    coerceQuizGenerationPreferences({
      assessmentPurpose: "bad",
      questionCount: 1,
      questionTypes: [],
      difficultyMix: "bad"
    }),
    {
      ...defaultQuizGenerationPreferences,
      questionCount: 3
    }
  );
});
