const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('./env');
const silicon = require('./silicon');
const prompts = require('./prompts.json');
const models = require('./models.json');

const TASKS_FILE = path.join(__dirname, 'tasks.json');
const PROJECTS_FILE = path.join(__dirname, 'projects.json');
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');
const STORIES_FILE = path.join(__dirname, 'stories.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const LEGACY_PROJECT_NAME = '历史任务';

function loadJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallbackValue;
  }
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let tasks = loadJsonFile(TASKS_FILE, []);
let projects = loadJsonFile(PROJECTS_FILE, []);
let stories = loadJsonFile(STORIES_FILE, []);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function saveTasks() {
  saveJsonFile(TASKS_FILE, tasks);
}

function saveProjects() {
  saveJsonFile(PROJECTS_FILE, projects);
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getProjectById(projectId) {
  if (!projectId) return null;
  return projects.find(item => item.id === projectId) || null;
}

function countTasksByProjectId(projectId) {
  return tasks.filter(task => task.projectId === projectId).length;
}

function serializeProject(project) {
  return {
    ...project,
    taskCount: countTasksByProjectId(project.id)
  };
}

function projectNameExists(name, excludeId = '') {
  const normalized = String(name || '').trim().toLowerCase();
  return projects.some(
    item => item.id !== excludeId && String(item.name || '').trim().toLowerCase() === normalized
  );
}

function findProjectByName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    projects.find(item => String(item.name || '').trim().toLowerCase() === normalized) || null
  );
}

function createProjectInternal(name, type = '') {
  const normalizedName = String(name || '').trim();
  const normalizedType = String(type || '').trim();

  if (!normalizedName) {
    const error = new Error('项目名称不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (projectNameExists(normalizedName)) {
    const error = new Error('项目名称已存在');
    error.statusCode = 409;
    throw error;
  }

  const now = Date.now();
  return {
    id: createId('project'),
    name: normalizedName,
    type: normalizedType,
    createdAt: now,
    updatedAt: now
  };
}

function resolveUploadPath(rawFilePath) {
  if (!rawFilePath) {
    return null;
  }

  if (path.isAbsolute(rawFilePath)) {
    if (rawFilePath.startsWith(UPLOAD_DIR)) {
      return rawFilePath;
    }
    return path.join(UPLOAD_DIR, path.basename(rawFilePath));
  }

  return path.join(UPLOAD_DIR, path.basename(rawFilePath));
}

function withProjectInfo(task) {
  const project = getProjectById(task.projectId);
  return {
    ...task,
    projectType: task.projectType || project?.type || '',
    projectName: project?.name || ''
  };
}

function ensureLegacyProjectAndMigrateTasks() {
  let changedProjects = false;
  let changedTasks = false;

  let legacyProject = projects.find(item => item.name === LEGACY_PROJECT_NAME);
  const hasUnboundTask = tasks.some(task => !task.projectId || !getProjectById(task.projectId));

  if (hasUnboundTask && !legacyProject) {
    legacyProject = {
      id: createId('project'),
      name: LEGACY_PROJECT_NAME,
      type: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    projects = [legacyProject, ...projects];
    changedProjects = true;
  }

  tasks = tasks.map(task => {
    const project = getProjectById(task.projectId);
    if (!project) {
      if (!legacyProject) {
        return task;
      }
      changedTasks = true;
      return {
        ...task,
        projectId: legacyProject.id,
        projectType: legacyProject.type
      };
    }

    if (!task.projectType) {
      changedTasks = true;
      return {
        ...task,
        projectType: project.type
      };
    }

    return task;
  });

  if (changedProjects) {
    saveProjects();
  }
  if (changedTasks) {
    saveTasks();
  }
}

ensureLegacyProjectAndMigrateTasks();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: true,
  credentials: true
}));
app.set('trust proxy', true);
const upload = multer({ dest: UPLOAD_DIR });

app.get('/project-types', (_req, res) => {
  res.json({ types: [] });
});

app.get('/projects', (_req, res) => {
  res.json({ projects: projects.map(serializeProject) });
});

app.post('/projects', (req, res) => {
  const { name, type } = req.body;
  try {
    const project = createProjectInternal(name, type);
    projects = [project, ...projects];
    saveProjects();
    res.json({ success: true, project: serializeProject(project), projects: projects.map(serializeProject) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || '创建项目失败' });
  }
});

