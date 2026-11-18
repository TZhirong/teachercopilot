import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { defaultCourseProfile } from "@/lib/agent/modules";
import {
  buildCourseProfileSignature,
  filterOutputsForCourse,
  getResultMarkdown,
  migrateModuleOutputs,
  parseArtifactResult,
  pruneOutputsForCourse,
  validateResultMatchesCourse
} from "@/lib/agent/results";
import { buildHomeworkFeedbackReview } from "@/lib/agent/homework-feedback-review";
import { buildQuizReview } from "@/lib/agent/quiz-review";
import {
  buildArtifactPackageZip,
  buildKnowledgeHtml,
  buildKnowledgeSvg,
  buildModuleExportFiles,
  buildSlidePptxBlob
} from "@/lib/export/artifacts";
import type {
  AgentArtifact,
  HomeworkFeedbackArtifact,
  ModuleId,
  ModuleOutputs,
  QuizBuilderArtifact,
  SlideOutlineArtifact,
  SlideStylePreset
} from "@/types/agent";

const fixtures: Record<ModuleId, AgentArtifact> = {
  "knowledge-map": {
    schemaVersion: "artifact-v1",
    moduleId: "knowledge-map",
    title: "Java 封装性知识图谱",
    nodes: [
      { id: "n1", label: "封装性", level: 1, summary: "隐藏实现，暴露稳定接口。" },
      { id: "n2", label: "访问修饰符", level: 2, summary: "控制成员可见性。" },
      { id: "n3", label: "Getter/Setter", level: 2, summary: "受控访问对象状态。" }
    ],
    edges: [
      { source: "n1", target: "n2", label: "通过" },
      { source: "n1", target: "n3", label: "体现为" }
    ],
    prerequisites: [{ title: "类与对象", detail: "理解字段、方法、对象状态。" }],
    keyPoints: [{ type: "重点", title: "private 字段", strategy: "用反例比较直接暴露字段的风险。" }],
    misconceptions: [
      { title: "把封装等同于 private", correction: "强调封装还包括接口设计。", prompt: "为什么还要提供方法？" }
    ],
    activities: [{ title: "银行账户重构", steps: ["识别暴露字段", "改写为受控方法"] }],
    markdownFallback: "## Java 封装性知识图谱\n\n教师二次调整建议：结合学生代码。"
  },
  "lesson-plan": {
    schemaVersion: "artifact-v1",
    moduleId: "lesson-plan",
    title: "Java 封装性教案",
    objectives: [
      { dimension: "知识", objective: "解释封装性的作用。", evidence: "能口头说明访问控制。" },
      { dimension: "能力", objective: "重构暴露字段代码。", evidence: "完成账户类改写。" }
    ],
    keyPoints: [{ type: "难点", title: "接口边界", strategy: "用状态不变量解释 setter 校验。" }],
    timeline: [
      {
        phase: "导入",
        duration: "8分钟",
        teacherActions: ["展示错误代码"],
        studentActions: ["判断风险"],
        assessment: "快速投票"
      },
      {
        phase: "练习",
        duration: "25分钟",
        teacherActions: ["巡视并追问"],
        studentActions: ["重构类"],
        assessment: "提交代码片段"
      }
    ],
    materials: ["IDE", "示例代码"],
    blackboardDesign: "封装性 = 数据隐藏 + 稳定接口 + 状态保护",
    adjustmentTips: ["替换为本班项目案例"],
    markdownFallback: "## Java 封装性教案\n\n教师二次调整建议：替换案例。"
  },
  "slide-outline": {
    schemaVersion: "artifact-v1",
    moduleId: "slide-outline",
    title: "Java 封装性课件",
    theme: "Tokyo Night 技术课件风",
    contentDirection: "case-inquiry",
    stylePreset: "tokyo-night",
    templateId: "tokyo-night",
    slides: [
      {
        page: 1,
        title: "为什么字段不能随便公开",
        layout: "问题导入",
        layoutVariant: "case-card",
        points: ["观察公开字段", "讨论状态被破坏", "定位风险来源", "引出封装"],
        detail: "通过银行账户余额被任意改写的情境，让学生看到字段公开后对象状态会失去保护。教师引导学生把问题从语法正确转向状态是否可信。",
        examples: ["账户余额被外部直接改成负数", "学生成绩对象被任意覆盖"],
        visualSuggestion: "左右对比错误代码和风险。",
        interactionPrompt: "如果余额字段为负会怎样？",
        teacherNotes: "让学生先判断代码是否能运行，再追问运行成功是否代表设计合理。",
        teacherScript: "这一页先不要急着讲 private。请大家先看公开字段的账户类，想象另一个对象直接把余额改成负数。代码能跑，但对象状态已经不可信了。"
      },
      {
        page: 2,
        title: "本节课要解决什么问题",
        layout: "学习目标",
        layoutVariant: "objectives",
        points: ["解释封装的价值", "识别字段暴露风险", "选择合适访问修饰符", "设计受控访问方法"],
        detail: "学习目标围绕判断、解释和改写三个层次展开，不只要求学生记住 private，而是能说明为什么隐藏字段、什么时候暴露方法以及如何维护对象不变量。",
        examples: ["判断账户类字段是否应该 public", "把无校验 setter 改写为受控方法"],
        visualSuggestion: "用目标卡片展示从理解到实践的递进。",
        interactionPrompt: "你认为封装更像语法规则，还是设计原则？",
        teacherNotes: "强调目标中的可评价行为，避免停留在概念背诵。",
        teacherScript: "本节课的目标不是背访问修饰符表，而是能判断一个类的状态边界。最后大家要能把一个暴露字段的类，改成有明确接口和保护规则的设计。"
      },
      {
        page: 3,
        title: "访问修饰符",
        layout: "矩阵表",
        layoutVariant: "matrix",
        points: ["private：类内可见", "default：包内协作", "protected：继承扩展", "public：稳定接口"],
        detail: "访问修饰符本质上是在表达可见性边界。教学中要避免把 public 理解为方便，把 private 理解为固定答案，而要联系对象状态和协作范围判断。",
        examples: ["余额字段适合 private", "查询余额方法可以 public", "包内工具类可使用 default"],
        visualSuggestion: "用可见性矩阵呈现。",
        interactionPrompt: "哪个修饰符适合账户余额？",
        teacherNotes: "强调最小暴露原则，并提醒 protected 不等于更安全。",
        teacherScript: "这张表请大家不要机械记忆。我们重点看两个问题：谁真的需要访问这个成员，以及访问之后会不会破坏对象状态。能少暴露，就先少暴露。"
      },
      {
        page: 4,
        title: "Getter 与 Setter 的边界",
        layout: "流程图",
        layoutVariant: "process",
        points: ["读取状态", "接收输入", "校验范围", "保护不变量", "反馈结果"],
        detail: "Getter 和 Setter 不是自动生成越多越好。读取方法要控制暴露粒度，写入方法要承担校验职责，必要时可以用更明确的业务方法替代通用 setter。",
        examples: ["setBalance 需要拒绝负数", "deposit 比 setBalance 更贴近业务语义"],
        visualSuggestion: "用流程图表现受控写入。",
        interactionPrompt: "setter 是否总是必须？",
        teacherNotes: "引导学生比较通用 setter 和业务方法的差异。",
        teacherScript: "很多同学会把字段 private 之后立刻生成全部 getter 和 setter。这里要停一下：如果 setter 不做校验，只是换了一扇门，风险其实还在。"
      },
      {
        page: 5,
        title: "公开字段到受控接口",
        layout: "双栏对比",
        layoutVariant: "two-column",
        points: ["左侧：直接暴露字段", "右侧：私有字段", "通过方法读取状态", "通过业务方法修改状态", "把规则写进对象内部"],
        detail: "通过左右对比让学生看到封装不是把代码变长，而是把状态修改规则放回对象内部。这样调用者只面对稳定接口，不需要知道内部字段如何维护。",
        examples: ["public double balance 改为 private double balance", "deposit、withdraw 方法集中处理金额校验"],
        visualSuggestion: "左侧放反例代码结构，右侧放重构后的类结构。",
        interactionPrompt: "重构后，调用者少知道了什么？对象多承担了什么？",
        teacherNotes: "对比时突出责任迁移：从外部随意修改迁移到对象内部守护。",
        teacherScript: "请看左右两边。右边不是为了多写几行代码，而是把余额变化的规则收回到账户对象里。调用者只发出存款、取款请求，不能绕过规则。"
      },
      {
        page: 6,
        title: "小组改写任务",
        layout: "课堂活动",
        layoutVariant: "activity",
        points: ["找出暴露字段", "判断字段是否需要公开", "补充必要校验", "写出接口设计理由"],
        detail: "活动要求学生以小组为单位改写一个 Student 或 Account 类，并说明每个字段的可见性选择。产出不只看代码，还看设计理由是否与对象状态相关。",
        examples: ["Student.score 不能被任意写入", "Account.withdraw 要判断余额是否充足"],
        visualSuggestion: "用任务清单和提交产出框呈现。",
        interactionPrompt: "你们小组保留了哪些 public 方法？为什么？",
        teacherNotes: "巡视时优先追问设计理由，而不是只检查语法。",
        teacherScript: "接下来每组拿到一个类，先标出哪些字段不该公开，再决定保留哪些方法。最后请用一句话说明：你们保护了哪个对象状态。"
      },
      {
        page: 7,
        title: "常见误区快速辨析",
        layout: "卡片列表",
        layoutVariant: "card-list",
        points: ["private 不等于封装完成", "getter/setter 不应无脑生成", "public 方法也需要稳定边界", "封装服务于对象职责"],
        detail: "本页集中处理学生容易形成的机械理解。教师可以用四张误区卡片快速纠偏，把封装重新拉回对象职责、状态保护和接口设计三个关键词。",
        examples: ["字段 private 但 setter 无校验", "所有方法 public 导致调用边界混乱"],
        visualSuggestion: "用四张误区卡片呈现，每张卡片配一个反例标签。",
        interactionPrompt: "哪一个误区最容易出现在你自己的代码里？",
        teacherNotes: "让学生先自评，再请一组分享具体代码片段。",
        teacherScript: "这一页是给大家排雷。封装不是把字段藏起来就结束，也不是自动生成方法。我们要看接口是否稳定、状态是否被保护、职责是否清楚。"
      },
      {
        page: 8,
        title: "课堂收束与迁移任务",
        layout: "总结",
        layoutVariant: "summary",
        points: ["封装隐藏实现", "接口表达协作边界", "校验保护对象状态", "迁移到项目类设计"],
        detail: "总结时把本节课收束为数据隐藏、稳定接口和状态保护三条线索，并把迁移任务连接到学生自己的项目类设计，促成课后继续修改代码。",
        examples: ["重构 Student 类", "为购物车类设计受控添加商品方法"],
        visualSuggestion: "用三条主线和一个课后任务入口呈现。",
        interactionPrompt: "回到自己的项目，你最想先重构哪个类？",
        teacherNotes: "用迁移问题结束，给下一节代码评审埋下入口。",
        teacherScript: "最后请大家用三句话带走这节课：隐藏实现、稳定接口、保护状态。课后任务不是重新抄例子，而是回到自己的类，找一个最需要封装的字段。"
      }
    ],
    transitionLines: ["从风险进入规则。", "从规则进入实践。"],
    extensionTasks: ["重构一个 Student 类", "写出封装设计说明"],
    markdownFallback: "## Java 封装性课件\n\n教师二次调整建议：增加项目截图。"
  },
  "quiz-builder": {
    schemaVersion: "artifact-v1",
    moduleId: "quiz-builder",
    title: "Java 封装性测验",
    blueprint: [
      { questionType: "单选", count: 1, score: 2, difficulty: "基础" },
      { questionType: "简答", count: 1, score: 8, difficulty: "中等" }
    ],
    questions: [
      {
        id: "Q1",
        type: "单项选择题",
        stem: "以下哪项最能体现封装？",
        options: ["A. 所有字段 public", "B. 私有字段并提供受控方法", "C. 方法越多越好"],
        answer: "B",
        analysis: "封装强调隐藏实现并通过稳定接口访问。",
        score: 2,
        scoringPoints: ["选 B 得分"]
      },
      {
        id: "Q2",
        type: "简答题",
        stem: "说明 setter 中进行参数校验的意义。",
        options: [],
        answer: "保护对象状态合法。",
        analysis: "校验可以维护对象不变量。",
        score: 8,
        scoringPoints: ["说明状态保护", "联系封装思想"]
      }
    ],
    diagnosisSuggestions: ["若学生只答 private，补讲接口设计。"],
    markdownFallback: "## Java 封装性测验\n\n教师二次调整建议：调整题量。"
  },
  "homework-feedback": {
    schemaVersion: "artifact-v1",
    moduleId: "homework-feedback",
    title: "Java 封装性作业反馈",
    assignmentContext: {
      taskDescription: "围绕封装性重构 Account 类，并说明字段可见性与方法边界。",
      expectedEvidence: ["能识别 public 字段风险", "能给 setter 增加校验", "能解释接口边界"],
      feedbackFocus: ["封装概念理解", "状态保护证据", "代码重构理由"]
    },
    rubric: [
      {
        dimension: "内容理解",
        excellent: "能说明封装与接口边界。",
        qualified: "能使用 private。",
        needsImprovement: "混淆封装和隐藏。"
      },
      {
        dimension: "代码实现",
        excellent: "能用受控方法保护对象状态。",
        qualified: "能完成字段私有化和基础访问方法。",
        needsImprovement: "只改访问修饰符，未处理状态校验。"
      },
      {
        dimension: "表达反思",
        excellent: "能结合具体代码说明设计取舍。",
        qualified: "能描述修改步骤。",
        needsImprovement: "只给结论，缺少证据说明。"
      }
    ],
    diagnosticSummary: {
      overallLevel: "多数学生能完成字段私有化，但对接口边界和校验职责说明不足。",
      classStrengths: ["能识别 public 字段带来的直接修改风险。"],
      commonMisconceptions: ["把 private 等同于封装完成。", "认为 setter 不需要承担校验职责。"],
      nextLessonFocus: ["用反例讲解状态不变量。", "组织一次代码讲评比较通用 setter 与业务方法。"]
    },
    feedbackPhrases: [
      { scenario: "setter 缺少校验", phrase: "你已经使用 private，下一步要考虑写入数据是否合法。" },
      { scenario: "能解释接口边界", phrase: "你的说明能把访问控制和对象职责联系起来，可以继续补充一个反例。" },
      { scenario: "只改 private", phrase: "字段私有化是起点，还要说明哪些方法可以稳定地暴露给外部。" },
      { scenario: "重构理由不足", phrase: "请用一句话说明这次改动保护了哪个对象状态。" }
    ],
    groupedFeedback: [
      {
        group: "已形成设计意识",
        evidencePattern: "能说明 public 字段破坏对象状态，并给出受控方法。",
        teacherFeedback: "你已经不只是改语法，而是在设计对象边界。",
        nextStep: "补充一个调用者绕过校验的反例，说明受控接口的必要性。"
      },
      {
        group: "机械套用 private",
        evidencePattern: "完成字段私有化，但 setter 无校验、说明停留在定义。",
        teacherFeedback: "你完成了封装的第一步，下一步要让方法真正承担保护规则。",
        nextStep: "为 setBalance 增加负数校验，并写出设计理由。"
      }
    ],
    improvementSuggestions: ["补充状态不变量说明。"],
    classIssues: ["集中讲解滥用 getter/setter 的问题。"],
    teacherActionChecklist: ["选取两份匿名代码进行对比讲评。", "追问 setter 是否必须存在。", "布置一次状态校验补改任务。"],
    complianceNotes: ["反馈中避免公开展示学生姓名。"],
    markdownFallback: "## Java 封装性反馈\n\n教师二次调整建议：加入学生常见代码片段。"
  }
};
const slideOutlineFixture = fixtures["slide-outline"] as SlideOutlineArtifact;
const homeworkFeedbackFixture = fixtures["homework-feedback"] as HomeworkFeedbackArtifact;
const richQuizFixture: QuizBuilderArtifact = {
  ...(fixtures["quiz-builder"] as QuizBuilderArtifact),
  blueprint: [
    {
      questionType: "单选",
      count: 1,
      score: 2,
      difficulty: "基础",
      knowledgePoint: "封装概念",
      objective: "判断封装做法"
    },
    {
      questionType: "简答",
      count: 1,
      score: 8,
      difficulty: "中等",
      knowledgePoint: "状态保护",
      objective: "说明校验意义"
    }
  ],
  questions: [
    {
      ...(fixtures["quiz-builder"] as QuizBuilderArtifact).questions[0],
      knowledgePoint: "封装概念",
      difficulty: "基础",
      cognitiveLevel: "理解",
      diagnosticTag: "把封装等同于 public/private 记忆",
      estimatedMinutes: 2
    },
    {
      ...(fixtures["quiz-builder"] as QuizBuilderArtifact).questions[1],
      knowledgePoint: "状态保护",
      difficulty: "中等",
      cognitiveLevel: "应用",
      diagnosticTag: "忽略 setter 校验",
      estimatedMinutes: 6
    }
  ],
  coverageMatrix: [
    {
      knowledgePoint: "封装概念",
      objective: "判断封装做法",
      questionIds: ["Q1"],
      difficulty: "基础"
    },
    {
      knowledgePoint: "状态保护",
      objective: "说明校验意义",
      questionIds: ["Q2"],
      difficulty: "中等"
    }
  ],
  reviewSummary: {
    totalQuestions: 2,
    totalScore: 10,
    estimatedMinutes: 8,
    coverageStatus: "覆盖核心知识点，可直接使用"
  }
};

