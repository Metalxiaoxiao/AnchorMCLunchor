# AnchorMCLuncher

AnchorMCLuncher 是一个功能完整的 Minecraft 启动器项目，包含现代化的桌面客户端和完整的后端认证服务。

## ✨ 项目特性

### 🎮 前端功能 (React + Vite + Tauri)

- **Yggdrasil 外置登录**: 支持自定义认证服务器（如 authlib-injector）
- **版本管理**: 浏览并安装 Minecraft 所有版本（Release & Snapshot）
- **高性能下载器**: 基于 Rust (Tokio + Reqwest) 的多线程下载，速度极快
- **游戏启动器**: 一键启动已安装的 Minecraft 版本
- **Docker 服务器管理**: 可视化部署和管理 Minecraft Docker 服务器
- **Mod 管理**: 集成 Modrinth 模组市场浏览和安装
- **皮肤编辑器**: 内置 3D 皮肤预览和编辑功能
- **现代化 UI**: React 界面 + acrylic/vibrancy 毛玻璃特效
- **跨平台**: 基于 Tauri，轻量、安全且高性能

### 🔐 后端功能 (Express + MySQL)

- **RESTful API**: 标准的 REST 接口用于启动器管理
- **CAF 集成**: 集成自研 Central Authentication Facility 协议，支持 OAuth 登录与自动注册
- **完整的 Yggdrasil API**: 实现 Minecraft 官方认证协议，支持客户端直接登录
- **Docker 服务管理**: 通过后端 API 远程管理 Minecraft 服务器容器
- **自动化数据库**: 启动时自动检查、创建数据库和表结构
- **安全性**: bcrypt 密码哈希 + JWT 会话管理
- **实时通信**: Socket.IO 支持服务器控制台实时输出

## 🏗️ 项目结构

```
AnchorMCLuncher/
├── .github/              # GitHub 配置
├── .vscode/              # VS Code 配置
├── anchorMCLuncher/
│   ├── backend/          # 后端服务
│   │   ├── src/
│   │   │   ├── config/           # 数据库配置
│   │   │   ├── controllers/      # 业务逻辑控制器
│   │   │   │   ├── authController.ts        # 认证控制
│   │   │   │   ├── serverController.ts      # 服务器管理
│   │   │   │   ├── dockerController.ts      # Docker 容器管理
│   │   │   │   └── yggdrasilController.ts   # Yggdrasil 协议
│   │   │   ├── middleware/       # Express 中间件
│   │   │   ├── routes/           # 路由定义
│   │   │   ├── services/         # 核心服务
│   │   │   │   ├── cafService.ts            # CAF 协议服务
│   │   │   │   ├── dbMigrationService.ts    # 数据库迁移
│   │   │   │   └── dockerService.ts         # Docker 服务
│   │   │   └── server.ts         # 程序入口
│   │   ├── uploads/       # 上传文件目录
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/          # 前端应用
│       ├── src/
│       │   ├── components/        # React 组件
│       │   │   ├── HomeTab.tsx            # 首页
│       │   │   ├── DownloadTab.tsx        # 下载管理
│       │   │   ├── SettingsTab.tsx        # 设置
│       │   │   ├── ServerConfigTab.tsx    # 服务器配置
│       │   │   ├── ServerDeployModal.tsx  # 服务器部署弹窗
│       │   │   ├── ServerConsoleModal.tsx # 服务器控制台
│       │   │   ├── ModrinthBrowser.tsx    # Modrinth 浏览
│       │   │   ├── SkinEditor.tsx          # 皮肤编辑
│       │   │   └── ...
│       │   ├── api.ts            # API 调用封装
│       │   ├── App.tsx           # 主应用
│       │   └── types.ts          # TypeScript 类型定义
│       ├── src-tauri/            # Tauri Rust 后端
│       │   ├── src/
│       │   │   ├── auth.rs       # 认证逻辑
│       │   │   ├── downloader.rs # 下载器
│       │   │   └── launcher.rs   # 游戏启动
│       └── package.json
│
├── package.json           # 根目录配置
└── README.md              # 本文档
```

## 🛠️ 技术栈

### 前端技术

| 技术              | 用途           |
| ----------------- | -------------- |
| React 19          | UI 框架        |
| Vite 7            | 构建工具       |
| Tauri 2           | 桌面应用框架   |
| TypeScript        | 类型安全       |
| styled-components | CSS-in-JS 样式 |
| skinview3d        | 3D 皮肤预览    |
| Socket.IO Client  | 实时通信       |
| Axios             | HTTP 客户端    |

### 后端技术

| 技术           | 用途            |
| -------------- | --------------- |
| Node.js        | 运行环境        |
| Express 4      | Web 框架        |
| TypeScript     | 类型安全        |
| MySQL + mysql2 | 数据库          |
| JWT            | Token 认证      |
| Socket.IO      | WebSocket 通信  |
| Dockerode      | Docker 容器管理 |
| Multer         | 文件上传        |

## 🚀 快速开始

### 环境要求

**通用要求：**

- Node.js (v16+)
- MySQL Server (8.0+)
- Docker Desktop
- Java (JRE/JDK) - 用于启动 Minecraft

**后端额外要求：**

- CAF Server（可选，用于 OAuth 登录）

**前端额外要求：**

- Rust & Cargo

### 安装步骤

1. **克隆项目**

   ```bash
   git clone <repository-url>
   cd AnchorMCLuncher
   ```
2. **启动后端**

   ```bash
   cd anchorMCLuncher/backend
   npm install

   # 创建 .env 配置文件
   # 参考 backend/.env.example 或下方配置说明

   npm run dev
   ```
3. **启动前端**

   ```bash
   cd anchorMCLuncher/frontend
   npm install
   npm run tauri dev
   ```

### 配置说明

#### 后端配置 (.env)

```dotenv
# 服务端口
PORT=3000

# 数据库配置
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=mc_launcher

# JWT 密钥
JWT_SECRET=your_super_secret_key_change_this

# CAF 授权服务器地址
CAF_SERVER_URL=http://localhost:8081

# Docker 配置
DOCKER_HOST=unix:///var/run/docker.sock
```

#### Docker 镜像加速（大陆地区）

在 Docker Desktop 设置中添加：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://huecker.io",
    "https://dockerhub.timeweb.cloud"
  ]
}
```

## 📚 详细文档

- [后端文档](anchorMCLuncher/backend/README.md) - API、认证、数据库等
- [前端文档](anchorMCLuncher/frontend/README.md) - 组件、使用指南等
- [后端协议文档](anchorMCLuncher/backend/protocol.md)
- [CAF 集成文档](anchorMCLuncher/backend/CAFPAPI.md)

## 🔗 相关资源

- Minecraft 官方启动器: https://www.minecraft.net
- Yggdrasil 协议: https://github.com/mt-mods/yggdrasil
- Tauri: https://tauri.app
- Modrinth: https://modrinth.com