app.put('/projects/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const projectIndex = projects.findIndex(item => item.id === id);
  if (projectIndex === -1) {
    return res.status(404).json({ error: '项目不存在' });
  }

  const targetName = name === undefined ? projects[projectIndex].name : String(name).trim();

  if (!targetName) {
    return res.status(400).json({ error: '项目名称不能为空' });
  }
  if (projectNameExists(targetName, id)) {
    return res.status(409).json({ error: '项目名称已存在' });
  }

  const now = Date.now();
  projects[projectIndex] = {
    ...projects[projectIndex],
    name: targetName,
    updatedAt: now
  };

  saveProjects();
  res.json({
    success: true,
    project: serializeProject(projects[projectIndex]),
    projects: projects.map(serializeProject)
  });
});

app.delete('/projects/:id', (req, res) => {
  const { id } = req.params;
  const { targetProjectId } = req.body || {};

  const deletingProject = getProjectById(id);
  if (!deletingProject) {
    return res.status(404).json({ error: '项目不存在' });
  }

  const linkedTasks = tasks.filter(task => task.projectId === id);
  let migratedCount = 0;

  if (linkedTasks.length > 0) {
    if (!targetProjectId) {
      return res.status(400).json({ error: '项目下存在任务，请指定迁移目标项目' });
    }
    if (targetProjectId === id) {
      return res.status(400).json({ error: '迁移目标不能是当前删除项目' });
    }
    const targetProject = getProjectById(targetProjectId);
    if (!targetProject) {
      return res.status(400).json({ error: '迁移目标项目不存在' });
    }

    tasks = tasks.map(task => {
      if (task.projectId !== id) {
        return task;
      }
      migratedCount += 1;
      return {
        ...task,
        projectId: targetProject.id,
        projectType: targetProject.type
      };
    });
    saveTasks();
  }

  projects = projects.filter(item => item.id !== id);
  saveProjects();

  res.json({
    success: true,
    migratedCount,
    projects: projects.map(serializeProject)
  });
});

function resolveUploadProject(body) {
  const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
  const newProjectName = typeof body?.newProjectName === 'string' ? body.newProjectName.trim() : '';

  if (projectId) {
    const project = getProjectById(projectId);
    if (!project) {
      const error = new Error('选择的项目不存在');
      error.statusCode = 400;
      throw error;
    }
    return project;
  }

  if (newProjectName) {
    const existedProject = findProjectByName(newProjectName);
    if (existedProject) {
      return existedProject;
    }

    const project = createProjectInternal(newProjectName);
    projects = [project, ...projects];
    saveProjects();
    return project;
  }

  const error = new Error('上传任务必须绑定项目');
  error.statusCode = 400;
  throw error;
}

// 批量上传并创建任务（必须绑定项目）
app.post('/tasks/upload', upload.array('files'), (req, res) => {
  if (!Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: '请至少上传一个 txt 文件' });
  }

  let selectedProject;
  try {
    selectedProject = resolveUploadProject(req.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || '绑定项目失败' });
  }

  const newTasks = req.files.map((file, index) => ({
    id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    filePath: file.filename,
    originalContent: fs.readFileSync(file.path, 'utf8'),
    status: 0,
    model: '',
    promptType: 'preset',
    promptKey: '',
    promptContent: '',
    result: '',
    errorMessage: '',
    providerTraceId: '',
    providerFinishReason: '',
    processTime: '',
    projectId: selectedProject.id,
    projectType: selectedProject.type || ''
  }));

  tasks = [...newTasks, ...tasks];
  saveTasks();
  res.json({ tasks: newTasks.map(withProjectInfo) });
});

app.get('/tasks', (req, res) => {
  const { projectId } = req.query;
  let filteredTasks = tasks;

  if (projectId && projectId !== 'ALL') {
    filteredTasks = filteredTasks.filter(task => task.projectId === projectId);
  }

  res.json({ tasks: filteredTasks.map(withProjectInfo) });
});

app.post('/tasks/config', (req, res) => {
  const { ids, model, promptType, promptKey, promptContent } = req.body;
  tasks = tasks.map(task => (
    ids.includes(task.id)
      ? { ...task, model, promptType, promptKey, promptContent }
      : task
  ));
  saveTasks();
  res.json({ success: true });
});