test("parses artifact-v1 fixtures for every module", () => {
  for (const [moduleId, artifact] of Object.entries(fixtures) as Array<[ModuleId, AgentArtifact]>) {
    const result = parseArtifactResult(moduleId, `\`\`\`json\n${JSON.stringify(artifact)}\n\`\`\``);
    assert.equal(result.parseError, undefined);
    assert.equal(result.artifact?.moduleId, moduleId);
    assert.match(getResultMarkdown(result), /教师二次调整建议/);
  }
});

test("preserves html-ppt slide style metadata", () => {
  const result = parseArtifactResult("slide-outline", JSON.stringify(slideOutlineFixture));
  const artifact = result.artifact;

  assert.equal(result.parseError, undefined);
  assert.equal(artifact?.moduleId, "slide-outline");
  if (artifact?.moduleId !== "slide-outline") return;

  assert.equal(artifact.stylePreset, "tokyo-night");
  assert.equal(artifact.templateId, "tokyo-night");
  assert.equal(artifact.contentDirection, "case-inquiry");
  assert.equal(artifact.slides[0]?.layoutVariant, "case-card");
  assert.equal(artifact.slides[1]?.layoutVariant, "objectives");
  assert.equal(artifact.slides[2]?.layoutVariant, "matrix");
  assert.match(artifact.slides[0]?.detail || "", /状态是否可信/);
  assert.deepEqual(artifact.slides[0]?.examples, ["账户余额被外部直接改成负数", "学生成绩对象被任意覆盖"]);
  assert.match(artifact.slides[0]?.teacherScript || "", /不要急着讲 private/);
});

