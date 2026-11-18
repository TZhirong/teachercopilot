import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "高校备课助手 · Faculty Prep Copilot",
  description: "面向高校教师的备课辅助智能体 Web 原型"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
