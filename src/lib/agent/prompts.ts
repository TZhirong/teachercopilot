import { agentModules, getAgentModule } from "@/lib/agent/modules";
import {
  coerceQuizGenerationPreferences,
  getQuizAssessmentPurposeOption,
  getQuizDifficultyMixOption,
  getQuizQuestionTypeOption
} from "@/lib/agent/quiz-preferences";
import {
  coerceSlideGenerationPreferences,
  getSlideContentDirectionOption,
  getSlideStylePresetOption
} from "@/lib/agent/slide-preferences";
import type {
  AgentRequest,
  ChatMessage,
  CourseProfile,
  ModuleId,
  QuizGenerationPreferences,
  SlideGenerationPreferences
} from "@/types/agent";

const baseSystemPrompt = `你是“高校备课助手”，面向高校教师的教学辅助智能体。
你的任务是帮助一线教师完成备课、教案设计、知识点梳理、试题组卷、作业反馈等教学核心环节。
输出必须服务真实课堂，强调师范教育语境、教学可操作性、学生发展、合规伦理和教师可二次编辑。
课程画像是全局事实源，优先级高于模块补充输入；模块补充输入只用于细化当前模块，不得覆盖课程画像中的课程、主题、学习对象和课时安排。
课程名称和主题/章节是内容锚点，优先级高于学习对象、已有材料、约束条件中的零散概念；如果其他字段疑似残留上一节课或其他学科的内容，必须忽略其中与课程名称和主题无关的学科概念。
所有成果标题、知识节点、案例、试题和反馈都必须围绕课程名称与主题/章节展开，不得输出与课程主题无关的内容。
请使用中文填充内容，避免空泛口号，不编造不存在的学校政策或真实数据。`;

const moduleInstructions: Record<ModuleId, string> = {
  "knowledge-map": `生成“知识点梳理”artifact，体现知识点、先修关系、易错点、教学重难点和课堂应用。知识节点要能形成关系图，不要只罗列段落。建议提供 10-16 个具体知识节点，summary 要说明该节点在本课中的判断依据、课堂用途或易错边界；edges 不得只给核心节点到下级节点的星形关系，还要包含概念之间的跨层支撑、前后依赖、误区纠偏关系，关系数量至少接近节点数量。`,
  "lesson-plan": `生成“教案设计”artifact，按 BOPPPS 或 OBE 思路组织目标、重难点、教学流程、活动设计、形成性评价和板书提示。`,
  "slide-outline": `生成“课件大纲”artifact，按真实 PPT 页组织标题、页面要点、讲解正文、课堂案例、视觉建议、互动提示、讲授备注、教师讲稿和课后延伸。必须参考 html-ppt skill 的主题/模板方法做风格决策：默认教学课件使用 course-module；学术/研究报告使用 academic-paper；正式汇报使用 corporate-clean；技术/代码课程使用 tokyo-night；架构、流程、系统设计课程使用 blueprint。必须遵守课件生成偏好中的 contentDirection 与 stylePreset，为整套课件输出 contentDirection、stylePreset 与 templateId，并为每一页选择 layoutVariant，避免所有页面都是同一种卡片结构。`,
  "quiz-builder": `生成“试题组卷”artifact，包含试卷蓝图、客观题、简答题、案例题、答案解析、评分要点、知识点覆盖矩阵、试卷摘要和教学诊断建议。必须遵守试题生成偏好中的测评目的、题量、题型组合和难度结构。`,
  "homework-feedback": `生成“作业反馈”artifact，面向班级作业讲评闭环，包含作业情境、评价量规、班级诊断、反馈语库、分层反馈、个性化改进建议、教师行动清单和合规提醒。`
};