test("keeps old slide outline artifacts exportable without style metadata", () => {
  const legacyArtifact = {
    ...slideOutlineFixture,
    contentDirection: undefined,
    stylePreset: undefined,
    templateId: undefined,
    slides: slideOutlineFixture.slides.map((slide) => ({
      ...slide,
      layoutVariant: undefined,
      detail: undefined,
      examples: undefined,
      teacherScript: undefined
    }))
  };
  const result = parseArtifactResult("slide-outline", JSON.stringify(legacyArtifact));
  const artifact = result.artifact;

  assert.equal(result.parseError, undefined);
  assert.equal(artifact?.moduleId, "slide-outline");
  if (artifact?.moduleId !== "slide-outline") return;

  assert.equal(artifact.stylePreset, undefined);
  assert.equal(artifact.templateId, undefined);
  assert.equal(artifact.contentDirection, undefined);
  assert.equal(artifact.slides[0]?.layoutVariant, undefined);
  assert.equal(artifact.slides[0]?.detail, "");
  assert.deepEqual(artifact.slides[0]?.examples, []);
  assert.equal(artifact.slides[0]?.teacherScript, "");
});

test("preserves enhanced quiz metadata while old quiz fields stay compatible", () => {
  const result = parseArtifactResult("quiz-builder", JSON.stringify(richQuizFixture));
  const artifact = result.artifact;

  assert.equal(result.parseError, undefined);
  assert.equal(artifact?.moduleId, "quiz-builder");
  if (artifact?.moduleId !== "quiz-builder") return;

  assert.equal(artifact.questions[0]?.knowledgePoint, "封装概念");
  assert.equal(artifact.questions[0]?.difficulty, "基础");
  assert.equal(artifact.questions[0]?.estimatedMinutes, 2);
  assert.equal(artifact.blueprint[0]?.objective, "判断封装做法");
  assert.equal(artifact.coverageMatrix?.[1]?.questionIds[0], "Q2");
  assert.equal(artifact.reviewSummary?.totalScore, 10);
});

