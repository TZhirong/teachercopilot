"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileArchive,
  FileText,
  Layers3,
  Loader2,
  Moon,
  Package,
  PanelLeft,
  Play,
  RefreshCw,
  Settings,
  Square,
  Sun,
  Workflow,
  X
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArtifactPreview } from "@/components/ArtifactPreview";
import { agentModules, defaultCourseProfile } from "@/lib/agent/modules";
import { buildAgentMessages } from "@/lib/agent/prompts";
import {
  coerceQuizGenerationPreferences,
  defaultQuizGenerationPreferences,
  quizAssessmentPurposeOptions,
  quizDifficultyMixOptions,
  quizQuestionTypeOptions
} from "@/lib/agent/quiz-preferences";
import {
  buildCourseProfileSignature,
  filterOutputsForCourse,
  getResultMarkdown,
  hasResult,
  migrateModuleOutputs,
  parseArtifactResult,
  pruneOutputsForCourse,
  validateResultMatchesCourse
} from "@/lib/agent/results";
import {
  coerceSlideGenerationPreferences,
  defaultSlideGenerationPreferences,
  recommendSlideStylePreset,
  slideContentDirectionOptions,
  slideStylePresetOptions
} from "@/lib/agent/slide-preferences";
import {
  buildArtifactPackageZip,
  buildModuleExportFiles
} from "@/lib/export/artifacts";
import { buildDocxBlob } from "@/lib/export/docx";
import {
  buildFullMarkdown,
  buildModuleMarkdown,
  downloadBlob,
  downloadTextFile,
  safeFilename
} from "@/lib/export/markdown";
import type {
  CourseProfile,
  ModuleId,
  ModuleOutputs,
  QuizAssessmentPurpose,
  QuizDifficultyMix,
  QuizGenerationPreferences,
  QuizQuestionType,
  SlideContentDirection,
  SlideGenerationPreferences,
  SlideStylePreset
} from "@/types/agent";

const storageKey = "faculty-prep-copilot:v1";
const legacyStorageKey = "faculty-prep-copilot:v0";
const apiConfigStorageKey = "faculty-prep-copilot:api-config";

type ClientApiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type PersistedState = {
  courseProfile?: CourseProfile;
  activeModuleId?: ModuleId;
  extraInputs?: Partial<Record<ModuleId, string>>;
  quizPreferences?: unknown;
  slidePreferences?: unknown;
  slideStyleTouched?: boolean;
  outputs?: unknown;
};

const fieldConfig: Array<{
  key: keyof CourseProfile;
  label: string;
  multiline?: boolean;
}> = [
  { key: "courseName", label: "课程名称" },
  { key: "topic", label: "主题/章节" },
  { key: "learnerProfile", label: "学习对象", multiline: true },
  { key: "classDuration", label: "课时安排" },
  { key: "teachingGoals", label: "教学目标", multiline: true },
  { key: "existingMaterials", label: "已有材料", multiline: true },
  { key: "constraints", label: "约束条件", multiline: true }
];

const primaryFieldKeys: Array<keyof CourseProfile> = [
  "courseName",
  "topic",
  "learnerProfile",
  "classDuration"
];

const advancedFieldKeys: Array<keyof CourseProfile> = [
  "teachingGoals",
  "existingMaterials",
  "constraints"
];

const moduleIcons: Record<ModuleId, ComponentType<{ size?: number; className?: string }>> = {
  "knowledge-map": Layers3,
  "lesson-plan": BookOpen,
  "slide-outline": Workflow,
  "quiz-builder": ClipboardCheck,
  "homework-feedback": FileText
};

const moduleFileLabels: Record<ModuleId, string> = {
  "knowledge-map": "SVG + HTML",
  "lesson-plan": "DOCX",
  "slide-outline": "PPTX",
  "quiz-builder": "学生卷 + 教师卷",
  "homework-feedback": "DOCX"
};

