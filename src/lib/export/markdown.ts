import { agentModules } from "@/lib/agent/modules";
import { getResultMarkdown } from "@/lib/agent/results";
import type { CourseProfile, ModuleOutputs } from "@/types/agent";

export function safeFilename(input: string) {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function courseProfileToMarkdown(courseProfile: CourseProfile) {
  return `## 课程画像

| 项目 | 内容 |
| --- | --- |
| 课程名称 | ${courseProfile.courseName || "-"} |
| 主题/章节 | ${courseProfile.topic || "-"} |
| 学习对象 | ${courseProfile.learnerProfile || "-"} |
| 课时安排 | ${courseProfile.classDuration || "-"} |
| 教学目标 | ${courseProfile.teachingGoals || "-"} |
| 已有材料 | ${courseProfile.existingMaterials || "-"} |
| 约束条件 | ${courseProfile.constraints || "-"} |`;
}

export function buildModuleMarkdown(title: string, content: string) {
  return `# ${title}

${content.trim() || "暂无生成内容。"}`;
}

export function buildFullMarkdown(courseProfile: CourseProfile, outputs: ModuleOutputs) {
  const moduleSections = agentModules
    .map((module) => {
      const content = getResultMarkdown(outputs[module.id]);
      return `## ${module.index} ${module.title}

${content || "暂无生成内容。"}`;
    })
    .join("\n\n");

  return `# 高校备课助手成果包

${courseProfileToMarkdown(courseProfile)}

${moduleSections}

## 智能体使用说明

- 本原型聚焦教学辅助智能体赛道，服务教师课前备课、教案设计、课件准备、试题组卷与作业反馈。
- 本地原型无需账号；公开部署版本可按需增加访问码或测试账号。
- 输出内容由教师审核后用于真实课堂，涉及学生作业时应去标识化处理。`;
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