test("reviews quiz artifacts for consistency and missing teacher-facing detail", () => {
  const readyReview = buildQuizReview(richQuizFixture);
  assert.equal(readyReview.status, "ready");
  assert.equal(readyReview.totalQuestions, 2);
  assert.equal(readyReview.totalScore, 10);
  assert.equal(readyReview.coverageCount, 2);

  const brokenReview = buildQuizReview({
    ...richQuizFixture,
    blueprint: [{ questionType: "单选", count: 1, score: 2, difficulty: "基础" }],
    questions: [
      {
        ...richQuizFixture.questions[0],
        id: "Q1",
        options: ["A. 选项"],
        answer: "",
        analysis: "",
        scoringPoints: [],
        knowledgePoint: undefined
      },
      {
        ...richQuizFixture.questions[1],
        id: "Q1",
        knowledgePoint: undefined
      }
    ],
    coverageMatrix: []
  });

  assert.equal(brokenReview.status, "needs-review");
  assert.ok(brokenReview.warnings.some((item) => item.id === "blueprint-count"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "objective-options"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "answer-analysis"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "unique-question-ids"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "knowledge-coverage"));
});

test("preserves enhanced homework feedback metadata while old feedback fields stay compatible", () => {
  const result = parseArtifactResult("homework-feedback", JSON.stringify(homeworkFeedbackFixture));
  const artifact = result.artifact;

  assert.equal(result.parseError, undefined);
  assert.equal(artifact?.moduleId, "homework-feedback");
  if (artifact?.moduleId !== "homework-feedback") return;

  assert.equal(artifact.assignmentContext?.feedbackFocus[0], "封装概念理解");
  assert.equal(artifact.diagnosticSummary?.commonMisconceptions.length, 2);
  assert.equal(artifact.groupedFeedback?.[1]?.group, "机械套用 private");
  assert.equal(artifact.teacherActionChecklist?.length, 3);

  const legacyArtifact = {
    ...homeworkFeedbackFixture,
    assignmentContext: undefined,
    diagnosticSummary: undefined,
    groupedFeedback: undefined,
    teacherActionChecklist: undefined
  };
  const legacyResult = parseArtifactResult("homework-feedback", JSON.stringify(legacyArtifact));
  const legacyParsed = legacyResult.artifact;

  assert.equal(legacyResult.parseError, undefined);
  assert.equal(legacyParsed?.moduleId, "homework-feedback");
  if (legacyParsed?.moduleId !== "homework-feedback") return;

  assert.equal(legacyParsed.assignmentContext, undefined);
  assert.equal(legacyParsed.diagnosticSummary, undefined);
  assert.equal(legacyParsed.groupedFeedback, undefined);
  assert.equal(legacyParsed.teacherActionChecklist, undefined);
});

