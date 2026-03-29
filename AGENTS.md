# AGENTS.md - Guidelines for AI Coding Agents

This file contains guidelines and conventions for agentic coding agents working in this repository.

## 交互要求
- Thinking思考过程用中文表述
- Reply回答也要使用中文回复

## 项目架构

这是一个前后端分离的AI文本处理工具：
- **前端**: React应用 (端口3000) - 使用Ant Design UI组件库
- **后端**: Node.js Express应用 (端口3001) - 处理AI API调用和文件管理
- **主要功能**: 文本改写、小说生成、任务管理

## 构建和开发命令

### 前端 (frontend/)
```bash
# 开发服务器 (端口3000)
npm start

# 构建生产版本
npm run build

# 运行测试
npm test

# 运行单个测试文件
npm test -- --testPathPattern=App.test.js

# 交互式测试模式
npm test -- --watch
```

### 后端 (backend/)
```bash
# 开发服务器 (使用nodemon，端口3001)
npm run dev

# 生产服务器
npm start

# 运行测试 (当前无具体测试)
npm test
```

### 测试脚本 (test/)
```bash
# 运行简单功能测试
./test/test_simple.sh

# 运行多主题生成测试
./test/test_multi_theme.sh

# 运行编辑功能测试
./test/test_edit_functionality.sh
```

## 代码风格指南

### JavaScript/JSX规范

#### 1. 导入语句
```javascript
// React相关导入优先
import React, { useState, useEffect } from "react";

// 第三方库导入
import { Button, Input, message } from "antd";
import axios from "axios";

// 本地模块导入
import { apiFunction } from "../api";
import Component from "./components/Component";
```

#### 2. 组件定义
```javascript
// 使用函数组件和箭头函数
export default function ComponentName() {
  // useState hooks在组件顶部
  const [state, setState] = useState([]);
  const [loading, setLoading] = useState(false);

  // useEffect在状态之后
  useEffect(() => {
    loadData();
  }, []);

  // 事件处理函数
  const handleClick = async () => {
    setLoading(true);
    try {
      await apiFunction();
      message.success("操作成功");
    } catch (error) {
      message.error("操作失败");
    } finally {
      setLoading(false);
    }
  };

  // 渲染返回
  return (
    <div>
      {/* JSX内容 */}
    </div>
  );
}
```

#### 3. 变量和函数命名
- **组件**: PascalCase (TaskList, StoryGenerator)
- **变量**: camelCase (tasks, selectedItems, isLoading)
- **函数**: camelCase (handleClick, loadData, generateStory)
- **常量**: UPPER_SNAKE_CASE (MAX_CONCURRENCY, BASE_URL)
- **文件名**: kebab-case (task-list.jsx, api.js)

#### 4. 异步操作
```javascript
// 使用async/await而非Promise链
const loadData = async () => {
  try {
    const result = await apiFunction();
    setState(result);
  } catch (error) {
    console.error('加载数据失败:', error);
    message.error("加载失败");
  }
};
```

### Node.js后端规范

#### 1. 模块导入
```javascript
// Node.js内置模块优先
const express = require('express');
const fs = require('fs');
const path = require('path');

// 第三方模块
const axios = require('axios');
const cors = require('cors');

// 本地模块
const silicon = require('./silicon');
const prompts = require('./prompts.json');
```

#### 2. 路由定义
```javascript
// 使用async/await处理异步路由
app.post('/endpoint', async (req, res) => {
  const { param1, param2 } = req.body;
  
  // 参数验证
  if (!param1) {
    return res.status(400).json({ error: '缺少必要参数：param1' });
  }

  try {
    const result = await processRequest(param1, param2);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: '处理失败', detail: error.message });
  }
});
```

#### 3. 错误处理
```javascript
// 统一错误处理模式
try {
  const result = await apiCall();
  return result;
} catch (error) {
  console.error('API调用失败:', error.response?.data || error.message);
  const errorDetail = error.response?.data?.error?.message || error.message;
  throw new Error(errorDetail);
}
```

### CSS和样式规范

