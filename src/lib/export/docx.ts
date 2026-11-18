import { agentModules } from "@/lib/agent/modules";
import { getResultMarkdown } from "@/lib/agent/results";
import type {
  CourseProfile,
  HomeworkFeedbackArtifact,
  LessonPlanArtifact,
  ModuleOutputs,
  QuizBuilderArtifact
} from "@/types/agent";

type DocxModule = typeof import("docx");
type DocBlock = import("docx").FileChild;

const contentWidth = 9638;
const borderColor = "DDE3EC";
const headingFill = "E8EFF9";

export async function buildDocxBlob(courseProfile: CourseProfile, outputs: ModuleOutputs) {
  const docx = await import("docx");
  const children: DocBlock[] = [
    title(docx, "高校备课助手成果包"),
    heading(docx, "课程画像", 1),
    profileTable(docx, courseProfile),
    ...agentModules.flatMap((module) => [
      heading(docx, `${module.index} ${module.title}`, 1),
      ...markdownToParagraphs(docx, getResultMarkdown(outputs[module.id]) || "暂无生成内容。")
    ]),
    heading(docx, "智能体使用说明", 1),
    ...bullets(docx, [
      "本原型聚焦教学辅助智能体赛道，服务教师课前备课、教案设计、课件准备、试题组卷与作业反馈。",
      "本地原型无需账号；公开部署版本可按需增加访问码或测试账号。",
      "输出内容由教师审核后用于真实课堂，涉及学生作业时应去标识化处理。"
    ])
  ];

  return pack(docx, children);
}

export async function buildLessonPlanDocxBlob(
  courseProfile: CourseProfile,
  artifact: LessonPlanArtifact
) {
  const docx = await import("docx");
  const children: DocBlock[] = [
    title(docx, artifact.title || "教案设计"),
    heading(docx, "课程画像", 1),
    profileTable(docx, courseProfile),
    heading(docx, "教学目标", 1),
    table(
      docx,
      ["维度", "目标", "达成证据"],
      artifact.objectives.map((item) => [item.dimension, item.objective, item.evidence]),
      [1800, 5200, 2638]
    ),
    heading(docx, "教学重难点", 1),
    table(
      docx,
      ["类型", "名称", "突破策略"],
      artifact.keyPoints.map((item) => [item.type, item.title, item.strategy]),
      [1400, 3000, 5238]
    ),
    heading(docx, "教学流程", 1),
    table(
      docx,
      ["环节", "时间", "教师活动", "学生活动", "评价"],
      artifact.timeline.map((item) => [
        item.phase,
        item.duration,
        item.teacherActions.join("\n"),
        item.studentActions.join("\n"),
        item.assessment
      ]),
      [1400, 1100, 2650, 2650, 1838]
    ),
    heading(docx, "材料准备", 1),
    ...bullets(docx, artifact.materials),
    heading(docx, "板书/课件结构", 1),
    paragraph(docx, artifact.blackboardDesign || "暂无。"),
    heading(docx, "教师二次调整建议", 1),
    ...bullets(docx, artifact.adjustmentTips)
  ];

  return pack(docx, children);
}

export async function buildQuizDocxBlob(
  courseProfile: CourseProfile,
  artifact: QuizBuilderArtifact
) {
  return buildQuizTeacherDocxBlob(courseProfile, artifact);
}

export async function buildQuizStudentDocxBlob(
  courseProfile: CourseProfile,
  artifact: QuizBuilderArtifact
) {
  const docx = await import("docx");
  const children: DocBlock[] = [
    title(docx, `${artifact.title || "试题组卷"}（学生卷）`),
    heading(docx, "课程画像", 1),
    profileTable(docx, courseProfile),
    ...quizBlueprintBlocks(docx, artifact),
    heading(docx, "试题卷", 1),
    ...artifact.questions.flatMap((question) => [
      heading(docx, `${question.id} ${question.type}（${question.score}分）`, 2),
      ...(question.knowledgePoint ? [paragraph(docx, `知识点：${question.knowledgePoint}`)] : []),
      paragraph(docx, question.stem),
      ...bullets(docx, question.options),
      paragraph(docx, "答题区："),
      paragraph(docx, " "),
      paragraph(docx, " ")
    ])
  ];

  return pack(docx, children);
}