test("reviews homework feedback artifacts for class feedback loop readiness", () => {
  const readyReview = buildHomeworkFeedbackReview(homeworkFeedbackFixture);

  assert.equal(readyReview.status, "ready");
  assert.equal(readyReview.metrics.rubricDimensions, 3);
  assert.equal(readyReview.metrics.phraseCount, 4);
  assert.equal(readyReview.metrics.groupCount, 2);
  assert.equal(readyReview.metrics.actionCount, 3);

  const brokenReview = buildHomeworkFeedbackReview({
    ...homeworkFeedbackFixture,
    assignmentContext: undefined,
    rubric: homeworkFeedbackFixture.rubric.slice(0, 1),
    diagnosticSummary: undefined,
    feedbackPhrases: homeworkFeedbackFixture.feedbackPhrases.slice(0, 1),
    groupedFeedback: [],
    teacherActionChecklist: [],
    complianceNotes: ["注意语气温和。"]
  });

  assert.equal(brokenReview.status, "needs-review");
  assert.ok(brokenReview.warnings.some((item) => item.id === "assignment-context"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "rubric-depth"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "diagnostic-summary"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "feedback-phrases"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "grouped-feedback"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "teacher-actions"));
  assert.ok(brokenReview.warnings.some((item) => item.id === "compliance-notes"));
});