const artifactSchemas: Record<ModuleId, string> = {
  "knowledge-map": `{
  "schemaVersion": "artifact-v1",
  "moduleId": "knowledge-map",
  "title": "知识图谱标题",
  "nodes": [
    { "id": "n1", "label": "核心概念", "level": 1, "summary": "1-2句具体说明，包含课堂判断依据或易错边界" }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "label": "关系说明" }
  ],
  "prerequisites": [
    { "title": "先修基础", "detail": "学生需要具备的前置理解" }
  ],
  "keyPoints": [
    { "type": "重点/难点", "title": "名称", "strategy": "突破策略" }
  ],
  "misconceptions": [
    { "title": "易错点", "correction": "纠偏方式", "prompt": "课堂追问" }
  ],
  "activities": [
    { "title": "活动名称", "steps": ["步骤1", "步骤2"] }
  ],
  "markdownFallback": "同一成果的 Markdown 兼容版"
}`,
  "lesson-plan": `{
  "schemaVersion": "artifact-v1",
  "moduleId": "lesson-plan",
  "title": "教案标题",
  "objectives": [
    { "dimension": "知识/能力/素养", "objective": "可评价目标", "evidence": "达成证据" }
  ],
  "keyPoints": [
    { "type": "重点/难点", "title": "名称", "strategy": "处理方式" }
  ],
  "timeline": [
    {
      "phase": "导入/参与式学习/讲授/练习/评价/总结",
      "duration": "10分钟",
      "teacherActions": ["教师动作"],
      "studentActions": ["学生活动"],
      "assessment": "形成性评价方式"
    }
  ],
  "materials": ["材料或工具"],
  "blackboardDesign": "板书或课件结构",
  "adjustmentTips": ["教师二次调整建议"],
  "markdownFallback": "同一成果的 Markdown 兼容版"
}`,
  "slide-outline": `{
  "schemaVersion": "artifact-v1",
  "moduleId": "slide-outline",
  "title": "课件标题",
  "theme": "建议视觉主题",
  "contentDirection": "case-inquiry | concept-teaching | activity-co-creation | assessment-consolidation",
  "stylePreset": "course-module | academic-paper | corporate-clean | tokyo-night | blueprint",
  "templateId": "course-module | academic-paper | corporate-clean | tokyo-night | blueprint",
  "slides": [
    {
      "page": 1,
      "title": "页面标题",
      "layout": "页面布局",
      "layoutVariant": "cover | objectives | two-column | process | matrix | case-card | activity | summary | card-list",
      "points": ["页面要点"],
      "detail": "80-140字讲解正文，解释本页关键内容、课堂判断依据或易错边界",
      "examples": ["1-3个具体案例、例子、课堂情境、代码片段描述或迁移应用"],
      "visualSuggestion": "图表/流程图/案例呈现建议",
      "interactionPrompt": "互动提示或课堂问题",
      "teacherNotes": "60-120字讲授备注，说明教师如何推进、追问或收束",
      "teacherScript": "80-160字教师讲稿提示，用口语化中文写出本页讲授节奏"
    }
  ],
  "transitionLines": ["过渡语"],
  "extensionTasks": ["课后延伸任务"],
  "markdownFallback": "同一成果的 Markdown 兼容版"
}`,
  "quiz-builder": `{
  "schemaVersion": "artifact-v1",
  "moduleId": "quiz-builder",
  "title": "试卷标题",
  "blueprint": [
    { "questionType": "单选/简答/案例", "count": 5, "score": 20, "difficulty": "基础/中等/挑战", "knowledgePoint": "覆盖知识点", "objective": "测评目标" }
  ],
  "questions": [
    {
      "id": "Q1",
      "type": "单项选择题",
      "stem": "题干",
      "options": ["A. 选项", "B. 选项"],
      "answer": "参考答案",
      "analysis": "解析",
      "score": 2,
      "scoringPoints": ["评分要点"],
      "knowledgePoint": "对应知识点",
      "difficulty": "基础/中等/挑战",
      "cognitiveLevel": "识记/理解/应用/分析",
      "diagnosticTag": "可诊断的常见问题",
      "estimatedMinutes": 2
    }
  ],
  "coverageMatrix": [
    { "knowledgePoint": "知识点", "objective": "测评目标", "questionIds": ["Q1"], "difficulty": "基础/中等/挑战" }
  ],
  "reviewSummary": {
    "totalQuestions": 8,
    "totalScore": 100,
    "estimatedMinutes": 35,
    "coverageStatus": "覆盖核心知识点，可直接使用/需教师复核"
  },
  "diagnosisSuggestions": ["依据答题结果调整教学的建议"],
  "markdownFallback": "同一成果的 Markdown 兼容版"
}`,
  "homework-feedback": `{
  "schemaVersion": "artifact-v1",
  "moduleId": "homework-feedback",
  "title": "作业反馈标题",
  "assignmentContext": {
    "taskDescription": "本次作业或学习产出的任务要求",
    "expectedEvidence": ["可观察、可评价的学习证据"],
    "feedbackFocus": ["本次反馈优先关注点"]
  },
  "rubric": [
    {
      "dimension": "内容理解",
      "excellent": "优秀等级标准",
      "qualified": "合格等级标准",
      "needsImprovement": "待改进等级标准"
    }
  ],
  "diagnosticSummary": {
    "overallLevel": "班级整体完成质量判断",
    "classStrengths": ["班级表现出的优势"],
    "commonMisconceptions": ["班级共性误区或薄弱点"],
    "nextLessonFocus": ["下一课讲评或补救重点"]
  },
  "feedbackPhrases": [
    { "scenario": "适用情境", "phrase": "教师可直接使用的反馈语" }
  ],
  "groupedFeedback": [
    {
      "group": "表现类型或学生群体",
      "evidencePattern": "典型证据表现",
      "teacherFeedback": "教师可直接对这组学生使用的反馈语",
      "nextStep": "下一步改进任务"
    }
  ],
  "improvementSuggestions": ["学生下一步学习路径"],
  "classIssues": ["班级共性问题和下一课处理方式"],
  "teacherActionChecklist": ["教师讲评、追问或二次批改动作"],
  "complianceNotes": ["隐私与发展性反馈提醒"],
  "markdownFallback": "同一成果的 Markdown 兼容版"
}`
};

