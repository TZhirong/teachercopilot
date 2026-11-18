import type { SlideLayoutVariant, SlideOutlineArtifact, SlideStylePreset } from "@/types/agent";

export interface PptxStyle {
  id: SlideStylePreset;
  label: string;
  templateId: SlideStylePreset;
  dark: boolean;
  fontHead: string;
  fontBody: string;
  fontMono: string;
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    ink: string;
    muted: string;
    accent: string;
    accent2: string;
    accent3: string;
    border: string;
    inverse: string;
    inverseText: string;
  };
}

export const pptxStylePresets: Record<SlideStylePreset, PptxStyle> = {
  "course-module": {
    id: "course-module",
    label: "Warm Course Module",
    templateId: "course-module",
    dark: false,
    fontHead: "Microsoft YaHei",
    fontBody: "Microsoft YaHei",
    fontMono: "Consolas",
    colors: {
      bg: "F7F1E7",
      surface: "FFFCF4",
      surfaceAlt: "EFE5D5",
      ink: "2A2118",
      muted: "746755",
      accent: "B85C38",
      accent2: "3A7D7A",
      accent3: "E7B75F",
      border: "D8CBB8",
      inverse: "102A2C",
      inverseText: "FFF7EA"
    }
  },
  "academic-paper": {
    id: "academic-paper",
    label: "Academic Paper",
    templateId: "academic-paper",
    dark: false,
    fontHead: "Microsoft YaHei",
    fontBody: "Microsoft YaHei",
    fontMono: "Consolas",
    colors: {
      bg: "FBFAF7",
      surface: "FFFFFF",
      surfaceAlt: "F0F3F7",
      ink: "171717",
      muted: "565D64",
      accent: "1F5EA8",
      accent2: "8A3FFC",
      accent3: "C78A20",
      border: "D9DDE4",
      inverse: "0F172A",
      inverseText: "F8FAFC"
    }
  },
  "corporate-clean": {
    id: "corporate-clean",
    label: "Corporate Clean",
    templateId: "corporate-clean",
    dark: false,
    fontHead: "Microsoft YaHei",
    fontBody: "Microsoft YaHei",
    fontMono: "Consolas",
    colors: {
      bg: "F6F8FB",
      surface: "FFFFFF",
      surfaceAlt: "EAF0F8",
      ink: "12213A",
      muted: "667085",
      accent: "165DFF",
      accent2: "12B981",
      accent3: "F59E0B",
      border: "D8DEE9",
      inverse: "061A3A",
      inverseText: "FFFFFF"
    }
  },
  "tokyo-night": {
    id: "tokyo-night",
    label: "Tokyo Night",
    templateId: "tokyo-night",
    dark: true,
    fontHead: "Microsoft YaHei",
    fontBody: "Microsoft YaHei",
    fontMono: "Consolas",
    colors: {
      bg: "111827",
      surface: "1A2236",
      surfaceAlt: "222D46",
      ink: "E6EDF7",
      muted: "A8B3CF",
      accent: "7AA2F7",
      accent2: "BB9AF7",
      accent3: "9ECE6A",
      border: "2B3655",
      inverse: "050816",
      inverseText: "E6EDF7"
    }
  },
  blueprint: {
    id: "blueprint",
    label: "Engineering Blueprint",
    templateId: "blueprint",
    dark: false,
    fontHead: "Microsoft YaHei",
    fontBody: "Microsoft YaHei",
    fontMono: "Consolas",
    colors: {
      bg: "EAF3FB",
      surface: "F8FCFF",
      surfaceAlt: "DCECF8",
      ink: "15304A",
      muted: "55708C",
      accent: "1E66F5",
      accent2: "0E7490",
      accent3: "B45309",
      border: "B7D3EA",
      inverse: "08243A",
      inverseText: "F8FCFF"
    }
  }
};

export function resolvePptxStyle(artifact: SlideOutlineArtifact) {
  return pptxStylePresets[artifact.stylePreset || "course-module"];
}

export function resolveSlideLayoutVariant(
  slide: SlideOutlineArtifact["slides"][number],
  index: number,
  total: number
): SlideLayoutVariant {
  if (slide.layoutVariant && slide.layoutVariant !== "cover") return slide.layoutVariant;
  if (index === total - 1) return "summary";

  const text = `${slide.title} ${slide.layout} ${slide.visualSuggestion} ${slide.interactionPrompt}`.toLowerCase();
  if (/目标|objective|成果|达成/.test(text)) return "objectives";
  if (/流程|步骤|路径|机制|链路|过程|process/.test(text)) return "process";
  if (/矩阵|表格|对比|比较|差异|维度|matrix/.test(text)) return "matrix";
  if (/案例|情境|场景|问题导入|case/.test(text)) return "case-card";
  if (/活动|讨论|练习|互动|任务|activity/.test(text)) return "activity";
  if (/两栏|左右|two-column/.test(text)) return "two-column";
  return "card-list";
}