test("drops unsupported slide style metadata instead of failing parse", () => {
  const result = parseArtifactResult(
    "slide-outline",
    JSON.stringify({
      ...slideOutlineFixture,
      contentDirection: "open-ended",
      stylePreset: "rainbow-gradient",
      templateId: "unknown-template",
      slides: slideOutlineFixture.slides.map((slide) => ({
        ...slide,
        layoutVariant: "poster"
      }))
    })
  );
  const artifact = result.artifact;

  assert.equal(result.parseError, undefined);
  assert.equal(artifact?.moduleId, "slide-outline");
  if (artifact?.moduleId !== "slide-outline") return;

  assert.equal(artifact.stylePreset, undefined);
  assert.equal(artifact.templateId, undefined);
  assert.equal(artifact.contentDirection, undefined);
  assert.equal(artifact.slides[0]?.layoutVariant, undefined);
});

test("migrates old string outputs into ModuleResult", () => {
  const migrated = migrateModuleOutputs({
    "knowledge-map": "## 旧知识图谱"
  });

  assert.equal(migrated["knowledge-map"]?.rawText, "## 旧知识图谱");
  assert.equal(migrated["knowledge-map"]?.markdownFallback, "## 旧知识图谱");
  assert.equal(migrated["knowledge-map"]?.courseProfileSignature, undefined);
});

test("filters cached outputs by current course profile signature", () => {
  const defaultSignature = buildCourseProfileSignature(defaultCourseProfile);
  const otherSignature = buildCourseProfileSignature({
    ...defaultCourseProfile,
    courseName: "中国近代史",
    topic: "中国近代史的开端"
  });
  const outputs: ModuleOutputs = {
    "knowledge-map": parseArtifactResult(
      "knowledge-map",
      JSON.stringify(fixtures["knowledge-map"]),
      "2026-06-06T00:00:00.000Z",
      defaultSignature
    ),
    "lesson-plan": parseArtifactResult(
      "lesson-plan",
      JSON.stringify(fixtures["lesson-plan"]),
      "2026-06-06T00:00:00.000Z",
      otherSignature
    ),
    "slide-outline": parseArtifactResult("slide-outline", JSON.stringify(slideOutlineFixture))
  };

  const filtered = filterOutputsForCourse(outputs, otherSignature);

  assert.equal(filtered["knowledge-map"], undefined);
  assert.equal(filtered["slide-outline"], undefined);
  assert.equal(filtered["lesson-plan"]?.artifact?.moduleId, "lesson-plan");
});