export function buildCourseContext(courseProfile: CourseProfile) {
  return `课程名称：${courseProfile.courseName}
主题/章节：${courseProfile.topic}
学习对象：${courseProfile.learnerProfile}
课时安排：${courseProfile.classDuration}
教学目标：${courseProfile.teachingGoals}
已有材料：${courseProfile.existingMaterials}
约束条件：${courseProfile.constraints}`;
}

export function buildContentAnchor(courseProfile: CourseProfile) {
  return `内容锚点（最高优先级）：本次成果只围绕《${courseProfile.courseName || "未命名课程"}》中的“${courseProfile.topic || "未设置主题"}”展开。
如果学习对象、已有材料、约束条件或教师补充输入里出现与该课程主题无关的旧学科概念，不得把这些旧概念写入标题、知识节点、课堂案例、试题或 markdownFallback。`;
}

function buildSlideCountGuidance(courseProfile: CourseProfile) {
  const durationText = courseProfile.classDuration || "";
  const minutes = Array.from(durationText.matchAll(/\d+/gu))
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
  const maxMinutes = minutes.length ? Math.max(...minutes) : 0;

  if (maxMinutes >= 120 || /3\s*课时|三\s*课时/u.test(durationText)) {
    return "建议生成 12-16 页，覆盖导入、目标、核心讲解、案例/活动、检测、总结与延伸。";
  }
  if (maxMinutes >= 80 || /2\s*课时|两\s*课时|双课时/u.test(durationText)) {
    return "建议生成 8-12 页，90 分钟课程默认使用这个范围。";
  }
  if (maxMinutes >= 45 || /1\s*课时|一\s*课时/u.test(durationText)) {
    return "建议生成 6-9 页，保证导入、目标、核心讲解、互动与总结完整。";
  }
  return "建议生成 8-12 页；如果教师补充输入明确指定页数，则以教师指定页数为准。";
}

function getSlideDirectionDepthGuidance(directionId: SlideGenerationPreferences["contentDirection"]) {
  switch (directionId) {
    case "case-inquiry":
      return "案例探究要强化案例链、判断依据和递进追问，examples 应更具体，interactionPrompt 要能引导学生先判断再解释。";
    case "concept-teaching":
      return "概念讲授要强化定义、结构拆解、反例和易错辨析，detail 应承担主要讲解，teacherNotes 要提示板书或强调顺序。";
    case "activity-co-creation":
      return "活动共创要强化任务步骤、学生产出和小组协作，points 可写成活动流程，examples 可写成产出样例。";
    case "assessment-consolidation":
      return "测评巩固要强化诊断题、错因分析和反馈建议，interactionPrompt 应包含即时检测或复盘问题。";
  }
}

function buildSlidePreferenceContext(
  preferences: SlideGenerationPreferences,
  courseProfile: CourseProfile
) {
  const direction = getSlideContentDirectionOption(preferences.contentDirection);
  const style = getSlideStylePresetOption(preferences.stylePreset);

  return `\n\n课件生成偏好（仅用于课件大纲模块，优先级高于模型自动判断）：
内容方向：${direction.label}（contentDirection=${direction.id}）
内容组织要求：${direction.promptGuidance}
内容厚度要求：${getSlideDirectionDepthGuidance(direction.id)}
PPT 风格：${style.label}（stylePreset=${style.id}，templateId=${style.id}）
页数与节奏要求：${buildSlideCountGuidance(courseProfile)}
风格执行要求：必须把 stylePreset 和 templateId 都输出为 ${style.id}；页面 layoutVariant 要与内容方向匹配，并至少混合 3 种版式。
每页内容密度：points 写 3-5 条；detail 写 80-140 字；examples 写 1-3 条；teacherNotes 写 60-120 字；teacherScript 写 80-160 字。`;
}