#### 1. 内联样式
```javascript
// 使用对象形式的内联样式
const containerStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  background: "#f0f2f5"
};

return <div style={containerStyle}>内容</div>;
```

#### 2. Ant Design主题
- 使用Ant Design默认色彩系统
- 主要颜色: #1890ff (蓝色), #52c41a (绿色), #ff4d4f (红色)
- 背景色: #f0f2f5, #ffffff

## API设计规范

### RESTful API
```javascript
// GET - 获取数据
app.get('/tasks', (req, res) => { /* ... */ });
app.get('/tasks/:id', (req, res) => { /* ... */ });

// POST - 创建数据
app.post('/tasks', (req, res) => { /* ... */ });

// PUT/PATCH - 更新数据
app.put('/tasks/:id', (req, res) => { /* ... */ });

// DELETE - 删除数据
app.delete('/tasks/:id', (req, res) => { /* ... */ });
```

### 响应格式
```javascript
// 成功响应
{
  "success": true,
  "data": { /* ... */ }
}

// 错误响应
{
  "error": "错误描述",
  "detail": "详细错误信息"
}

// 列表响应
{
  "tasks": [ /* ... */ ],
  "total": 100
}
```

## 文件组织结构

### 前端目录结构
```
frontend/src/
├── components/          # 可复用组件
│   ├── TaskList.jsx
│   ├── StoryGenerator.jsx
│   └── ...
├── utils/              # 工具函数
│   └── abortControllerManager.js
├── api.js              # API调用封装
├── App.jsx             # 主应用组件
└── index.js            # 入口文件
```

### 后端目录结构
```
backend/
├── uploads/            # 上传文件存储
├── test/               # 测试文件
├── index.js            # 主服务器文件
├── silicon.js          # AI API封装
├── prompts.json        # 提示词配置
├── models.json         # 模型配置
├── tasks.json          # 任务数据存储
└── stories.json        # 小说数据存储
```

## 开发注意事项

### 1. 状态管理
- 前端使用React Hooks进行状态管理
- 后端使用JSON文件进行数据持久化
- 避免直接修改状态，使用setState或函数式更新

### 2. 并发控制
- 前端请求并发数控制在合理范围内 (如50个)
- 后端处理任务时注意异步操作的错误处理
- 使用AbortController管理可取消的请求

### 3. 文件处理
- 上传文件存储在backend/uploads/目录
- 使用multer中间件处理文件上传
- 注意文件编码问题 (使用utf8)

### 4. AI API集成
- 使用SiliconFlow API进行AI调用
- 注意token安全和错误处理
- 支持流式响应 (Server-Sent Events)

### 5. 测试策略
- 使用shell脚本进行API测试
- 测试文件位于test/目录
- 测试时使用实际IP地址 (http://192.168.31.61:3001)

## 常见问题解决

### 1. 跨域问题
后端已配置CORS允许所有来源：
```javascript
app.use(cors({
  origin: true,
  credentials: true
}));
```

### 2. 文件编码
使用Buffer处理中文文件名：
```javascript
fileName: Buffer.from(f.originalname, 'latin1').toString('utf8')
```

### 3. 流式响应
使用SSE进行实时数据传输：
```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.write(`data: ${JSON.stringify(data)}\n\n`);
```

## 部署和环境

### 开发环境
- 前端: http://localhost:3000
- 后端: http://localhost:3001
- API基础URL: http://192.168.31.61:3001

### 生产环境注意事项
- 检查API基础URL配置
- 确保上传目录权限
- 配置适当的超时时间
- 监控内存使用情况

## 代码质量检查

在提交代码前，请确保：
1. 前端代码可以通过 `npm run build` 构建
2. 后端代码可以正常启动 `npm run dev`
3. 没有console.error或其他未处理的错误
4. API接口有适当的错误处理
5. 用户操作有反馈信息 (success/error)

## 版本控制

- 使用语义化版本号
- 提交信息使用中文，描述清晰
- 重要功能更新需要更新相关文档
- 避免提交敏感信息 (如API token)