export async function buildQuizTeacherDocxBlob(
  courseProfile: CourseProfile,
  artifact: QuizBuilderArtifact
) {
  const docx = await import("docx");
  const children: DocBlock[] = [
    title(docx, `${artifact.title || "试题组卷"}（教师用卷）`),
    heading(docx, "课程画像", 1),
    profileTable(docx, courseProfile),
    ...quizBlueprintBlocks(docx, artifact),
    ...quizCoverageBlocks(docx, artifact),
    heading(docx, "试题卷", 1),
    ...artifact.questions.flatMap((question) => [
      heading(docx, `${question.id} ${question.type}（${question.score}分）`, 2),
      ...(question.knowledgePoint ? [paragraph(docx, `知识点：${question.knowledgePoint}`)] : []),
      ...(question.diagnosticTag ? [paragraph(docx, `诊断标签：${question.diagnosticTag}`)] : []),
      paragraph(docx, question.stem),
      ...bullets(docx, question.options)
    ]),
    heading(docx, "答案与解析", 1),
    ...artifact.questions.flatMap((question) => [
      heading(docx, `${question.id} 参考答案`, 2),
      paragraph(docx, question.answer || "暂无参考答案。"),
      paragraph(docx, `解析：${question.analysis || "暂无解析。"}`),
      paragraph(docx, "评分要点："),
      ...bullets(docx, question.scoringPoints)
    ]),
    heading(docx, "教学诊断建议", 1),
    ...bullets(docx, artifact.diagnosisSuggestions)
  ];

  return pack(docx, children);
}

function quizBlueprintBlocks(docx: DocxModule, artifact: QuizBuilderArtifact) {
  return [
    heading(docx, "试卷蓝图", 1),
    table(
      docx,
      ["题型", "数量", "分值", "难度", "知识点", "测评目标"],
      artifact.blueprint.map((item) => [
        item.questionType,
        String(item.count),
        String(item.score),
        item.difficulty,
        item.knowledgePoint || "-",
        item.objective || "-"
      ]),
      [1500, 900, 900, 1300, 2200, 2838]
    )
  ];
}

function quizCoverageBlocks(docx: DocxModule, artifact: QuizBuilderArtifact) {
  const summary = artifact.reviewSummary;
  const summaryRows = summary
    ? [
        ["总题数", String(summary.totalQuestions)],
        ["总分", String(summary.totalScore)],
        ["预计用时", `${summary.estimatedMinutes} 分钟`],
        ["覆盖状态", summary.coverageStatus]
      ]
    : [];

  return [
    heading(docx, "试卷摘要", 1),
    table(docx, ["项目", "内容"], summaryRows, [1900, contentWidth - 1900]),
    heading(docx, "知识点覆盖矩阵", 1),
    table(
      docx,
      ["知识点", "测评目标", "题号", "难度"],
      (artifact.coverageMatrix || []).map((item) => [
        item.knowledgePoint,
        item.objective,
        item.questionIds.join(" / "),
        item.difficulty
      ]),
      [2400, 3200, 1900, 2138]
    )
  ];
}

export async function buildHomeworkFeedbackDocxBlob(
  courseProfile: CourseProfile,
  artifact: HomeworkFeedbackArtifact
) {
  const docx = await import("docx");
  const children: DocBlock[] = [
    title(docx, artifact.title || "作业反馈"),
    heading(docx, "课程画像", 1),
    profileTable(docx, courseProfile),
    heading(docx, "作业情境", 1),
    table(
      docx,
      ["项目", "内容"],
      [
        ["任务要求", artifact.assignmentContext?.taskDescription || "暂无。"],
        ["评价证据", (artifact.assignmentContext?.expectedEvidence || []).join("\n") || "暂无。"],
        ["反馈关注点", (artifact.assignmentContext?.feedbackFocus || []).join("\n") || "暂无。"]
      ],
      [1900, contentWidth - 1900]
    ),
    heading(docx, "评价量规", 1),
    table(
      docx,
      ["维度", "优秀", "合格", "待改进"],
      artifact.rubric.map((item) => [
        item.dimension,
        item.excellent,
        item.qualified,
        item.needsImprovement
      ]),
      [1700, 2700, 2600, 2638]
    ),
    heading(docx, "班级诊断摘要", 1),
    table(
      docx,
      ["项目", "内容"],
      [
        ["整体水平", artifact.diagnosticSummary?.overallLevel || "暂无。"],
        ["班级优势", (artifact.diagnosticSummary?.classStrengths || []).join("\n") || "暂无。"],
        [
          "共性误区",
          (artifact.diagnosticSummary?.commonMisconceptions || []).join("\n") || "暂无。"
        ],
        [
          "下一课重点",
          (artifact.diagnosticSummary?.nextLessonFocus || []).join("\n") || "暂无。"
        ]
      ],
      [1900, contentWidth - 1900]
    ),
    heading(docx, "反馈语库", 1),
    table(
      docx,
      ["适用情境", "反馈语"],
      artifact.feedbackPhrases.map((item) => [item.scenario, item.phrase]),
      [2800, 6838]
    ),
    heading(docx, "分层反馈建议", 1),
    table(
      docx,
      ["表现类型", "证据表现", "教师反馈", "下一步任务"],
      (artifact.groupedFeedback || []).map((item) => [
        item.group,
        item.evidencePattern,
        item.teacherFeedback,
        item.nextStep
      ]),
      [1900, 2500, 3300, 2038]
    ),
    heading(docx, "个性化改进建议", 1),
    ...bullets(docx, artifact.improvementSuggestions),
    heading(docx, "班级共性问题处理", 1),
    ...bullets(docx, artifact.classIssues),
    heading(docx, "教师复盘清单", 1),
    ...bullets(docx, artifact.teacherActionChecklist || []),
    heading(docx, "合规提醒", 1),
    ...bullets(docx, artifact.complianceNotes)
  ];

  return pack(docx, children);
}