app.post('/tasks/start', async (req, res) => {
  const { ids } = req.body;
  const results = [];

  for (const taskId of ids) {
    const task = tasks.find(taskItem => taskItem.id === taskId);
    if (!task) {
      results.push({ id: taskId, status: 3, processTime: '0.00' });
      continue;
    }

    task.status = 2;
    const startTime = Date.now();
    let fileContent = '';
    const usePrompt = task.promptType === 'preset'
      ? prompts.find(prompt => prompt.key === task.promptKey)?.content || ''
      : task.promptContent;

    try {
      const resolvedPath = resolveUploadPath(task.filePath);
      fileContent = fs.readFileSync(resolvedPath, 'utf-8');
      const rewriteResult = await silicon.rewriteWithSilicon(fileContent, usePrompt, task.model);
      task.status = 1;
      task.result = rewriteResult.content;
      task.originalContent = fileContent;
      task.errorMessage = '';
      task.providerTraceId = rewriteResult.traceId || '';
      task.providerFinishReason = rewriteResult.finishReason || '';
    } catch (error) {
      task.status = 3;
      if (fileContent) {
        task.originalContent = fileContent;
      }
      task.errorMessage = error.message || '处理失败';
      task.providerTraceId = error.providerTraceId || '';
      task.providerFinishReason = error.providerFinishReason || '';
      console.log(error);
    }

    const endTime = Date.now();
    task.processTime = ((endTime - startTime) / 1000).toFixed(2);
    task.endTime = endTime;
    results.push({
      id: taskId,
      status: task.status,
      endTime,
      processTime: task.processTime,
      errorMessage: task.errorMessage || ''
    });
    saveTasks();
    console.log(task.fileName, '处理完毕');
  }

  res.json({ running: results });
});

app.get('/models', (_req, res) => {
  res.json({ models });
});

app.get('/prompts', (_req, res) => {
  res.json({ prompts });
});

app.post('/prompts', (req, res) => {
  const { key, label, content } = req.body;
  if (key && !prompts.some(prompt => prompt.key === key)) {
    prompts.unshift({ key, label, content });
    saveJsonFile(PROMPTS_FILE, prompts);
  }
  res.json({ prompts });
});

app.post('/tasks/download', (req, res) => {
  const { ids, zipFileName } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).send('No tasks for download');
  }

  if (ids.length === 1) {
    const task = tasks.find(item => item.id === ids[0]);
    if (!task) {
      return res.status(404).send('Task not found');
    }

    const fileName = task.fileName || 'result.txt';
    const safeFileName = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    res.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.set('Content-Type', 'text/plain');
    res.send((task.result || '').replace(/——/g, '，'));
    return;
  }

  const JSZip = require('jszip');
  const zip = new JSZip();
  ids.forEach(id => {
    const task = tasks.find(item => item.id === id);
    if (task) {
      zip.file(task.fileName || `${id}.txt`, (task.result || '').replace(/——/g, '，'));
    }
  });
  zip.generateAsync({ type: 'nodebuffer' }).then(data => {
    const downloadName =
      typeof zipFileName === 'string' && zipFileName.trim()
        ? zipFileName.trim()
        : 'results.zip';
    const normalizedZipFileName = downloadName.toLowerCase().endsWith('.zip')
      ? downloadName
      : `${downloadName}.zip`;
    const safeZipFileName = encodeURIComponent(normalizedZipFileName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${safeZipFileName}"`);
    res.send(data);
  });
});

app.post('/tasks/delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '缺少任务ID' });
  }

  const deletingTasks = tasks.filter(task => ids.includes(task.id));
  tasks = tasks.filter(task => !ids.includes(task.id));
  saveTasks();
  res.json({ tasks: tasks.map(withProjectInfo) });

  deletingTasks.forEach(task => {
    const filePath = resolveUploadPath(task.filePath);
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn('删除文件失败:', task.filePath, error.message);
      }
    }
  });
});

app.post('/tasks/overwrite-original', (req, res) => {
  const { id, content } = req.body;
  if (!id || typeof content !== 'string') {
    return res.status(400).json({ error: '缺少 id 或 content' });
  }

  const task = tasks.find(item => item.id === id);
  if (!task) {
    return res.status(404).json({ error: '未找到对应任务' });
  }

  try {
    task.result = content;
    saveTasks();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '写入失败', detail: error.message });
  }
});

