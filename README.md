# AI-TXT

AI-TXT 是一个前后端分离的 AI 文本处理工具，包含两条主要业务链路：

- **文本改写**：上传文本后批量调用后端接口完成改写、下载与任务管理
- **小说生成**：前端通过流式接口生成内容，并支持保存已生成小说

## 项目结构

```text
AI-TXT/
├─ backend/                 # Node.js / Express 后端
│  ├─ data/                 # 运行时 JSON 数据
│  ├─ storage/uploads/      # 上传文件存储
│  ├─ env.js
│  ├─ index.js
│  ├─ llm_client.js
│  ├─ models.json
│  ├─ silicon.js
│  └─ simple_generator.js
├─ frontend/                # React 前端
│  ├─ public/
│  └─ src/
├─ docs/
│  ├─ examples/prompts/     # 示例提示词
│  └─ notes/backend/        # 后端修复说明
├─ scripts/
│  ├─ debug/backend/        # 调试脚本
│  └─ migrate-data-layout.js
└─ package.json             # 根目录开发脚本
```

## 运行与开发

### 安装依赖

```bash
npm run install:all
```

### 同时启动前后端

```bash
npm run dev
```

### 单独启动

```bash
npm run dev:frontend
npm run dev:backend
```

## 数据目录说明

后端运行时数据已统一收口到以下目录：

- `backend/data/tasks.json`
- `backend/data/projects.json`
- `backend/data/prompts.json`
- `backend/data/stories.json`
- `backend/storage/uploads/`

如果仓库仍存在旧布局文件，可执行一次迁移脚本：

```bash
npm run migrate:data
```

该脚本会将旧的 JSON 数据和上传目录迁移到新目录；若目标路径已存在且源文件仍存在，会直接报冲突并停止。

## 校验命令

```bash
node --check backend/index.js
npm --prefix frontend run build
```