export function AgentWorkbench() {
  const [courseProfile, setCourseProfile] = useState<CourseProfile>(defaultCourseProfile);
  const [slidePreferences, setSlidePreferences] = useState<SlideGenerationPreferences>({
    ...defaultSlideGenerationPreferences,
    stylePreset: recommendSlideStylePreset(defaultCourseProfile)
  });
  const [quizPreferences, setQuizPreferences] = useState<QuizGenerationPreferences>({
    ...defaultQuizGenerationPreferences
  });
  const [slideStyleTouched, setSlideStyleTouched] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>("knowledge-map");
  const [extraInputs, setExtraInputs] = useState<Partial<Record<ModuleId, string>>>({});
  const [outputs, setOutputs] = useState<ModuleOutputs>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingModuleId, setStreamingModuleId] = useState<ModuleId | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState<ClientApiConfig | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<ClientApiConfig>({
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-chat"
  });
  const abortRef = useRef<AbortController | null>(null);
  const courseProfileSignatureRef = useRef("");

  const activeModule = useMemo(
    () => agentModules.find((module) => module.id === activeModuleId) ?? agentModules[0],
    [activeModuleId]
  );
  const courseProfileSignature = useMemo(
    () => buildCourseProfileSignature(courseProfile),
    [courseProfile]
  );
  const recommendedSlideStylePreset = useMemo(
    () => recommendSlideStylePreset(courseProfile),
    [courseProfile]
  );
  const currentOutputs = useMemo(
    () => filterOutputsForCourse(outputs, courseProfileSignature),
    [courseProfileSignature, outputs]
  );
  const activeResult = currentOutputs[activeModuleId];
  const activeMarkdown = getResultMarkdown(activeResult);
  const completed = completedCount(currentOutputs);
  const hasAnyOutput = agentModules.some((module) => hasResult(currentOutputs[module.id]));
  const isActiveGenerating = isGenerating && streamingModuleId === activeModuleId;
  const isSlideMode = activeModuleId === "slide-outline";
  const isQuizMode = activeModuleId === "quiz-builder";
  const isApiReady = Boolean(apiConfig);

  useEffect(() => {
    window.queueMicrotask(() => {
      try {
        const saved =
          window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as PersistedState;
          const loadedCourseProfile = { ...defaultCourseProfile, ...(parsed.courseProfile || {}) };
          const migratedOutputs = migrateModuleOutputs(parsed.outputs);
          const prunedOutputs = pruneOutputsForCourse(
            migratedOutputs,
            buildCourseProfileSignature(loadedCourseProfile)
          );

          setCourseProfile(loadedCourseProfile);
          setActiveModuleId(isModuleId(parsed.activeModuleId) ? parsed.activeModuleId : "knowledge-map");
          setExtraInputs(parsed.extraInputs || {});
          setQuizPreferences(coerceQuizGenerationPreferences(parsed.quizPreferences));
          setSlidePreferences(
            coerceSlideGenerationPreferences(parsed.slidePreferences, loadedCourseProfile)
          );
          setSlideStyleTouched(Boolean(parsed.slideStyleTouched));
          setOutputs(prunedOutputs.outputs);
          if (prunedOutputs.removed) {
            setNotice(
              `已清理 ${prunedOutputs.removed} 个旧课程成果，请按当前课程画像重新生成。`
            );
          }
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    courseProfileSignatureRef.current = courseProfileSignature;
  }, [courseProfileSignature]);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedState = {
      courseProfile,
      activeModuleId,
      extraInputs,
      quizPreferences,
      slidePreferences,
      slideStyleTouched,
      outputs
    };
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [
    activeModuleId,
    courseProfile,
    extraInputs,
    hydrated,
    outputs,
    quizPreferences,
    slidePreferences,
    slideStyleTouched
  ]);

  useEffect(() => {
    window.queueMicrotask(() => {
      const saved = window.localStorage.getItem("faculty-prep-copilot:theme");
      let initial: "light" | "dark" = "light";
      if (saved === "dark" || saved === "light") {
        initial = saved;
      } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        initial = "dark";
      }
      setTheme(initial);
      document.documentElement.setAttribute("data-theme", initial);
    });
  }, []);

  useEffect(() => {
    window.queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(apiConfigStorageKey);
        if (saved) {
          setApiConfig(JSON.parse(saved) as ClientApiConfig);
        }
      } catch {
        window.localStorage.removeItem(apiConfigStorageKey);
      }
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("faculty-prep-copilot:theme", next);
  }

  function openConfigDialog() {
    setConfigDraft({
      baseUrl: apiConfig?.baseUrl || "https://api.deepseek.com",
      apiKey: apiConfig?.apiKey || "",
      model: apiConfig?.model || "deepseek-chat"
    });
    setError("");
    setConfigOpen(true);
  }

  function saveApiConfig(config: ClientApiConfig) {
    setApiConfig(config);
    window.localStorage.setItem(apiConfigStorageKey, JSON.stringify(config));
    setConfigOpen(false);
    setNotice("DeepSeek API 配置已保存到本浏览器");
  }

  function deleteApiConfig() {
    setApiConfig(null);
    window.localStorage.removeItem(apiConfigStorageKey);
    setConfigDraft({ baseUrl: "https://api.deepseek.com", apiKey: "", model: "deepseek-chat" });
    setNotice("已删除本浏览器保存的 DeepSeek API 配置");
  }

  function handleConfigSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const config = {
      baseUrl: configDraft.baseUrl.trim(),
      apiKey: configDraft.apiKey.trim(),
      model: configDraft.model.trim()
    };
    if (!config.baseUrl || !config.apiKey || !config.model) {
      setError("请完整填写 API 基础地址、API Key 和模型名称。");
      return;
    }
    if (!isAscii(config.baseUrl) || !isAscii(config.apiKey) || !isAscii(config.model)) {
      setError("API 配置里含有非英文字符（如中文/全角符号），请检查后重新填写。");
      return;
    }
    saveApiConfig(config);
  }

  function updateCourseField(key: keyof CourseProfile, value: string) {
    if (courseProfile[key] === value) return;

    const hadOutputs = agentModules.some((module) => hasResult(outputs[module.id]));
    const nextCourseProfile = { ...courseProfile, [key]: value };

    setCourseProfile(nextCourseProfile);
    if (!slideStyleTouched) {
      setSlidePreferences((current) => ({
        ...current,
        stylePreset: recommendSlideStylePreset(nextCourseProfile)
      }));
    }

    if (hadOutputs) {
      setOutputs({});
      setNotice("课程画像已更新，旧成果已清理。请按当前画像重新生成。");
    }
  }

  function updateExtraInput(value: string) {
    setExtraInputs((current) => ({ ...current, [activeModuleId]: value }));
  }

  function updateSlideContentDirection(contentDirection: SlideContentDirection) {
    setSlidePreferences((current) => ({ ...current, contentDirection }));
  }

  function updateSlideStylePreset(stylePreset: SlideStylePreset) {
    setSlideStyleTouched(true);
    setSlidePreferences((current) => ({ ...current, stylePreset }));
  }

  function updateQuizAssessmentPurpose(assessmentPurpose: QuizAssessmentPurpose) {
    setQuizPreferences((current) => ({ ...current, assessmentPurpose }));
  }

  function updateQuizDifficultyMix(difficultyMix: QuizDifficultyMix) {
    setQuizPreferences((current) => ({ ...current, difficultyMix }));
  }

  function updateQuizQuestionCount(questionCount: number) {
    const nextCount = Math.max(3, Math.min(20, Math.round(questionCount)));
    setQuizPreferences((current) => ({ ...current, questionCount: nextCount }));
  }

  function toggleQuizQuestionType(questionType: QuizQuestionType) {
    setQuizPreferences((current) => {
      const hasType = current.questionTypes.includes(questionType);
      const nextTypes = hasType
        ? current.questionTypes.filter((item) => item !== questionType)
        : [...current.questionTypes, questionType];

      return {
        ...current,
        questionTypes: nextTypes.length ? nextTypes : current.questionTypes
      };
    });
  }

  async function generateActiveModule() {
    if (isGenerating || !activeModule) return;

    const moduleId = activeModuleId;
    const moduleTitle = activeModule.shortTitle;
    const requestCourseProfile = courseProfile;
    const requestCourseProfileSignature = courseProfileSignature;
    let accumulated = "";

    setError("");
    setNotice("");
    setStreamingText("");
    setStreamingModuleId(moduleId);
    setOutputs((current) => {
      const next = { ...current };
      delete next[moduleId];
      return next;
    });

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    try {
      if (!apiConfig) {
        throw new Error("请先配置 DeepSeek API。");
      }

      if (!isAscii(apiConfig.apiKey)) {
        throw new Error("API Key 含有非英文字符，请点击右上角齿轮重新配置。");
      }

      const messages = buildAgentMessages({
        moduleId,
        courseProfile: requestCourseProfile,
        extraInput: extraInputs[moduleId] || "",
        quizPreferences: moduleId === "quiz-builder" ? quizPreferences : undefined,
        slidePreferences: moduleId === "slide-outline" ? slidePreferences : undefined,
        generationOptions: { temperature: 0.6, outputMode: "artifact-v1" }
      });

      const baseUrl = apiConfig.baseUrl.replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiConfig.apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: apiConfig.model,
          messages,
          stream: true,
          temperature: 0.6,
          max_tokens: 8192
        })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("接口没有返回可读取的生成流。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = parsed.choices?.[0]?.delta?.content ?? "";
            if (content) {
              accumulated += content;
              setStreamingText(accumulated);
            }
          } catch {
            // 忽略非 JSON 行
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();
          if (data && data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content ?? "";
              if (content) {
                accumulated += content;
                setStreamingText(accumulated);
              }
            } catch {
              // 忽略
            }
          }
        }
      }

      if (courseProfileSignatureRef.current !== requestCourseProfileSignature) {
        setNotice(`${moduleTitle}已完成，但课程画像已变化，请按当前画像重新生成。`);
        return;
      }

      const result = parseArtifactResult(
        moduleId,
        accumulated,
        new Date().toISOString(),
        requestCourseProfileSignature
      );
      const courseMismatch = validateResultMatchesCourse(result, requestCourseProfile);
      if (courseMismatch) {
        setError(`${moduleTitle}未写入成果。${courseMismatch}`);
        return;
      }

      setOutputs((current) => ({ ...current, [moduleId]: result }));

      if (result.parseError) {
        setError(`${moduleTitle}已生成原文，但 JSON 结构不合法：${result.parseError}`);
      } else {
        setNotice(`${moduleTitle}结构化成果已生成`);
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        if (
          accumulated.trim() &&
          courseProfileSignatureRef.current === requestCourseProfileSignature
        ) {
          setOutputs((current) => ({
            ...current,
            [moduleId]: {
              rawText: accumulated,
              courseProfileSignature: requestCourseProfileSignature,
              markdownFallback: accumulated,
              generatedAt: new Date().toISOString(),
              parseError: "生成已停止，尚未形成完整 artifact-v1 JSON。"
            }
          }));
        }
        setNotice("已停止生成");
      } else {
        setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试。");
      }
    } finally {
      setIsGenerating(false);
      setStreamingText("");
      setStreamingModuleId(null);
      abortRef.current = null;
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function copyActiveOutput() {
    if (!activeMarkdown) return;
    await navigator.clipboard.writeText(activeMarkdown);
    setNotice("已复制 Markdown 兼容版");
  }

  function downloadActiveMarkdown() {
    if (!activeMarkdown) return;
    const filename = `${safeFilename(courseProfile.courseName)}-${activeModule.shortTitle}.md`;
    downloadTextFile(filename, buildModuleMarkdown(activeModule.title, activeMarkdown));
  }

  async function downloadActiveArtifactFiles() {
    if (!activeResult) return;
    setIsExporting(true);
    setError("");
    try {
      const files = await buildModuleExportFiles(courseProfile, activeModuleId, activeResult);
      files.forEach((file) => downloadBlob(file.filename, file.blob));
      setNotice(`已导出${activeModule.shortTitle}：${files.map((file) => file.filename).join(" / ")}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "当前模块导出失败。");
    } finally {
      setIsExporting(false);
    }
  }

  function downloadFullMarkdown() {
    const filename = `${safeFilename(courseProfile.courseName || "高校备课助手")}-成果包.md`;
    downloadTextFile(filename, buildFullMarkdown(courseProfile, currentOutputs));
  }

  async function downloadWord() {
    setIsExporting(true);
    setError("");
    try {
      const blob = await buildDocxBlob(courseProfile, currentOutputs);
      const filename = `${safeFilename(courseProfile.courseName || "高校备课助手")}-汇总说明.docx`;
      downloadBlob(filename, blob);
      setNotice("汇总 Word 已导出");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Word 导出失败。");
    } finally {
      setIsExporting(false);
    }
  }

  async function downloadZip() {
    setIsExporting(true);
    setError("");
    try {
      const blob = await buildArtifactPackageZip(courseProfile, currentOutputs);
      const filename = `${safeFilename(courseProfile.courseName || "高校备课助手")}-结构化成果包.zip`;
      downloadBlob(filename, blob);
      setNotice("ZIP 成果包已导出");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ZIP 导出失败。");
    } finally {
      setIsExporting(false);
    }
  }

  function resetDemo() {
    setCourseProfile(defaultCourseProfile);
    setExtraInputs({});
    setOutputs({});
    setActiveModuleId("knowledge-map");
    setQuizPreferences({ ...defaultQuizGenerationPreferences });
    setError("");
    setNotice("已恢复默认演示课程");
  }

  const canGenerate =
    Boolean(courseProfile.courseName.trim() && courseProfile.topic.trim()) &&
    isApiReady &&
    !isGenerating;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            智
          </div>
          <div className="brand-lockup">
            <p>教学辅助智能体</p>
            <h1>高校备课助手 · Faculty Prep Copilot</h1>
          </div>
        </div>

        <nav className="module-nav" role="tablist" aria-label="智能体模块">
          {agentModules.map((module) => {
            const Icon = moduleIcons[module.id];
            const selected = module.id === activeModuleId;
            const done = hasResult(currentOutputs[module.id]);

            return (
              <button
                className={`module-tab ${selected ? "selected" : ""} ${done ? "done" : ""}`}
                key={module.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveModuleId(module.id)}
                title={module.title}
              >
                <Icon size={16} />
                <strong>{module.shortTitle}</strong>
                <small>{module.index}</small>
                {done ? <CheckCircle2 className="done-mark" size={14} /> : null}
              </button>
            );
          })}
        </nav>

        <div className="header-tools">
          <span className="status-pill neutral">{completed} / 5</span>
          {isApiReady ? (
            <button
              className="status-pill ready"
              type="button"
              onClick={openConfigDialog}
              title="配置 DeepSeek API"
            >
              <CheckCircle2 size={14} />
              模型已就绪
            </button>
          ) : (
            <button
              className="status-pill warning"
              type="button"
              onClick={openConfigDialog}
              title="配置 DeepSeek API"
            >
              <AlertTriangle size={14} />
              缺少配置
            </button>
          )}
          <button className="icon-button" type="button" onClick={openConfigDialog} title="配置 DeepSeek API">
            <Settings size={16} />
          </button>
          <button className="icon-button" type="button" onClick={toggleTheme} title="切换暗色模式">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="export-menu">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setExportMenuOpen((current) => !current)}
              aria-expanded={exportMenuOpen}
            >
              <Download size={15} />
              导出
            </button>
            {exportMenuOpen ? (
              <div className="export-menu-panel">
                <button type="button" onClick={downloadZip} disabled={!hasAnyOutput || isExporting}>
                  <FileArchive size={15} />
                  打包 ZIP
                </button>
                <button type="button" onClick={downloadWord} disabled={!hasAnyOutput || isExporting}>
                  <FileText size={15} />
                  汇总 Word
                </button>
                <button type="button" onClick={downloadFullMarkdown} disabled={!hasAnyOutput}>
                  <Download size={15} />
                  兼容 Markdown
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSidebarOpen((current) => !current)}
            title={sidebarOpen ? "折叠课程画像" : "展开课程画像"}
            aria-pressed={!sidebarOpen}
          >
            <PanelLeft size={16} />
          </button>
        </div>
      </header>

      <div className={`workbench ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <aside className="sidebar" aria-label="课程画像与模块设置">
          <section className="sidebar-section">
            <header className="sidebar-head">
              <span className="section-index">01</span>
              <h2>课程画像</h2>
              <button className="ghost-button" type="button" onClick={resetDemo} title="恢复默认">
                <RefreshCw size={13} />
                默认
              </button>
            </header>
            <p className="sidebar-hint">只填一次，五个模块共享</p>
            <div className="course-form">
              {fieldConfig
                .filter((field) => primaryFieldKeys.includes(field.key))
                .map((field) => (
                  <CourseField
                    courseProfile={courseProfile}
                    field={field}
                    key={field.key}
                    onChange={updateCourseField}
                  />
                ))}
              <details className="advanced-fields">
                <summary>进阶材料与约束</summary>
                <div className="field-stack">
                  {fieldConfig
                    .filter((field) => advancedFieldKeys.includes(field.key))
                    .map((field) => (
                      <CourseField
                        courseProfile={courseProfile}
                        field={field}
                        key={field.key}
                        onChange={updateCourseField}
                      />
                    ))}
                </div>
              </details>
            </div>
          </section>

          <section className="sidebar-section">
            <header className="sidebar-head">
              <span className="section-index">02</span>
              <h2>模块补充要求</h2>
            </header>
            {isSlideMode ? (
              <SlidePreferenceControls
                preferences={slidePreferences}
                recommendedStylePreset={recommendedSlideStylePreset}
                onContentDirectionChange={updateSlideContentDirection}
                onStylePresetChange={updateSlideStylePreset}
              />
            ) : null}
            {isQuizMode ? (
              <QuizPreferenceControls
                preferences={quizPreferences}
                onAssessmentPurposeChange={updateQuizAssessmentPurpose}
                onDifficultyMixChange={updateQuizDifficultyMix}
                onQuestionCountChange={updateQuizQuestionCount}
                onQuestionTypeToggle={toggleQuizQuestionType}
              />
            ) : null}
            <label className="field extra-field">
              <span>{activeModule.extraInputLabel}</span>
              <textarea
                value={extraInputs[activeModuleId] || ""}
                onChange={(event) => updateExtraInput(event.target.value)}
                placeholder={activeModule.placeholder}
                rows={4}
              />
            </label>
          </section>

          <section className="sidebar-section sidebar-notes">
            <details className="submission-note">
              <summary>人工审核提示</summary>
              <p>生成内容属于教学辅助结果，投入真实课堂前请结合课程目标和学生情况进行人工审核。</p>
            </details>
          </section>
        </aside>

        <section className="main-stage" aria-label="生成工作区">
          <div className="stage-header">
            <div>
              <p className="eyebrow">模块 {activeModule.index} / 当前任务</p>
              <h2>{activeModule.title}</h2>
              <p>{activeModule.summary}</p>
            </div>
          </div>

          <div className="status-bar">
            <GenerationControls
              activeModuleShortTitle={activeModule.shortTitle}
              canGenerate={canGenerate}
              isGenerating={isGenerating}
              onGenerate={generateActiveModule}
              onStop={stopGeneration}
            />
            {isActiveGenerating ? (
              <span className="stream-status" aria-live="polite">
                已接收 {streamingText.length} 字
              </span>
            ) : null}
            <StatusMessages apiReady={isApiReady} error={error} notice={notice} />
          </div>

          <article className="output-pane">
            <ArtifactPreview
              result={activeResult}
              isGenerating={isActiveGenerating}
              streamingText={streamingText}
              title={activeModule.title}
            />
          </article>

          <div className="action-bar">
            <button
              className="secondary-button"
              type="button"
              onClick={copyActiveOutput}
              disabled={!activeMarkdown}
            >
              <Copy size={16} />
              复制 Markdown
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={downloadActiveMarkdown}
              disabled={!activeMarkdown}
            >
              <Download size={16} />
              Markdown
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={downloadActiveArtifactFiles}
              disabled={!activeResult || isExporting}
            >
              {isExporting ? <Loader2 className="spin" size={16} /> : <Package size={16} />}
              导出当前成果 · {moduleFileLabels[activeModuleId]}
            </button>
          </div>
        </section>
      </div>

      {configOpen ? (
        <div className="config-overlay" role="dialog" aria-modal="true" aria-label="配置 DeepSeek API">
          <div className="config-dialog">
            <header className="config-head">
              <h3>配置 DeepSeek API</h3>
              <button className="icon-button" type="button" onClick={() => setConfigOpen(false)} aria-label="关闭">
                <X size={16} />
              </button>
            </header>
            <form className="config-form" onSubmit={handleConfigSubmit}>
              <label className="field">
                <span>API 基础地址（Base URL）</span>
                <input
                  value={configDraft.baseUrl}
                  onChange={(event) =>
                    setConfigDraft((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  placeholder="https://api.deepseek.com"
                />
              </label>
              <label className="field">
                <span>API Key</span>
                <input
                  type="password"
                  value={configDraft.apiKey}
                  onChange={(event) =>
                    setConfigDraft((current) => ({ ...current, apiKey: event.target.value }))
                  }
                  placeholder="sk-..."
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>模型名称</span>
                <input
                  value={configDraft.model}
                  onChange={(event) =>
                    setConfigDraft((current) => ({ ...current, model: event.target.value }))
                  }
                  placeholder="deepseek-chat"
                />
              </label>
              <p className="config-note">
                配置仅保存在当前浏览器（localStorage），只用于调用你填写的 DeepSeek 服务。
              </p>
              <div className="config-actions">
                <button className="secondary-button" type="button" onClick={deleteApiConfig} disabled={!apiConfig}>
                  删除
                </button>
                <button className="primary-button" type="submit">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SlidePreferenceControls({
  preferences,
  recommendedStylePreset,
  onContentDirectionChange,
  onStylePresetChange
}: {
  preferences: SlideGenerationPreferences;
  recommendedStylePreset: SlideStylePreset;
  onContentDirectionChange: (contentDirection: SlideContentDirection) => void;
  onStylePresetChange: (stylePreset: SlideStylePreset) => void;
}) {
  const selectedDirection = slideContentDirectionOptions.find(
    (option) => option.id === preferences.contentDirection
  );

  return (
    <div className="slide-preference-panel">
      <section className="preference-group" aria-labelledby="slide-content-direction">
        <div className="preference-heading">
          <strong id="slide-content-direction">内容方向</strong>
          <span>{selectedDirection?.summary || "情境导入、案例分析、追问迁移"}</span>
        </div>
        <div className="preference-grid direction-grid" role="group" aria-label="课件内容方向">
          {slideContentDirectionOptions.map((option) => (
            <button
              className={`preference-option ${option.id === preferences.contentDirection ? "selected" : ""}`}
              key={option.id}
              type="button"
              onClick={() => onContentDirectionChange(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.summary}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="preference-group" aria-labelledby="slide-style-preset">
        <div className="preference-heading">
          <strong id="slide-style-preset">PPT 风格</strong>
          <span>html-ppt skill preset</span>
        </div>
        <div className="preference-grid style-grid" role="group" aria-label="PPT 风格">
          {slideStylePresetOptions.map((option) => {
            const selected = option.id === preferences.stylePreset;
            const recommended = option.id === recommendedStylePreset;

            return (
              <button
                className={`preference-option style-option ${selected ? "selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => onStylePresetChange(option.id)}
              >
                <span className="style-swatch" style={{ backgroundColor: `#${option.accent}` }} />
                <strong>{option.label}</strong>
                <small>
                  {option.id}
                  {recommended ? " · 推荐" : ""}
                </small>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function QuizPreferenceControls({
  preferences,
  onAssessmentPurposeChange,
  onDifficultyMixChange,
  onQuestionCountChange,
  onQuestionTypeToggle
}: {
  preferences: QuizGenerationPreferences;
  onAssessmentPurposeChange: (assessmentPurpose: QuizAssessmentPurpose) => void;
  onDifficultyMixChange: (difficultyMix: QuizDifficultyMix) => void;
  onQuestionCountChange: (questionCount: number) => void;
  onQuestionTypeToggle: (questionType: QuizQuestionType) => void;
}) {
  const selectedPurpose = quizAssessmentPurposeOptions.find(
    (option) => option.id === preferences.assessmentPurpose
  );
  const selectedDifficulty = quizDifficultyMixOptions.find(
    (option) => option.id === preferences.difficultyMix
  );

  return (
    <div className="slide-preference-panel quiz-preference-panel">
      <section className="preference-group" aria-labelledby="quiz-assessment-purpose">
        <div className="preference-heading">
          <strong id="quiz-assessment-purpose">测评目的</strong>
          <span>{selectedPurpose?.summary || "复盘重点、迁移应用"}</span>
        </div>
        <div className="preference-grid quiz-purpose-grid" role="group" aria-label="测评目的">
          {quizAssessmentPurposeOptions.map((option) => (
            <button
              className={`preference-option ${option.id === preferences.assessmentPurpose ? "selected" : ""}`}
              key={option.id}
              type="button"
              onClick={() => onAssessmentPurposeChange(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.summary}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="preference-group" aria-labelledby="quiz-question-count">
        <div className="preference-heading">
          <strong id="quiz-question-count">题量</strong>
          <span>{preferences.questionCount} 题</span>
        </div>
        <div className="quiz-count-control">
          <input
            aria-label="题量滑杆"
            max={20}
            min={3}
            onChange={(event) => onQuestionCountChange(Number(event.currentTarget.value))}
            type="range"
            value={preferences.questionCount}
          />
          <input
            aria-label="题量数字"
            max={20}
            min={3}
            onChange={(event) => onQuestionCountChange(Number(event.currentTarget.value))}
            type="number"
            value={preferences.questionCount}
          />
        </div>
      </section>

      <section className="preference-group" aria-labelledby="quiz-difficulty-mix">
        <div className="preference-heading">
          <strong id="quiz-difficulty-mix">难度结构</strong>
          <span>{selectedDifficulty?.summary || "基础/中等/挑战约 4:4:2"}</span>
        </div>
        <div className="preference-grid quiz-difficulty-grid" role="group" aria-label="难度结构">
          {quizDifficultyMixOptions.map((option) => (
            <button
              className={`preference-option ${option.id === preferences.difficultyMix ? "selected" : ""}`}
              key={option.id}
              type="button"
              onClick={() => onDifficultyMixChange(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.summary}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="preference-group" aria-labelledby="quiz-question-types">
        <div className="preference-heading">
          <strong id="quiz-question-types">题型组合</strong>
          <span>{preferences.questionTypes.length} 类题型</span>
        </div>
        <div className="preference-grid quiz-type-grid" role="group" aria-label="题型组合">
          {quizQuestionTypeOptions.map((option) => {
            const selected = preferences.questionTypes.includes(option.id);

            return (
              <button
                aria-pressed={selected}
                className={`preference-option ${selected ? "selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => onQuestionTypeToggle(option.id)}
              >
                <strong>{option.label}</strong>
                <small>{option.summary}</small>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function GenerationControls({
  activeModuleShortTitle,
  canGenerate,
  isGenerating,
  onGenerate,
  onStop
}: {
  activeModuleShortTitle: string;
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onStop: () => void;
}) {
  return (
    <div className="generation-bar">
      <button className="primary-button" type="button" onClick={onGenerate} disabled={!canGenerate}>
        {isGenerating ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
        生成{activeModuleShortTitle}
      </button>
      <button className="secondary-button" type="button" onClick={onStop} disabled={!isGenerating}>
        <Square size={15} />
        停止
      </button>
    </div>
  );
}

function StatusMessages({
  apiReady,
  error,
  notice
}: {
  apiReady: boolean;
  error: string;
  notice: string;
}) {
  return (
    <>
      {error ? <div className="message error">{error}</div> : null}
      {notice ? <div className="message success">{notice}</div> : null}
      {!apiReady ? (
        <div className="message warning-box">
          请配置 DeepSeek API：点击右上角「缺少配置」或齿轮图标填写。
        </div>
      ) : null}
    </>
  );
}

function CourseField({
  courseProfile,
  field,
  onChange
}: {
  courseProfile: CourseProfile;
  field: (typeof fieldConfig)[number];
  onChange: (key: keyof CourseProfile, value: string) => void;
}) {
  return (
    <label className="field" key={field.key}>
      <span>{field.label}</span>
      {field.multiline ? (
        <textarea
          value={courseProfile[field.key]}
          onChange={(event) => onChange(field.key, event.target.value)}
          rows={field.key === "existingMaterials" ? 4 : 3}
        />
      ) : (
        <input
          value={courseProfile[field.key]}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
    </label>
  );
}

function isAscii(value: string) {
  return /^[\x00-\x7F]*$/.test(value);
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { error?: string | { message?: string } };
    if (typeof data.error === "string") return data.error;
    if (data.error?.message) return data.error.message;
    return text || "请求失败。";
  } catch {
    return text || "请求失败。";
  }
}

function completedCount(outputs: ModuleOutputs) {
  return agentModules.filter((module) => hasResult(outputs[module.id])).length;
}

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && agentModules.some((module) => module.id === value);
}
