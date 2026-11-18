export type ModuleId =
  | "knowledge-map"
  | "lesson-plan"
  | "slide-outline"
  | "quiz-builder"
  | "homework-feedback";

export interface CourseProfile {
  courseName: string;
  topic: string;
  learnerProfile: string;
  classDuration: string;
  teachingGoals: string;
  existingMaterials: string;
  constraints: string;
}

export interface GenerationOptions {
  temperature?: number;
  outputMode?: "artifact-v1";
}

export type QuizAssessmentPurpose =
  | "pre-class-diagnostic"
  | "in-class-check"
  | "after-class-consolidation"
  | "unit-assessment";

export type QuizDifficultyMix = "foundation" | "balanced" | "challenge";

export type QuizQuestionType = "single-choice" | "short-answer" | "case-analysis";

export interface QuizGenerationPreferences {
  assessmentPurpose: QuizAssessmentPurpose;
  questionCount: number;
  questionTypes: QuizQuestionType[];
  difficultyMix: QuizDifficultyMix;
}

export type SlideContentDirection =
  | "case-inquiry"
  | "concept-teaching"
  | "activity-co-creation"
  | "assessment-consolidation";

export interface SlideGenerationPreferences {
  contentDirection: SlideContentDirection;
  stylePreset: SlideStylePreset;
}

export interface AgentRequest {
  moduleId: ModuleId;
  courseProfile: CourseProfile;
  extraInput?: string;
  quizPreferences?: QuizGenerationPreferences;
  slidePreferences?: SlideGenerationPreferences;
  generationOptions?: GenerationOptions;
}

export interface KnowledgeMapArtifact {
  schemaVersion: "artifact-v1";
  moduleId: "knowledge-map";
  title: string;
  markdownFallback: string;
  nodes: Array<{
    id: string;
    label: string;
    level: number;
    summary: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    label: string;
  }>;
  prerequisites: Array<{
    title: string;
    detail: string;
  }>;
  keyPoints: Array<{
    type: string;
    title: string;
    strategy: string;
  }>;
  misconceptions: Array<{
    title: string;
    correction: string;
    prompt: string;
  }>;
  activities: Array<{
    title: string;
    steps: string[];
  }>;
}

export interface LessonPlanArtifact {
  schemaVersion: "artifact-v1";
  moduleId: "lesson-plan";
  title: string;
  markdownFallback: string;
  objectives: Array<{
    dimension: string;
    objective: string;
    evidence: string;
  }>;
  keyPoints: Array<{
    type: string;
    title: string;
    strategy: string;
  }>;
  timeline: Array<{
    phase: string;
    duration: string;
    teacherActions: string[];
    studentActions: string[];
    assessment: string;
  }>;
  materials: string[];
  blackboardDesign: string;
  adjustmentTips: string[];
}

export type SlideStylePreset =
  | "course-module"
  | "academic-paper"
  | "corporate-clean"
  | "tokyo-night"
  | "blueprint";

export type SlideLayoutVariant =
  | "cover"
  | "objectives"
  | "two-column"
  | "process"
  | "matrix"
  | "case-card"
  | "activity"
  | "summary"
  | "card-list";

export interface SlideOutlineArtifact {
  schemaVersion: "artifact-v1";
  moduleId: "slide-outline";
  title: string;
  markdownFallback: string;
  theme: string;
  contentDirection?: SlideContentDirection;
  stylePreset?: SlideStylePreset;
  templateId?: SlideStylePreset;
  slides: Array<{
    page: number;
    title: string;
    layout: string;
    layoutVariant?: SlideLayoutVariant;
    points: string[];
    detail?: string;
    examples?: string[];
    visualSuggestion: string;
    interactionPrompt: string;
    teacherNotes: string;
    teacherScript?: string;
  }>;
  transitionLines: string[];
  extensionTasks: string[];
}

export interface QuizBuilderArtifact {
  schemaVersion: "artifact-v1";
  moduleId: "quiz-builder";
  title: string;
  markdownFallback: string;
  blueprint: Array<{
    questionType: string;
    count: number;
    score: number;
    difficulty: string;
    knowledgePoint?: string;
    objective?: string;
  }>;
  questions: Array<{
    id: string;
    type: string;
    stem: string;
    options: string[];
    answer: string;
    analysis: string;
    score: number;
    scoringPoints: string[];
    knowledgePoint?: string;
    difficulty?: string;
    cognitiveLevel?: string;
    diagnosticTag?: string;
    estimatedMinutes?: number;
  }>;
  coverageMatrix?: Array<{
    knowledgePoint: string;
    objective: string;
    questionIds: string[];
    difficulty: string;
  }>;
  reviewSummary?: {
    totalQuestions: number;
    totalScore: number;
    estimatedMinutes: number;
    coverageStatus: string;
  };
  diagnosisSuggestions: string[];
}

export interface HomeworkFeedbackArtifact {
  schemaVersion: "artifact-v1";
  moduleId: "homework-feedback";
  title: string;
  markdownFallback: string;
  assignmentContext?: {
    taskDescription: string;
    expectedEvidence: string[];
    feedbackFocus: string[];
  };
  rubric: Array<{
    dimension: string;
    excellent: string;
    qualified: string;
    needsImprovement: string;
  }>;
  diagnosticSummary?: {
    overallLevel: string;
    classStrengths: string[];
    commonMisconceptions: string[];
    nextLessonFocus: string[];
  };
  feedbackPhrases: Array<{
    scenario: string;
    phrase: string;
  }>;
  groupedFeedback?: Array<{
    group: string;
    evidencePattern: string;
    teacherFeedback: string;
    nextStep: string;
  }>;
  improvementSuggestions: string[];
  classIssues: string[];
  teacherActionChecklist?: string[];
  complianceNotes: string[];
}

export type AgentArtifact =
  | KnowledgeMapArtifact
  | LessonPlanArtifact
  | SlideOutlineArtifact
  | QuizBuilderArtifact
  | HomeworkFeedbackArtifact;

export interface ModuleResult {
  rawText: string;
  artifact?: AgentArtifact;
  courseProfileSignature?: string;
  markdownFallback?: string;
  generatedAt?: string;
  parseError?: string;
}

export type ModuleOutputs = Partial<Record<ModuleId, ModuleResult>>;

export interface AgentModule {
  id: ModuleId;
  index: string;
  title: string;
  shortTitle: string;
  summary: string;
  extraInputLabel: string;
  placeholder: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}