app.get('/tasks/original', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: '任务ID不能为空' });
  }

  const task = tasks.find(item => String(item.id) === String(id));
  if (!task) {
    return res.status(404).json({ error: '未找到对应任务' });
  }

  const filePath = resolveUploadPath(task.filePath);
  try {
    let data = '';
    if (filePath && fs.existsSync(filePath)) {
      data = fs.readFileSync(filePath, 'utf8');
    } else if (typeof task.originalContent === 'string') {
      data = task.originalContent;
    } else {
      return res.status(404).json({ error: '原始文件不存在' });
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(data);
  } catch (error) {
    res.status(500).json({ error: '读取文件失败', detail: error.message });
  }
});

// 生成短篇小说（流式版本，支持实时进度和继续生成）
app.post('/story/generate-stream', async (req, res) => {
  const { instruction, model, wordCount = 1000, existingContent = '' } = req.body;
  console.log('收到流式生成请求:', { 
    instruction: instruction?.substring(0, 50), 
    model, 
    wordCount,
    hasExistingContent: !!existingContent,
    existingLength: existingContent?.length || 0
  });
  
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return res.status(400).json({ error: '缺少必要参数：instruction（指令不能为空）' });
  }
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: '缺少必要参数：model（模型不能为空）' });
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // 发送开始信号
    const startMessage = existingContent ? '继续生成小说...' : '开始生成小说...';
    res.write(`data: ${JSON.stringify({ type: 'start', message: startMessage })}\n\n`);

    const generator = silicon.generateStoryStream(
      instruction.trim(),
      model,
      wordCount,
      existingContent || '',
      res
    );

    let accumulatedContent = existingContent || '';

    for await (const chunk of generator) {
      if (chunk.type === 'content') {
        // 正确累计内容：使用后端生成的 fullContent，避免重复计算
        accumulatedContent = chunk.fullContent || accumulatedContent;
        const progress = Math.min(100, Math.round((accumulatedContent.length / wordCount) * 100));
        res.write(`data: ${JSON.stringify({ 
          type: 'content', 
          content: chunk.content, 
          fullContent: accumulatedContent,
          progress: progress,
          wordCount: accumulatedContent.length
        })}\n\n`);
      } else if (chunk.type === 'done') {
        // 使用后端计算的最终内容，确保一致性
        const finalContent = chunk.content || accumulatedContent;
        res.write(`data: ${JSON.stringify({ 
          type: 'done', 
          content: finalContent,
          wordCount: finalContent.length
        })}\n\n`);
        res.end();
        return;
      } else if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'error', error: chunk.error })}\n\n`);
        res.end();
        return;
      }
    }
  } catch (err) {
    console.error('生成小说失败:', err.response?.data || err.message);
    const errorDetail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorDetail })}\n\n`);
    res.end();
  }
});

// 生成短篇小说（非流式版本，作为备用）
app.post('/story/generate', async (req, res) => {
  const { instruction, model, wordCount = 1000 } = req.body;
  console.log('收到生成请求:', { instruction: instruction?.substring(0, 50), model, wordCount });
  
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return res.status(400).json({ error: '缺少必要参数：instruction（指令不能为空）' });
  }
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: '缺少必要参数：model（模型不能为空）' });
  }
  try {
    const content = await silicon.generateStory(instruction.trim(), model, wordCount);
    res.json({ content });
  } catch (err) {
    console.error('生成小说失败:', err.response?.data || err.message);
    const errorDetail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
    res.status(500).json({ error: '生成小说失败', detail: errorDetail });
  }
});

// 根据目标字数获取分类（支持优先使用标签）
function getCategoryByTargetWordCount(targetWordCount, targetWordCountLabel) {
  if (targetWordCountLabel) {
    return targetWordCountLabel;
  }
  if (!targetWordCount || targetWordCount < 10000) return '短篇';
  if (targetWordCount < 50000) return '中篇';
  if (targetWordCount < 200000) return '长篇';
  return '超长篇';
}