test("prunes outputs from previous course profiles", () => {
  const defaultSignature = buildCourseProfileSignature(defaultCourseProfile);
  const otherSignature = buildCourseProfileSignature({
    ...defaultCourseProfile,
    courseName: "中国近代史",
    topic: "中国近代史的开端"
  });
  const outputs: ModuleOutputs = {
    "knowledge-map": parseArtifactResult(
      "knowledge-map",
      JSON.stringify(fixtures["knowledge-map"]),
      "2026-06-06T00:00:00.000Z",
      defaultSignature
    ),
    "lesson-plan": parseArtifactResult(
      "lesson-plan",
      JSON.stringify(fixtures["lesson-plan"]),
      "2026-06-06T00:00:00.000Z",
      otherSignature
    )
  };

  const pruned = pruneOutputsForCourse(outputs, otherSignature);

  assert.equal(pruned.removed, 1);
  assert.equal(pruned.outputs["knowledge-map"], undefined);
  assert.equal(pruned.outputs["lesson-plan"]?.artifact?.moduleId, "lesson-plan");
});

test("validates generated artifact against current course anchor", () => {
  const courseProfile = {
    ...defaultCourseProfile,
    courseName: "中国近代史",
    topic: "中国近代史的开端"
  };
  const wrongResult = parseArtifactResult(
    "knowledge-map",
    JSON.stringify(fixtures["knowledge-map"])
  );
  const rightResult = parseArtifactResult(
    "knowledge-map",
    JSON.stringify({
      ...fixtures["knowledge-map"],
      title: "中国近代史的开端知识图谱",
      markdownFallback: "## 中国近代史的开端知识图谱\n\n教师二次调整建议：结合史料阅读。",
      nodes: [
        { id: "n1", label: "中国近代史的开端", level: 1, summary: "围绕鸦片战争前后展开。" }
      ]
    })
  );

  assert.match(validateResultMatchesCourse(wrongResult, courseProfile) || "", /疑似偏离/);
  assert.equal(validateResultMatchesCourse(rightResult, courseProfile), undefined);
});

test("repairs common model quote mistakes in JSON strings", () => {
  const malformed = JSON.stringify(fixtures["knowledge-map"]).replace(
    '"prompt":"为什么还要提供方法？"',
    '"prompt":""为什么还要提供方法？"'
  );
  const result = parseArtifactResult("knowledge-map", malformed);

  assert.equal(result.parseError, undefined);
  assert.equal(result.artifact?.moduleId, "knowledge-map");
});

test("recovers artifact when markdownFallback is truncated", () => {
  const full = JSON.stringify(fixtures["knowledge-map"]);
  const markerIndex = full.indexOf('"markdownFallback"');
  const truncated = `${full.slice(0, markerIndex)}"markdownFallback":"## 兼容文本写到这里突然中断`;
  const result = parseArtifactResult("knowledge-map", truncated);

  assert.equal(result.parseError, undefined);
  assert.equal(result.artifact?.moduleId, "knowledge-map");
  assert.equal(result.artifact?.moduleId === "knowledge-map" ? result.artifact.nodes.length : 0, 3);
  assert.match(getResultMarkdown(result), /兼容文本/);
});

test("retries parsing cached raw text that previously failed", () => {
  const full = JSON.stringify(fixtures["knowledge-map"]);
  const markerIndex = full.indexOf('"markdownFallback"');
  const rawText = `${full.slice(0, markerIndex)}"markdownFallback":"## 旧缓存里的截断内容`;
  const migrated = migrateModuleOutputs({
    "knowledge-map": {
      rawText,
      markdownFallback: rawText,
      parseError: "Unterminated string in JSON"
    }
  });

  assert.equal(migrated["knowledge-map"]?.parseError, undefined);
  assert.equal(migrated["knowledge-map"]?.artifact?.moduleId, "knowledge-map");
});

