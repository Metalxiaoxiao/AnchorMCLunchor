# AnchorMCLuncher Backend

AnchorMCLuncher 的后端服务，基于 Express.js 和 MySQL 构建。提供用户认证、服务器列表管理以及完整的 Minecraft Yggdrasil API 实现。

## ✨ 特性

*   **RESTful API**: 提供标准的 REST 接口用于前端管理服务器列表。
*   **CAF 集成**: 集成 Central Authentication Facility (CAF) 协议，支持 OAuth 登录与自动注册。
*   **Yggdrasil API**: 实现了完整的 Yggdrasil 认证接口，支持 Minecraft 客户端直接登录。
*   **自动化数据库管理**: 启动时自动检查数据库连接，自动创建数据库、表结构，并自动修补 Schema 变更。
*   **安全性**: 使用 bcrypt 进行密码哈希，JWT 进行会话管理。

## 🛠️ 技术栈

*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Database**: MySQL (使用 `mysql2` 驱动)
*   **Language**: TypeScript
*   **Auth**: JWT, OAuth2 (CAF), Yggdrasil

## 🚀 快速开始

### 前置要求

*   Node.js (v16+)
*   MySQL Server
*   Docker Desktop (用于部署 Minecraft 服务器)
*   CAF Server (可选，用于 OAuth 登录)

### Docker 配置说明

由于网络原因，在中国大陆地区拉取 Docker Hub 镜像可能会失败。建议配置 Docker 镜像加速器。
在 Docker Desktop 设置 -> Docker Engine 中添加：
```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://huecker.io",
    "https://dockerhub.timeweb.cloud",
    "https://noohub.ru"
  ]
}
```
或者确保你的网络环境可以访问 Docker Hub。

### 安装

1.  进入后端目录：
    ```bash
    cd anchorMCLuncher/backend
    ```

2.  安装依赖：
    ```bash
    npm install
    ```

### 配置

在 `backend` 目录下创建 `.env` 文件（如果不存在），并填入以下配置：

```dotenv
PORT=3000
# 数据库配置
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=mc_launcher

# JWT 密钥 (用于前端 API 认证)
JWT_SECRET=your_super_secret_key_change_this

# CAF 授权服务器地址
CAF_SERVER_URL=http://localhost:8081
```

### 运行

*   **开发模式** (支持热重载):
    ```bash
    npm run dev
    ```

*   **生产构建与运行**:
    ```bash
    npm run build
    npm start
    ```

> **注意**: 服务器启动时会自动连接 MySQL。如果数据库或表不存在，它会自动创建。无需手动导入 SQL。

## 📚 API 文档

### 1. Launcher API (供启动器前端使用)

#### 认证
*   `POST /api/auth/login`: 用户登录。
    *   优先尝试通过 CAF Server 进行 OAuth 验证。
    *   验证成功后自动在本地注册/更新用户，并同步密码。
    *   返回本地 JWT Token。
*   `POST /api/auth/register`: 用户注册 (本地)。

#### 服务器管理 (需要 Header: `Authorization: Bearer <token>`)
*   `GET /api/servers`: 获取服务器列表 (公开)。
*   `POST /api/servers`: 添加服务器。
*   `PUT /api/servers/:id`: 更新服务器。
*   `DELETE /api/servers/:id`: 删除服务器。

### 2. Yggdrasil API (供 Minecraft 客户端使用)

本服务实现了标准的 Yggdrasil 协议，可作为 Minecraft 的认证服务器。

*   **Auth Server**:
    *   `POST /authserver/authenticate`: 登录验证。
    *   `POST /authserver/refresh`: 刷新令牌。
    *   `POST /authserver/validate`: 验证令牌有效性。
    *   `POST /authserver/invalidate`: 使令牌失效。
    *   `POST /authserver/signout`: 登出。

*   **Session Server**:
    *   `POST /sessionserver/session/minecraft/join`: 客户端加入服务器握手。
    *   `GET /sessionserver/session/minecraft/hasJoined`: 服务端验证客户端会话。

*   **Profile API**:
    *   `GET /api/profiles/minecraft/:uuid`: 获取玩家档案 (皮肤/披风)。

## 🏗️ 目录结构

```
backend/
├── src/
│   ├── config/              # 数据库连接配置
│   │   ├── db.ts            # MySQL 连接配置
│   │   └── keys.ts          # 密钥管理
│   │
│   ├── controllers/         # 业务逻辑控制器
│   │   ├── authController.ts       # 启动器登录/注册
│   │   ├── serverController.ts     # 服务器列表管理
│   │   ├── dockerController.ts     # Docker 容器管理
│   │   └── yggdrasilController.ts  # Yggdrasil 协议实现
│   │
│   ├── middleware/          # Express 中间件
│   │   └── authMiddleware.ts       # JWT 认证中间件
│   │
│   ├── routes/              # 路由定义
│   │   ├── authRoutes.ts
│   │   ├── serverRoutes.ts
│   │   ├── dockerRoutes.ts
│   │   └── yggdrasilRoutes.ts
│   │
│   ├── services/            # 核心服务
│   │   ├── cafService.ts            # CAF 协议集成与注册
│   │   ├── dbMigrationService.ts    # 数据库自动迁移
│   │   └── dockerService.ts         # Docker 容器管理服务
│   │
│   └── server.ts            # 程序入口
│
├── uploads/                 # 上传文件目录
├── schema.sql               # 数据库 Schema
├── update_schema.sql        # 数据库更新脚本
├── caf_config.json          # CAF 配置
├── package.json
└── tsconfig.json
```

## 📦 依赖包

### 主要依赖
- **express**: Web 框架
- **mysql2**: MySQL 数据库驱动
- **jsonwebtoken**: JWT 认证
- **bcryptjs**: 密码哈希
- **socket.io**: WebSocket 实时通信
- **dockerode**: Docker 容器管理
- **multer**: 文件上传处理
- **cors**: 跨域中间件
- **dotenv**: 环境变量管理
- **axios**: HTTP 客户端
- **adm-zip**: ZIP 文件处理
- **node-rsa**: RSA 加密支持

### 开发依赖
- **typescript**: TypeScript 编译
- **nodemon**: 开发热重载
- **ts-node**: TypeScript 执行
- **@types/\***: 类型定义文件