// 保存小说数据（指令、大纲、正文）
app.post('/stories/save', (req, res) => {
  const { instruction, content, wordCount, targetWordCount, targetWordCountLabel, theme, basicInstruction } = req.body;
  
  if (!theme) {
    return res.status(400).json({ error: '缺少必要参数：theme' });
  }

  // 如果已存在同一个标题，直接更新；如果内容一致，则跳过保存
  const existingCompleteStoryIndex = stories.findIndex(s => s.theme === theme );
  const existingCompleteStory = stories.findIndex(s => s.theme === theme && s.content === content );

  if (existingCompleteStory !== -1) {
    return res.status(200).json({ success: true });
  }

  if (existingCompleteStoryIndex !== -1) {
    stories[existingCompleteStoryIndex] = {
      ...stories[existingCompleteStoryIndex],
      instruction, content, wordCount, targetWordCount, targetWordCountLabel, theme, basicInstruction
    }
  }else{
    // 没有找到匹配的记录，创建新记录
    const category = getCategoryByTargetWordCount(targetWordCount || wordCount || 0, targetWordCountLabel);
    const storyData = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      instruction: instruction || `${theme}\n${basicInstruction}`,
      basicInstruction: basicInstruction || '',
      theme: theme || '',
      content: content || '',
      wordCount: wordCount || 0,
      targetWordCount: targetWordCount || wordCount || 0, // 保存目标字数
      targetWordCountLabel: targetWordCountLabel || null, // 保存目标字数标签
      category: category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    stories = [storyData, ...stories]; // 新数据放在前面，确保 stories 被正确插入并引用
  }
  fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2));
  res.json({ success: true });
});

// 获取所有小说数据（支持按分类筛选）
app.get('/stories', (req, res) => {
  const { category } = req.query;
  let filteredStories = stories;
  
  // 对于没有 targetWordCountLabel 的旧数据，保持原有分类不变（兼容处理）
  // 新数据会使用 targetWordCountLabel 作为分类
  
  if (category && category !== '全部') {
    filteredStories = filteredStories.filter(s => s.category === category);
  }
  
  res.json({ stories: filteredStories });
});

// 根据 ID 获取单个小说
app.get('/stories/:id', (req, res) => {
  const { id } = req.params;
  const story = stories.find(s => s.id === id);
  if (!story) {
    return res.status(404).json({ error: '未找到对应的小说' });
  }
  res.json({ story });
});

// 更新小说数据
app.post('/stories/update', (req, res) => {
  const { id, instruction, content, wordCount, targetWordCount, targetWordCountLabel, theme, basicInstruction } = req.body;
  console.log(id)
  const storyIndex = stories.findIndex(s => s.id === id);
  if (storyIndex === -1) {
    return res.status(404).json({ error: '未找到对应的小说' });
  }

  // 使用目标字数进行分类，优先使用标签
  const finalTargetWordCount = targetWordCount !== undefined ? targetWordCount : (stories[storyIndex].targetWordCount || wordCount || stories[storyIndex].wordCount || 0);
  const finalTargetWordCountLabel = targetWordCountLabel !== undefined ? targetWordCountLabel : stories[storyIndex].targetWordCountLabel;
  const category = getCategoryByTargetWordCount(finalTargetWordCount, finalTargetWordCountLabel);
  stories[storyIndex] = {
    ...stories[storyIndex],
    instruction: instruction !== undefined ? instruction : stories[storyIndex].instruction,
    basicInstruction: basicInstruction !== undefined ? basicInstruction : stories[storyIndex].basicInstruction,
    theme: theme !== undefined ? theme : stories[storyIndex].theme,

    content: content !== undefined ? content : stories[storyIndex].content,
    wordCount: wordCount !== undefined ? wordCount : stories[storyIndex].wordCount,
    targetWordCount: finalTargetWordCount,
    targetWordCountLabel: finalTargetWordCountLabel,
    category: category,
    updatedAt: new Date().toISOString()
  };
  console.log('修改小说');

  fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2));
  res.json({ success: true, story: stories[storyIndex] });
});

// 删除小说数据
app.post('/stories/delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '缺少必要参数：ids' });
  }
  
  stories = stories.filter(s => !ids.includes(s.id));
  fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2));
  res.json({ success: true, stories });
});





const { addSimpleAPI } = require('./simple_generator');

// 添加简化生成 API
addSimpleAPI(app);



app.listen(3001, () => console.log('Backend listening on 3001'));