test("knowledge graph svg and html exports contain node text", () => {
  const artifact = fixtures["knowledge-map"];
  assert.equal(artifact.moduleId, "knowledge-map");
  const svg = buildKnowledgeSvg(artifact);
  const html = buildKnowledgeHtml(artifact, svg);

  assert.match(svg, /封装性/);
  assert.match(svg, /访问修饰符/);
  assert.match(svg, /graph-ring/);
  assert.match(svg, /R01/);
  assert.match(svg, /<path class="edge/);
  assert.match(html, /Java 封装性知识图谱/);
});

test("module file exports create non-empty real files", async () => {
  for (const [moduleId, artifact] of Object.entries(fixtures) as Array<[ModuleId, AgentArtifact]>) {
    const result = parseArtifactResult(moduleId, JSON.stringify(artifact));
    const files = await buildModuleExportFiles(defaultCourseProfile, moduleId, result);

    assert.ok(files.length >= 1);
    for (const file of files) {
      assert.ok(file.blob.size > 100, `${file.filename} should not be empty`);
    }
  }
});

test("homework feedback docx export contains closed-loop sections", async () => {
  const result = parseArtifactResult("homework-feedback", JSON.stringify(homeworkFeedbackFixture));
  const files = await buildModuleExportFiles(defaultCourseProfile, "homework-feedback", result);
  const [file] = files;
  assert.ok(file);
  const document = await JSZip.loadAsync(await file.blob.arrayBuffer());
  const documentXml = await document.file("word/document.xml")?.async("string");

  assert.match(documentXml || "", /作业情境/);
  assert.match(documentXml || "", /班级诊断摘要/);
  assert.match(documentXml || "", /分层反馈建议/);
  assert.match(documentXml || "", /教师复盘清单/);
});

test("quiz module exports separate student and teacher docx files", async () => {
  const result = parseArtifactResult("quiz-builder", JSON.stringify(richQuizFixture));
  const files = await buildModuleExportFiles(defaultCourseProfile, "quiz-builder", result);

  assert.deepEqual(
    files.map((file) => file.filename),
    ["计算机网络-试题-学生卷.docx", "计算机网络-试题-教师用卷.docx"]
  );

  const studentZip = await JSZip.loadAsync(await files[0].blob.arrayBuffer());
  const teacherZip = await JSZip.loadAsync(await files[1].blob.arrayBuffer());
  const studentDoc = await studentZip.file("word/document.xml")?.async("string");
  const teacherDoc = await teacherZip.file("word/document.xml")?.async("string");

  assert.match(studentDoc || "", /学生卷/);
  assert.doesNotMatch(studentDoc || "", /答案与解析/);
  assert.doesNotMatch(studentDoc || "", /参考答案/);
  assert.match(teacherDoc || "", /教师用卷/);
  assert.match(teacherDoc || "", /答案与解析/);
  assert.match(teacherDoc || "", /评分要点/);
});

test("slide outline pptx has title plus rich mixed content slides", async () => {
  const artifact = slideOutlineFixture;
  assert.equal(artifact.moduleId, "slide-outline");

  const blob = await buildSlidePptxBlob(defaultCourseProfile, artifact);
  assert.ok(blob.size > 1000);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.ok(slideFiles.length >= 9);

  const slideText = await zip.file("ppt/slides/slide2.xml")?.async("string");
  assert.match(slideText || "", /课堂案例/);
  assert.match(slideText || "", /讲授备注/);
  assert.match(slideText || "", /状态是否可信/);
  assert.match(slideText || "", /账户余额被外部直接改成负数/);

  const notesText = await zip.file("ppt/notesSlides/notesSlide2.xml")?.async("string");
  assert.match(notesText || "", /讲稿提示/);
  assert.match(notesText || "", /不要急着讲 private/);
  assert.match(notesText || "", /定位风险来源/);
});

test("slide outline pptx writes different preset colors", async () => {
  const cases: Array<[SlideStylePreset, string]> = [
    ["course-module", "B85C38"],
    ["tokyo-night", "7AA2F7"],
    ["blueprint", "1E66F5"]
  ];

  for (const [stylePreset, expectedColor] of cases) {
    const artifact = {
      ...slideOutlineFixture,
      stylePreset,
      templateId: stylePreset
    };
    const blob = await buildSlidePptxBlob(defaultCourseProfile, artifact);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");

    assert.match(slideXml || "", new RegExp(expectedColor, "i"), `${stylePreset} should use ${expectedColor}`);
  }
});

test("zip package includes generated modules and skips missing modules", async () => {
  const outputs: ModuleOutputs = {
    "knowledge-map": parseArtifactResult("knowledge-map", JSON.stringify(fixtures["knowledge-map"])),
    "slide-outline": parseArtifactResult("slide-outline", JSON.stringify(slideOutlineFixture))
  };

  const blob = await buildArtifactPackageZip(defaultCourseProfile, outputs);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files);

  assert.ok(names.some((name) => name.endsWith("知识图谱.svg")));
  assert.ok(names.some((name) => name.endsWith("知识图谱.html")));
  assert.ok(names.some((name) => name.endsWith("课件.pptx")));
  assert.equal(names.some((name) => name.endsWith("教案.docx")), false);
});