function buildQuizPreferenceContext(preferences: QuizGenerationPreferences) {
  const purpose = getQuizAssessmentPurposeOption(preferences.assessmentPurpose);
  const difficulty = getQuizDifficultyMixOption(preferences.difficultyMix);
  const questionTypes = preferences.questionTypes.map(getQuizQuestionTypeOption);
  const typeLabels = questionTypes.map((option) => option.promptLabel).join("、");

  return `\n\n试题生成偏好（仅用于试题组卷模块，优先级高于模型自动判断）：
测评目的：${purpose.label}（assessmentPurpose=${purpose.id}）
测评目的要求：${purpose.promptGuidance}
题量要求：共 ${preferences.questionCount} 题，questions.length 必须等于 ${preferences.questionCount}，blueprint 中 count 合计也必须等于 ${preferences.questionCount}。
题型组合：${typeLabels}；不得输出未选择题型，若教师补充输入明确要求增删题型，则在所选范围内调整比例。
难度结构：${difficulty.label}（difficultyMix=${difficulty.id}）
难度要求：${difficulty.promptGuidance}
质量要求：blueprint.score 合计必须等于 questions.score 合计；每道题必须写 knowledgePoint、difficulty、cognitiveLevel、diagnosticTag、estimatedMinutes；coverageMatrix 必须覆盖所有核心知识点并引用真实 questionIds；reviewSummary 必须汇总总题数、总分、预计用时和覆盖状态。`;
}

export function buildAgentMessages(request: AgentRequest): ChatMessage[] {
  const agentModule = getAgentModule(request.moduleId);
  if (!agentModule) {
    throw new Error(`Unsupported module: ${request.moduleId}`);
  }

  const slidePreferenceInput =
    request.moduleId === "slide-outline"
      ? buildSlidePreferenceContext(
          coerceSlideGenerationPreferences(request.slidePreferences, request.courseProfile),
          request.courseProfile
        )
      : "";
  const quizPreferenceInput =
    request.moduleId === "quiz-builder"
      ? buildQuizPreferenceContext(coerceQuizGenerationPreferences(request.quizPreferences))
      : "";
  const extraInput = request.extraInput?.trim()
    ? `\n\n教师补充输入（只用于当前模块细化，不得覆盖课程画像）：\n${request.extraInput.trim()}`
    : "";

  return [
    {
      role: "system",
      content: baseSystemPrompt
    },
    {
      role: "user",
      content: `当前任务：${agentModule.title}

${moduleInstructions[request.moduleId]}

课程画像（最高优先级）：
${buildContentAnchor(request.courseProfile)}

${buildCourseContext(request.courseProfile)}${slidePreferenceInput}${quizPreferenceInput}${extraInput}

输出协议：artifact-v1
你必须只输出一个严格 JSON 对象，不要输出 Markdown 代码块，不要输出解释性前后缀，不要使用注释。
JSON 键名必须与下面 schema 完全一致；所有内容值使用中文；数组不要为空。
字符串值内部不要使用英文双引号；如需引用课堂话术，请使用中文引号“”或单引号，避免破坏 JSON。
markdownFallback 字段必须包含同一成果的 Markdown 精简兼容版，供复制和旧版导出使用；控制在 800 个中文字符以内，不要放代码块，不要放大表格。

当前模块 schema：
${artifactSchemas[request.moduleId]}

质量要求：
- 成果必须能直接用于教师备课，不要只给方法论。
- 成果标题必须包含或明确指向课程名称/主题；知识图谱节点必须属于本课主题，不得从学习对象字段里的旧学科词汇扩展出另一门课。
- 体现高校教师真实工作场景，强调可编辑、可落地、可评价。
- 结构化字段是主要成果，markdownFallback 只是短版摘要。
- 当当前模块是 slide-outline 时，contentDirection、stylePreset、templateId 和 slides[].layoutVariant 必须使用 schema 中列出的英文枚举值；stylePreset/templateId 必须等于课件生成偏好指定值，整套课件至少混合 3 种 layoutVariant，封面/目标/活动/总结等页面要有明显版式差异。
- 当当前模块是 slide-outline 时，不要只给短标题和短要点；每页必须包含可直接授课的 detail、examples、teacherNotes 和 teacherScript，正文内容面向学生，teacherScript 面向教师备注视图。
- 当当前模块是 quiz-builder 时，题目数量、题型、难度和总分必须与试题生成偏好、blueprint、coverageMatrix 和 reviewSummary 相互一致；客观题至少 3 个选项且答案必须能对应到选项；简答题和案例题必须给出可操作评分点。
- 当当前模块是 homework-feedback 时，必须面向班级作业反馈闭环：assignmentContext 写清作业要求、评价证据和反馈关注点；rubric 至少 3 个维度；feedbackPhrases 至少 4 条；groupedFeedback 必须输出 2-4 组，且每组都有证据表现、教师反馈语和下一步任务；diagnosticSummary 必须区分班级优势、共性误区和下一课处理重点；teacherActionChecklist 必须给出可执行讲评、追问或二次批改动作；不得暴露学生姓名，合规提醒要体现隐私保护和发展性评价。
- 末尾的 markdownFallback 中也要包含“教师二次调整建议”。`
    }
  ];
}

export function getModuleIds() {
  return agentModules.map((module) => module.id);
}