async function pack(docx: DocxModule, children: DocBlock[]) {
  const doc = new docx.Document({
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: 22 },
          paragraph: { spacing: { after: 120 } }
        }
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 30, bold: true, font: "Microsoft YaHei", color: "244A80" },
          paragraph: { spacing: { before: 260, after: 160 }, outlineLevel: 0 }
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 25, bold: true, font: "Microsoft YaHei", color: "2D5B9A" },
          paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 }
        }
      ]
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: docx.LevelFormat.BULLET,
              text: "•",
              alignment: docx.AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 520, hanging: 260 } } }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838
            },
            margin: {
              top: 1134,
              right: 1134,
              bottom: 1134,
              left: 1134
            }
          }
        },
        children
      }
    ]
  });

  return docx.Packer.toBlob(doc);
}

function title(docx: DocxModule, text: string) {
  return new docx.Paragraph({
    heading: docx.HeadingLevel.TITLE,
    alignment: docx.AlignmentType.CENTER,
    spacing: { after: 260 },
    children: [new docx.TextRun({ text, bold: true, size: 36, color: "244A80" })]
  });
}

function heading(docx: DocxModule, text: string, level: 1 | 2) {
  return new docx.Paragraph({
    text,
    heading: level === 1 ? docx.HeadingLevel.HEADING_1 : docx.HeadingLevel.HEADING_2
  });
}

function paragraph(docx: DocxModule, text: string) {
  return new docx.Paragraph({
    children: [new docx.TextRun({ text: text || "暂无。" })]
  });
}

function bullets(docx: DocxModule, items: string[]) {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (normalized.length === 0) return [paragraph(docx, "暂无。")];

  return normalized.map(
    (item) =>
      new docx.Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new docx.TextRun(item)]
      })
  );
}

function profileTable(docx: DocxModule, courseProfile: CourseProfile) {
  return table(
    docx,
    ["项目", "内容"],
    [
      ["课程名称", courseProfile.courseName || "-"],
      ["主题/章节", courseProfile.topic || "-"],
      ["学习对象", courseProfile.learnerProfile || "-"],
      ["课时安排", courseProfile.classDuration || "-"],
      ["教学目标", courseProfile.teachingGoals || "-"],
      ["已有材料", courseProfile.existingMaterials || "-"],
      ["约束条件", courseProfile.constraints || "-"]
    ],
    [1900, contentWidth - 1900]
  );
}

function table(docx: DocxModule, headers: string[], rows: string[][], columnWidths: number[]) {
  const normalizedRows = rows.length > 0 ? rows : [headers.map(() => "暂无。")];
  const borders = {
    top: { style: docx.BorderStyle.SINGLE, size: 1, color: borderColor },
    bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: borderColor },
    left: { style: docx.BorderStyle.SINGLE, size: 1, color: borderColor },
    right: { style: docx.BorderStyle.SINGLE, size: 1, color: borderColor }
  };

  return new docx.Table({
    width: { size: contentWidth, type: docx.WidthType.DXA },
    columnWidths,
    rows: [
      new docx.TableRow({
        children: headers.map((header, index) =>
          cell(docx, header, columnWidths[index] || 1800, true, borders)
        )
      }),
      ...normalizedRows.map(
        (row) =>
          new docx.TableRow({
            children: headers.map((_, index) =>
              cell(docx, row[index] || "-", columnWidths[index] || 1800, false, borders)
            )
          })
      )
    ]
  });
}

function cell(
  docx: DocxModule,
  text: string,
  width: number,
  isHeader: boolean,
  borders: import("docx").ITableBordersOptions
) {
  return new docx.TableCell({
    borders,
    width: { size: width, type: docx.WidthType.DXA },
    shading: isHeader ? { fill: headingFill, type: docx.ShadingType.CLEAR } : undefined,
    verticalAlign: docx.VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: text.split(/\n+/).map(
      (line) =>
        new docx.Paragraph({
          children: [new docx.TextRun({ text: line.trim() || "-", bold: isHeader })]
        })
    )
  });
}

function markdownToParagraphs(docx: DocxModule, markdown: string) {
  return markdown
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("### ")) return heading(docx, line.slice(4), 2);
      if (line.startsWith("## ")) return heading(docx, line.slice(3), 1);
      if (line.startsWith("# ")) return heading(docx, line.slice(2), 1);
      if (/^[-*]\s+/.test(line)) return bullets(docx, [line.replace(/^[-*]\s+/, "")])[0];
      if (/^\d+\.\s+/.test(line)) return bullets(docx, [line.replace(/^\d+\.\s+/, "")])[0];
      if (line.startsWith("|")) return paragraph(docx, line.replace(/\|/g, "  "));
      return paragraph(docx, line);
    });
}
