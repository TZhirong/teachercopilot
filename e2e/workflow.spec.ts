import { expect, test } from "playwright/test";

const knowledgeMapArtifact = {
  schemaVersion: "artifact-v1",
  moduleId: "knowledge-map",
  title: "计算机网络知识图谱",
  nodes: [
    { id: "n1", label: "可靠传输", level: 1, summary: "保证数据可靠交付。" },
    { id: "n2", label: "确认与重传", level: 2, summary: "通过确认和重传保证可靠。" }
  ],
  edges: [{ source: "n1", target: "n2", label: "支撑" }],
  prerequisites: [{ title: "分组交换", detail: "理解数据包转发。" }],
  keyPoints: [{ type: "重点", title: "可靠传输", strategy: "用丢包场景讲解。" }],
  misconceptions: [{ title: "可靠等于无丢包", correction: "可靠不等于不丢包。", prompt: "丢包后如何保证？" }],
  activities: [{ title: "抓包观察", steps: ["观察重传", "讨论机制"] }],
  markdownFallback: "## 计算机网络知识图谱\n\n教师二次调整建议：无。"
};

const lessonPlanArtifact = {
  schemaVersion: "artifact-v1",
  moduleId: "lesson-plan",
  title: "计算机网络教案",
  objectives: [{ dimension: "知识", objective: "理解可靠传输。", evidence: "能解释确认重传。" }],
  keyPoints: [{ type: "重点", title: "可靠传输", strategy: "案例讲解。" }],
  timeline: [
    { phase: "导入", duration: "10分钟", teacherActions: ["提问"], studentActions: ["回答"], assessment: "观察" }
  ],
  materials: ["课件"],
  blackboardDesign: "可靠传输机制",
  adjustmentTips: ["替换案例"],
  markdownFallback: "## 计算机网络教案\n\n教师二次调整建议：无。"
};

test("备课主流程：画像→生成→停止→重试→切换模块", async ({ page }) => {
  let mode: "success" | "delay" | "invalid" = "success";

  await page.route("**/api/agent/stream", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { ready: true, missing: [], protocol: "openai" } });
    }

    const body = route.request().postDataJSON() as { moduleId: string };
    const artifact = body.moduleId === "lesson-plan" ? lessonPlanArtifact : knowledgeMapArtifact;

    if (mode === "delay") {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    if (mode === "invalid") {
      return route.fulfill({ body: "{ 这不是合法 JSON", contentType: "text/plain; charset=utf-8" });
    }

    return route.fulfill({
      body: JSON.stringify(artifact),
      contentType: "text/plain; charset=utf-8"
    });
  });

  await page.goto("/");

  // 1. 空态
  await expect(page.locator(".empty-output")).toBeVisible();

  // 2. 填写课程画像
  await page.getByLabel("课程名称").fill("计算机网络");
  await page.getByLabel("主题/章节").fill("可靠传输与拥塞控制");

  // 3. 生成（默认知识图谱模块）→ 成功
  await page.getByRole("button", { name: "生成知识图谱" }).click();
  await expect(page.locator(".preview-hero")).toBeVisible();

  // 4. 生成中 + 可停止
  mode = "delay";
  await page.getByRole("button", { name: "生成知识图谱" }).click();
  await expect(page.locator(".artifact-skeleton")).toBeVisible();
  const stopButton = page.getByRole("button", { name: "停止" });
  await expect(stopButton).toBeEnabled();
  await stopButton.click();
  await expect(page.getByText("已停止生成")).toBeVisible();

  // 5. 失败可重试
  mode = "invalid";
  await page.getByRole("button", { name: "生成知识图谱" }).click();
  await expect(page.locator(".fallback-output")).toBeVisible();
  mode = "success";
  await page.getByRole("button", { name: "生成知识图谱" }).click();
  await expect(page.locator(".preview-hero")).toBeVisible();

  // 6. 切换模块（画像不丢）
  await page.getByRole("tab", { name: /教案/ }).click();
  await expect(page.getByLabel("课程名称")).toHaveValue("计算机网络");
  await expect(page.getByLabel("主题/章节")).toHaveValue("可靠传输与拥塞控制");
  await expect(page.getByRole("button", { name: "生成教案" })).toBeVisible();
});

for (const width of [1440, 1024, 768]) {
  test(`三档宽度不溢出 @${width}px`, async ({ page }) => {
    await page.route("**/api/agent/stream", (route) =>
      route.fulfill({ json: { ready: true, missing: [], protocol: "openai" } })
    );

    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasOverflow).toBe(false);

    await expect(page.getByRole("button", { name: "生成知识图谱" })).toBeVisible();
    await expect(page.getByRole("button", { name: /导出/ }).first()).toBeVisible();
  });
}
