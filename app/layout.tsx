import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "弈境 · 新手围棋",
  description: "在新手学堂学习中国围棋规则与术语，从小棋盘练习到 9 路人机对局，确认死子并完成计分。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
