import type { AgentModule, CourseProfile } from "@/types/agent";

export const defaultCourseProfile: CourseProfile = {
  courseName: "计算机网络",
  topic: "传输层：可靠传输与拥塞控制",
  learnerProfile:
    "计算机相关专业本科二年级学生，已修读计算机导论课程，具备基本的上机实验与小组协作能力。",
  classDuration: "90分钟",
  teachingGoals:
    "理解可靠传输的基本机制，能够解释确认、重传、流量控制与拥塞控制如何协同保证可靠交付，并能结合课堂演示说明网络分层设计的价值。",
  existingMaterials:
    "教材章节包含可靠传输原理、滑动窗口、流量控制与拥塞控制，以及分组交换与端口复用的基本概念。希望课堂包含原理讲解、抓包观察和小型课堂练习。",
  constraints:
    "突出师范生教学实践能力；活动需在普通多媒体教室完成，可结合轻量网络仿真演示；输出材料需便于教师二次修改。"
};

export const agentModules: AgentModule[] = [
  {
    id: "knowledge-map",
    index: "01",
    title: "知识点梳理",
    shortTitle: "知识图谱",
    summary: "知识点、先修关系、易错点、重难点",
    extraInputLabel: "补充材料",
    placeholder: "可粘贴教材片段、课程大纲、学生已有基础或你希望强调的概念。"
  },
  {
    id: "lesson-plan",
    index: "02",
    title: "教案设计",
    shortTitle: "教案",
    summary: "目标、流程、活动、板书与评价",
    extraInputLabel: "教学偏好",
    placeholder: "可补充教学模式偏好，例如 BOPPPS、PBL、翻转课堂、案例教学等。"
  },
  {
    id: "slide-outline",
    index: "03",
    title: "课件大纲",
    shortTitle: "课件",
    summary: "页纲、讲授要点、互动提示",
    extraInputLabel: "课件要求",
    placeholder: "可说明希望控制的页数、视觉风格、案例或课堂互动密度。"
  },
  {
    id: "quiz-builder",
    index: "04",
    title: "试题组卷",
    shortTitle: "试题",
    summary: "客观题、简答题、案例题与解析",
    extraInputLabel: "测评要求",
    placeholder: "可补充题量、难度、题型比例、是否用于课前测或课后巩固。"
  },
  {
    id: "homework-feedback",
    index: "05",
    title: "作业反馈",
    shortTitle: "反馈",
    summary: "评价量规、诊断反馈、改进建议",
    extraInputLabel: "作业样例",
    placeholder: "可粘贴学生作业、课堂表现记录，或说明需要评价的学习产出。"
  }
];

export function getAgentModule(moduleId: AgentModule["id"]) {
  return agentModules.find((module) => module.id === moduleId);
}
