# AnchorMC Launcher

A Minecraft Launcher built with Tauri, React, and TypeScript.

## Features

- **Yggdrasil External Login**: Supports custom authentication servers (e.g., authlib-injector).
- **Version Management**: Browse and install Minecraft versions (Release & Snapshot).
- **High-Performance Downloader**: Multi-threaded downloading using Rust (Tokio + Reqwest) for fast game installation.
- **Game Launcher**: Launch installed Minecraft versions directly from the dashboard.
- **Customizable Settings**: Configure game installation path and manage user profile.
- **Cross-Platform**: Built on Tauri for lightweight, secure, and fast performance.
- **Modern UI**: React-based interface with acrylic/vibrancy effects.

## Getting Started

### Prerequisites

- Node.js
- Rust & Cargo
- Java (JRE/JDK) installed and added to PATH (for launching the game)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run tauri dev
   ```

## 🏗️ 项目结构

```
frontend/
├── src/
│   ├── components/          # React UI 组件
│   │   ├── HomeTab.tsx              # 首页 - 游戏启动和服务器列表
│   │   ├── DownloadTab.tsx          # 下载管理 - 版本浏览和下载
│   │   ├── SettingsTab.tsx          # 设置页面 - 游戏路径、用户配置
│   │   ├── ServerConfigTab.tsx      # 服务器配置 - Docker 服务器管理
│   │   ├── ServerDeployModal.tsx    # 服务器部署弹窗
│   │   ├── ServerDeployWindow.tsx   # 服务器部署窗口
│   │   ├── ServerConsoleModal.tsx   # 服务器控制台弹窗
│   │   ├── ServerConsoleWindow.tsx  # 服务器控制台窗口
│   │   ├── ModrinthBrowser.tsx      # Modrinth 模组市场浏览
│   │   ├── ModDetailModal.tsx       # 模组详情弹窗
│   │   ├── SkinEditor.tsx           # 皮肤编辑器
│   │   ├── SkinChangeModal.tsx      # 皮肤更换弹窗
│   │   ├── SkinViewer.tsx           # 3D 皮肤预览
│   │   ├── LaunchSettingsModal.tsx  # 启动设置弹窗
│   │   ├── VersionConfigModal.tsx   # 版本配置弹窗
│   │   ├── DownloadWindow.tsx       # 下载窗口
│   │   ├── LoginCard.tsx            # 登录卡片
│   │   ├── ServerCard.tsx           # 服务器卡片
│   │   ├── DockerServerCard.tsx     # Docker 服务器卡片
│   │   ├── MessageModal.tsx         # 消息弹窗
│   │   ├── LoadingSpinner.tsx       # 加载动画
│   │   └── AnimatedPopup.tsx        # 动画弹窗
│   │
│   ├── styles/              # 全局样式
│   │   └── GlobalStyles.ts          # 全局样式定义
│   │
│   ├── assets/              # 静态资源
│   │   ├── fonts/
│   │   │   └── Mojangles.woff       # Minecraft 字体
│   │   └── react.svg
│   │
│   ├── api.ts               # API 调用封装
│   ├── App.tsx              # 主应用组件
│   ├── App.css              # 应用样式
│   ├── main.tsx             # 应用入口
│   ├── types.ts             # TypeScript 类型定义
│   ├── isolation.ts         # 隔离配置
│   └── vite-env.d.ts        # Vite 类型声明
│
├── src-tauri/               # Tauri Rust 后端
│   └── src/
│       ├── auth.rs          # Yggdrasil 认证逻辑
│       ├── downloader.rs    # 多线程游戏下载器
│       └── launcher.rs      # 游戏启动和版本管理
│
├── public/                  # 公共资源
├── index.html               # HTML 入口
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts           # Vite 配置
```

## 📦 依赖包

### 主要依赖
- **@tauri-apps/api**: Tauri API
- **react**: UI 框架
- **react-dom**: React DOM 渲染
- **styled-components**: CSS-in-JS 样式
- **skinview3d**: 3D 皮肤预览
- **socket.io-client**: WebSocket 客户端
- **axios**: HTTP 客户端
- **react-markdown**: Markdown 渲染
- **@heroicons/react**: 图标库
- **adm-zip**: ZIP 文件处理
- **dockerode**: Docker 容器管理
- **multer**: 文件上传处理
- **@tauri-apps/plugin-\***: Tauri 插件
  - dialog: 对话框
  - fs: 文件系统
  - opener: 外部链接打开

### 开发依赖
- **@tauri-apps/cli**: Tauri 命令行工具
- **@vitejs/plugin-react**: Vite React 插件
- **vite**: 构建工具
- **typescript**: TypeScript 编译
- **@types/\***: 类型定义文件
  - react, react-dom
  - styled-components
  - socket.io
  - dockerode
  - multer
