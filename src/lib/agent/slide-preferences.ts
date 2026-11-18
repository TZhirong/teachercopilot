import type {
  CourseProfile,
  SlideContentDirection,
  SlideGenerationPreferences,
  SlideStylePreset
} from "@/types/agent";

export const slideContentDirectionOptions: Array<{
  id: SlideContentDirection;
  label: string;
  summary: string;
  promptGuidance: string;
}> = [
  {
    id: "case-inquiry",
    label: "案例探究",
    summary: "情境导入、案例分析、追问迁移",
    promptGuidance:
      "用真实或拟真课堂案例导入，每 2-3 页安排一次追问或迁移判断，页面结构优先使用 case-card、two-column、summary。"
  },
  {
    id: "concept-teaching",
    label: "概念讲授",
    summary: "定义框架、结构拆解、易错辨析",
    promptGuidance:
      "围绕核心概念、关键关系和常见误区展开，页面结构优先使用 objectives、matrix、process、card-list。"
  },
  {
    id: "activity-co-creation",
    label: "活动共创",
    summary: "任务驱动、小组共创、课堂产出",
    promptGuidance:
      "把知识点转化为课堂任务、讨论流程和学生产出，页面结构优先使用 activity、process、two-column、summary。"
  },
  {
    id: "assessment-consolidation",
    label: "测评巩固",
    summary: "即时测验、反馈诊断、复盘巩固",
    promptGuidance:
      "围绕检测理解、错因诊断和课后巩固组织内容，页面结构优先使用 objectives、matrix、activity、summary。"
  }
];

export const slideStylePresetOptions: Array<{
  id: SlideStylePreset;
  label: string;
  summary: string;
  accent: string;
}> = [
  {
    id: "course-module",
    label: "教学模块",
    summary: "温暖纸感，适合通用课堂课件",
    accent: "B85C38"
  },
  {
    id: "academic-paper",
    label: "学术论文",
    summary: "克制严肃，适合理论与研究报告",
    accent: "1F5EA8"
  },
  {
    id: "corporate-clean",
    label: "正式汇报",
    summary: "清爽商务，适合项目复盘与工作汇报",
    accent: "165DFF"
  },
  {
    id: "tokyo-night",
    label: "技术夜色",
    summary: "深色技术感，适合代码、AI、工程课程",
    accent: "7AA2F7"
  },
  {
    id: "blueprint",
    label: "工程蓝图",
    summary: "网格蓝图，适合流程、架构与系统设计",
    accent: "1E66F5"
  }
];

export const defaultSlideGenerationPreferences: SlideGenerationPreferences = {
  contentDirection: "case-inquiry",
  stylePreset: "course-module"
};

const slideContentDirectionIds = new Set(slideContentDirectionOptions.map((option) => option.id));
const slideStylePresetIds = new Set(slideStylePresetOptions.map((option) => option.id));

export function getSlideContentDirectionOption(id: SlideContentDirection) {
  return (
    slideContentDirectionOptions.find((option) => option.id === id) ||
    slideContentDirectionOptions[0]
  );
}

export function getSlideStylePresetOption(id: SlideStylePreset) {
  return slideStylePresetOptions.find((option) => option.id === id) || slideStylePresetOptions[0];
}

export function recommendSlideStylePreset(courseProfile: CourseProfile): SlideStylePreset {
  const text = [
    courseProfile.courseName,
    courseProfile.topic,
    courseProfile.learnerProfile,
    courseProfile.teachingGoals,
    courseProfile.existingMaterials,
    courseProfile.constraints
  ]
    .join(" ")
    .toLowerCase();

  if (/java|python|javascript|代码|编程|算法|数据库|ai|人工智能|机器学习|技术|程序|软件|前端|后端|开发/u.test(text)) {
    return "tokyo-night";
  }

  if (/架构|流程|系统设计|链路|工程蓝图|工程图|机制图|模块关系/u.test(text)) {
    return "blueprint";
  }

  if (/学术|研究|论文|文献|课题|实验报告/u.test(text)) {
    return "academic-paper";
  }

  if (/汇报|复盘|项目|管理|评估|成果展示|工作坊/u.test(text)) {
    return "corporate-clean";
  }

  return "course-module";
}

export function coerceSlideGenerationPreferences(
  input: unknown,
  courseProfile: CourseProfile
): SlideGenerationPreferences {
  if (!isRecord(input)) {
    return {
      ...defaultSlideGenerationPreferences,
      stylePreset: recommendSlideStylePreset(courseProfile)
    };
  }

  const contentDirection = isSlideContentDirection(input.contentDirection)
    ? input.contentDirection
    : defaultSlideGenerationPreferences.contentDirection;
  const stylePreset = isSlideStylePreset(input.stylePreset)
    ? input.stylePreset
    : recommendSlideStylePreset(courseProfile);

  return { contentDirection, stylePreset };
}

export function isSlideContentDirection(value: unknown): value is SlideContentDirection {
  return typeof value === "string" && slideContentDirectionIds.has(value as SlideContentDirection);
}

export function isSlideStylePreset(value: unknown): value is SlideStylePreset {
  return typeof value === "string" && slideStylePresetIds.has(value as SlideStylePreset);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
