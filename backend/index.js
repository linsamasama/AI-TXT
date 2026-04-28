const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('./env');
const silicon = require('./silicon');
const models = require('./models.json');
const {
  buildTasksSnapshot,
  createJsonWriteQueue,
  deleteTaskContent,
  ensureDirSync,
  getTaskContentPath,
  hasInlineOriginalContent,
  hasInlineResult,
  hasLegacyTaskContent,
  hydrateTask,
  normalizeTaskMetadata,
  readTaskContent,
  writeTaskContent
} = require('./task_storage');

const DATA_DIR = path.join(__dirname, 'data');
const STORAGE_DIR = path.join(__dirname, 'storage');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const TASK_CONTENT_DIR = path.join(DATA_DIR, 'task-content');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');
const STORIES_FILE = path.join(DATA_DIR, 'stories.json');
const SPLIT_STORY_FILES_FILE = path.join(DATA_DIR, 'split-story-files.json');
const TOP_LINES_FILES_FILE = path.join(DATA_DIR, 'top-lines-files.json');

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

ensureDirSync(DATA_DIR);
ensureDirSync(UPLOAD_DIR);
ensureDirSync(TASK_CONTENT_DIR);

let tasks = loadJsonFile(TASKS_FILE, []).map(hydrateTask);
let projects = loadJsonFile(PROJECTS_FILE, []);
let prompts = loadJsonFile(PROMPTS_FILE, []);
let stories = loadJsonFile(STORIES_FILE, []);
let splitStoryFiles = loadJsonFile(SPLIT_STORY_FILES_FILE, []);
let topLinesFiles = loadJsonFile(TOP_LINES_FILES_FILE, []);

const tasksWriteQueue = createJsonWriteQueue(TASKS_FILE, () => buildTasksSnapshot(tasks));
const splitStoryFilesWriteQueue = createJsonWriteQueue(
  SPLIT_STORY_FILES_FILE,
  () => splitStoryFiles
);
const topLinesFilesWriteQueue = createJsonWriteQueue(
  TOP_LINES_FILES_FILE,
  () => topLinesFiles
);

async function saveTasks() {
  await tasksWriteQueue.save();
}

async function saveSplitStoryFiles() {
  await splitStoryFilesWriteQueue.save();
}

async function saveTopLinesFiles() {
  await topLinesFilesWriteQueue.save();
}

function saveProjects() {
  saveJsonFile(PROJECTS_FILE, projects);
}

async function loadTaskResult(task) {
  const contentFilePath = getTaskContentPath(TASK_CONTENT_DIR, task.id);
  const taskContent = await readTaskContent(TASK_CONTENT_DIR, task.id);

  if (taskContent && typeof taskContent.result === 'string') {
    return taskContent.result;
  }

  if (hasInlineResult(task)) {
    return task.result;
  }

  const error = new Error(`任务结果文件缺失: ${contentFilePath}`);
  error.statusCode = 500;
  error.code = 'TASK_RESULT_MISSING';
  throw error;
}

async function readTaskResultForResponse(task, options = {}) {
  const { allowEmpty = false } = options;

  try {
    return await loadTaskResult(task);
  } catch (error) {
    if (allowEmpty && error.code === 'TASK_RESULT_MISSING') {
      return '';
    }
    throw error;
  }
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

function sanitizeFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_');
}

function decodeUploadFileName(originalname) {
  return Buffer.from(originalname || '', 'latin1').toString('utf8');
}

function findSecondStorySplitIndex(content) {
  const text = String(content || '');
  if (!text) {
    return -1;
  }

  const markers = [
    '接下来请收听第2个故事',
    '接下来请收听第二个故事',
    '接下来请听第2个故事',
    '接下来请听第二个故事',
    '下面请收听第2个故事',
    '下面请收听第二个故事',
    '第2个故事',
    '第二个故事'
  ];

  let bestIndex = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index > 0 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function extractSecondStoryTitleSeed(content) {
  const text = String(content || '').replace(/\r/g, '').trim();
  if (!text) {
    return '';
  }

  const normalized = text
    .replace(/^(?:接下来请(?:收听|听)|下面请收听)\s*第[2二]个故事[:：，,。！？!?、\s-]*/u, '')
    .replace(/^第[2二]个故事[:：，,。！？!?、\s-]*/u, '')
    .trim();

  const firstLine = normalized
    .split('\n')
    .map(item => item.trim())
    .find(Boolean) || normalized;
  const firstSentence = firstLine.split(/[。！？!?]/)[0].trim();

  return firstSentence.replace(/\s+/g, '').slice(0, 24);
}

function buildSecondStoryLongTitle(content) {
  const seed = extractSecondStoryTitleSeed(content);
  if (!seed) {
    return '第二个故事：这后半段其实是另一条完整故事线';
  }
  if (seed.length >= 10) {
    return `第二个故事：${seed}`;
  }
  return `第二个故事：${seed}，后面的发展和前面完全不是一回事`;
}

function buildSplitStorySegments(fileContent) {
  const content = String(fileContent || '');
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return [
      {
        title: '故事1',
        originalContent: normalizedContent
      }
    ];
  }

  const splitIndex = findSecondStorySplitIndex(content);
  if (splitIndex <= 0) {
    return [
      {
        title: '故事1',
        originalContent: normalizedContent
      }
    ];
  }

  const firstContent = content.slice(0, splitIndex).trim();
  const secondContent = content.slice(splitIndex).trim();

  if (!firstContent || !secondContent) {
    return [
      {
        title: '故事1',
        originalContent: normalizedContent
      }
    ];
  }

  return [
    {
      title: '故事1',
      originalContent: firstContent
    },
    {
      title: buildSecondStoryLongTitle(secondContent),
      originalContent: secondContent
    }
  ];
}

function createSplitSourceFile(originalFileName, storyTitle, storyIndex, originalContent) {
  const parsed = path.parse(originalFileName || 'story.txt');
  const safeBaseName = sanitizeFileName(parsed.name || 'story');
  const safeStoryTitle = sanitizeFileName(storyTitle || `故事${storyIndex}`);
  const storedFileName = `${createId('split')}.txt`;
  const absolutePath = path.join(UPLOAD_DIR, storedFileName);

  fs.writeFileSync(absolutePath, originalContent, 'utf8');

  return {
    storedFileName,
    downloadFileName: storyIndex === 1 ? `${safeBaseName}.txt` : `${safeStoryTitle}.txt`
  };
}

function normalizeSplitStoryFileRecord(record = {}) {
  return {
    id: record.id || createId('split_story'),
    fileName: record.fileName || '',
    filePath: record.filePath || '',
    projectId: record.projectId || '',
    projectType: record.projectType || '',
    status: typeof record.status === 'number' ? record.status : 0,
    statusText: record.statusText || '待拆分',
    progress: Number.isFinite(record.progress) ? record.progress : 0,
    storyCount: Number.isFinite(record.storyCount) ? record.storyCount : 0,
    storyTitles: Array.isArray(record.storyTitles) ? record.storyTitles : [],
    resultFileNames: Array.isArray(record.resultFileNames) ? record.resultFileNames : [],
    analysisSummary: record.analysisSummary || '',
    errorMessage: record.errorMessage || '',
    resultTaskIds: Array.isArray(record.resultTaskIds) ? record.resultTaskIds : [],
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
    startedAt: record.startedAt ?? null,
    endTime: record.endTime ?? null,
    originalLength: Number.isFinite(record.originalLength) ? record.originalLength : 0
  };
}

function withSplitStoryProjectInfo(record) {
  const normalized = normalizeSplitStoryFileRecord(record);
  const project = getProjectById(normalized.projectId);

  return {
    ...normalized,
    projectName: project?.name || ''
  };
}

function getSplitStoryFileById(id) {
  return splitStoryFiles.find(item => item.id === id) || null;
}

async function deleteSplitStoryFilesByIds(ids = []) {
  const deletingFiles = splitStoryFiles.filter(file => ids.includes(file.id));
  if (!deletingFiles.length) {
    return [];
  }

  const deletingTaskIds = new Set(
    deletingFiles.flatMap(file => (Array.isArray(file.resultTaskIds) ? file.resultTaskIds : []))
  );
  const deletingTasks = tasks.filter(task => deletingTaskIds.has(task.id));

  splitStoryFiles = splitStoryFiles.filter(file => !ids.includes(file.id));
  tasks = tasks.filter(task => !deletingTaskIds.has(task.id));

  await Promise.all([saveTasks(), saveSplitStoryFiles()]);

  for (const fileRecord of deletingFiles) {
    const sourcePath = resolveUploadPath(fileRecord.filePath);
    if (sourcePath && fs.existsSync(sourcePath)) {
      try {
        fs.unlinkSync(sourcePath);
      } catch (error) {
        console.warn('Failed to delete split source file:', fileRecord.filePath, error.message);
      }
    }
  }

  for (const task of deletingTasks) {
    const uploadPath = resolveUploadPath(task.filePath);
    if (uploadPath && fs.existsSync(uploadPath)) {
      try {
        fs.unlinkSync(uploadPath);
      } catch (error) {
        console.warn('Failed to delete split result upload file:', task.filePath, error.message);
      }
    }

    try {
      await deleteTaskContent(TASK_CONTENT_DIR, task.id);
    } catch (error) {
      console.warn('Failed to delete split result task content:', task.id, error.message);
    }
  }

  return deletingFiles;
}

function createSplitResultTasks(fileRecord, storySegments) {
  const now = Date.now();

  return storySegments.map((segment, index) => {
    const storyIndex = index + 1;
    const splitSourceFile = createSplitSourceFile(
      fileRecord.fileName,
      segment.title,
      storyIndex,
      segment.originalContent
    );

    return {
      id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: splitSourceFile.downloadFileName,
      filePath: splitSourceFile.storedFileName,
      status: 1,
      model: '',
      promptType: 'preset',
      promptKey: '',
      promptContent: '',
      errorMessage: '',
      providerTraceId: '',
      providerFinishReason: '',
      processTime: '0.00',
      projectId: fileRecord.projectId,
      projectType: fileRecord.projectType || '',
      startedAt: now,
      endTime: now,
      attemptCount: 1,
      lastErrorType: '',
      providerStatus: null,
      originalLength: segment.originalContent.length,
      resultLength: segment.originalContent.length
    };
  });
}

splitStoryFiles = splitStoryFiles.map(normalizeSplitStoryFileRecord);

function buildTopLinesResultFileName(originalFileName) {
  const parsed = path.parse(originalFileName || 'result.txt');
  const safeBaseName = sanitizeFileName(parsed.name || 'result');
  return `${safeBaseName}_前20行.txt`;
}

function buildTopLinesContent(rawContent) {
  const normalized = String(rawContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized ? normalized.split('\n') : [];
  const extractedLines = lines.slice(0, 20);

  return {
    originalLineCount: lines.length,
    extractedLineCount: extractedLines.length,
    extractedContent: extractedLines.join('\n').trimEnd(),
    previewText: extractedLines.slice(0, 3).join('\n').trim()
  };
}

function normalizeTopLinesFileRecord(record = {}) {
  return {
    id: record.id || createId('top_lines'),
    fileName: record.fileName || '',
    filePath: record.filePath || '',
    projectId: record.projectId || '',
    projectType: record.projectType || '',
    status: typeof record.status === 'number' ? record.status : 0,
    statusText: record.statusText || '待处理',
    resultContentId: record.resultContentId || '',
    resultFileName: record.resultFileName || '',
    previewText: record.previewText || '',
    originalLineCount: Number.isFinite(record.originalLineCount) ? record.originalLineCount : 0,
    extractedLineCount: Number.isFinite(record.extractedLineCount) ? record.extractedLineCount : 0,
    errorMessage: record.errorMessage || '',
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
    originalLength: Number.isFinite(record.originalLength) ? record.originalLength : 0
  };
}

function withTopLinesProjectInfo(record) {
  const normalized = normalizeTopLinesFileRecord(record);
  const project = getProjectById(normalized.projectId);

  return {
    ...normalized,
    projectName: project?.name || ''
  };
}

async function readTopLinesResult(record) {
  if (!record?.resultContentId) {
    const error = new Error('截取结果不存在');
    error.statusCode = 404;
    throw error;
  }

  const content = await readTaskContent(TASK_CONTENT_DIR, record.resultContentId);
  if (!content || typeof content.result !== 'string') {
    const error = new Error('截取结果文件缺失');
    error.statusCode = 404;
    throw error;
  }

  return content.result;
}

async function buildCombinedTopLinesContent(records = []) {
  const sections = [];

  for (const record of records) {
    const content = await readTopLinesResult(record);
    sections.push(`【${record.fileName || '未命名文件'}】\n${content}`);
  }

  return sections.join('\n\n====================\n\n');
}

async function deleteTopLinesFilesByIds(ids = []) {
  const deletingFiles = topLinesFiles.filter(file => ids.includes(file.id));
  if (!deletingFiles.length) {
    return [];
  }

  topLinesFiles = topLinesFiles.filter(file => !ids.includes(file.id));
  await saveTopLinesFiles();

  await Promise.allSettled(
    deletingFiles.map(file => {
      if (!file.resultContentId) {
        return Promise.resolve();
      }
      return deleteTaskContent(TASK_CONTENT_DIR, file.resultContentId);
    })
  );

  return deletingFiles;
}

topLinesFiles = topLinesFiles.map(normalizeTopLinesFileRecord);

function withProjectInfo(task) {
  const project = getProjectById(task.projectId);
  const responseTask = normalizeTaskMetadata(task);
  return {
    ...responseTask,
    projectType: responseTask.projectType || project?.type || '',
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
    void saveTasks().catch(error => {
      console.error('保存任务元数据失败:', error.message);
    });
  }
}

const legacyTaskCount = tasks.filter(hasLegacyTaskContent).length;
if (legacyTaskCount > 0) {
  console.warn(
    `[tasks] 检测到 ${legacyTaskCount} 条旧格式任务（内联 result/originalContent），请执行 npm run migrate:task-content`
  );
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

app.delete('/projects/:id', async (req, res) => {
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
    await saveTasks();
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
async function processSplitStoryFile(fileId) {
  const fileRecord = getSplitStoryFileById(fileId);
  if (!fileRecord) {
    return null;
  }

  const startedAt = Date.now();
  fileRecord.status = 2;
  fileRecord.statusText = '拆分中，正在查找“第二个故事”';
  fileRecord.progress = 20;
  fileRecord.storyCount = 0;
  fileRecord.storyTitles = [];
  fileRecord.resultFileNames = [];
  fileRecord.analysisSummary = '';
  fileRecord.errorMessage = '';
  fileRecord.resultTaskIds = [];
  fileRecord.startedAt = startedAt;
  fileRecord.endTime = null;
  fileRecord.updatedAt = startedAt;
  await saveSplitStoryFiles();

  try {
    const resolvedPath = resolveUploadPath(fileRecord.filePath);
    const sourceContent = fs.readFileSync(resolvedPath, 'utf8');
    fileRecord.originalLength = sourceContent.length;

    const storySegments = buildSplitStorySegments(sourceContent);
    fileRecord.storyCount = storySegments.length;
    fileRecord.storyTitles = storySegments.map(segment => segment.title);
    fileRecord.statusText = `拆分中，当前识别到 ${storySegments.length} 个故事，正在生成文件`;
    fileRecord.progress = 70;
    fileRecord.updatedAt = Date.now();
    await saveSplitStoryFiles();

    const resultTasks = createSplitResultTasks(fileRecord, storySegments);
    fileRecord.resultTaskIds = resultTasks.map(task => task.id);
    fileRecord.resultFileNames = resultTasks.map(task => task.fileName);
    fileRecord.analysisSummary = storySegments.length > 1
      ? `${fileRecord.resultFileNames.join('、')}`
      : `${fileRecord.resultFileNames[0] || fileRecord.fileName}`;
    tasks = [...resultTasks, ...tasks];

    for (let index = 0; index < resultTasks.length; index += 1) {
      await writeTaskContent(
        TASK_CONTENT_DIR,
        resultTasks[index].id,
        storySegments[index].originalContent
      );
    }

    const endTime = Date.now();
    const processTime = ((endTime - startedAt) / 1000).toFixed(2);
    resultTasks.forEach(task => {
      task.processTime = processTime;
      task.endTime = endTime;
    });

    fileRecord.status = 1;
    fileRecord.statusText = storySegments.length > 1
      ? `拆分完成，已生成 ${storySegments.length} 个文件`
      : '拆分完成，当前文件只生成 1 个结果文件';
    fileRecord.progress = 100;
    fileRecord.endTime = endTime;
    fileRecord.updatedAt = endTime;
    fileRecord.errorMessage = '';

    await Promise.all([saveTasks(), saveSplitStoryFiles()]);
    return withSplitStoryProjectInfo(fileRecord);
  } catch (error) {
    const endTime = Date.now();
    fileRecord.status = 3;
    fileRecord.statusText = '拆分失败';
    fileRecord.progress = 0;
    fileRecord.errorMessage = error.message || '拆分失败';
    fileRecord.endTime = endTime;
    fileRecord.updatedAt = endTime;
    await saveSplitStoryFiles();
    return withSplitStoryProjectInfo(fileRecord);
  }
}

app.get('/split-story/files', (req, res) => {
  const { projectId } = req.query;
  let filteredFiles = splitStoryFiles;

  if (projectId && projectId !== 'ALL') {
    filteredFiles = filteredFiles.filter(item => item.projectId === projectId);
  }

  filteredFiles = [...filteredFiles].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  res.json({ files: filteredFiles.map(withSplitStoryProjectInfo) });
});

app.post('/split-story/upload', upload.array('files'), async (req, res) => {
  if (!Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: '请至少上传一个 txt 文件' });
  }

  let selectedProject;
  try {
    selectedProject = resolveUploadProject(req.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || '绑定项目失败' });
  }

  const now = Date.now();
  const newFiles = req.files.map((file, index) => {
    const originalContent = fs.readFileSync(file.path, 'utf8');

    return normalizeSplitStoryFileRecord({
      id: createId('split_story'),
      fileName: decodeUploadFileName(file.originalname),
      filePath: file.filename,
      projectId: selectedProject.id,
      projectType: selectedProject.type || '',
      status: 0,
      statusText: '待拆分',
      progress: 0,
      storyCount: 0,
      storyTitles: [],
      resultFileNames: [],
      analysisSummary: '',
      errorMessage: '',
      resultTaskIds: [],
      createdAt: now + index,
      updatedAt: now + index,
      startedAt: null,
      endTime: null,
      originalLength: originalContent.length
    });
  });

  splitStoryFiles = [...newFiles, ...splitStoryFiles];
  await saveSplitStoryFiles();
  res.json({ files: newFiles.map(withSplitStoryProjectInfo) });
});

app.post('/split-story/start', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) {
    return res.status(400).json({ error: '请选择需要拆分的文件' });
  }

  const processedFiles = [];
  const skipped = [];

  for (const id of ids) {
    const fileRecord = getSplitStoryFileById(id);
    if (!fileRecord) {
      skipped.push({ id, reason: '文件不存在' });
      continue;
    }

    const processed = await processSplitStoryFile(id);
    if (processed) {
      processedFiles.push(processed);
    }
  }

  res.json({
    success: true,
    files: processedFiles,
    skipped
  });
});

app.post('/split-story/delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) {
    return res.status(400).json({ error: '请选择需要删除的文件' });
  }

  try {
    await deleteSplitStoryFilesByIds(ids);
    res.json({ files: splitStoryFiles.map(withSplitStoryProjectInfo) });
  } catch (error) {
    res.status(500).json({ error: '删除拆分文件失败', detail: error.message });
  }
});

app.get('/top-lines/files', (req, res) => {
  const { projectId } = req.query;
  let filteredFiles = topLinesFiles;

  if (projectId && projectId !== 'ALL') {
    filteredFiles = filteredFiles.filter(item => item.projectId === projectId);
  }

  filteredFiles = [...filteredFiles].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  res.json({ files: filteredFiles.map(withTopLinesProjectInfo) });
});

app.post('/top-lines/upload', upload.array('files'), async (req, res) => {
  if (!Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: '请至少上传一个 txt 文件' });
  }

  let selectedProject = null;
  const hasProjectBinding =
    typeof req.body?.projectId === 'string' && req.body.projectId.trim() ||
    typeof req.body?.newProjectName === 'string' && req.body.newProjectName.trim();

  if (hasProjectBinding) {
    try {
      selectedProject = resolveUploadProject(req.body);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || '绑定项目失败' });
    }
  }

  const now = Date.now();
  const createdFiles = [];

  for (let index = 0; index < req.files.length; index += 1) {
    const file = req.files[index];
    const decodedFileName = decodeUploadFileName(file.originalname);
    const resultContentId = createId('top_lines_result');
    const record = normalizeTopLinesFileRecord({
      id: createId('top_lines'),
      fileName: decodedFileName,
      filePath: '',
      projectId: selectedProject?.id || '',
      projectType: selectedProject?.type || '',
      status: 1,
      statusText: '截取完成',
      resultContentId,
      resultFileName: buildTopLinesResultFileName(decodedFileName),
      previewText: '',
      originalLineCount: 0,
      extractedLineCount: 0,
      errorMessage: '',
      createdAt: now + index,
      updatedAt: now + index,
      originalLength: 0
    });

    try {
      const sourceContent = fs.readFileSync(file.path, 'utf8');
      record.originalLength = sourceContent.length;
      const topLinesResult = buildTopLinesContent(sourceContent);
      await writeTaskContent(TASK_CONTENT_DIR, resultContentId, topLinesResult.extractedContent);
      record.previewText = topLinesResult.previewText;
      record.originalLineCount = topLinesResult.originalLineCount;
      record.extractedLineCount = topLinesResult.extractedLineCount;
      record.statusText = `???? ${topLinesResult.extractedLineCount} ?`;
    } catch (error) {
      record.status = 3;
      record.statusText = '????';
      record.errorMessage = error.message || '????';
    }
    createdFiles.push(record);
  }

  await Promise.allSettled(req.files.map(file => fs.promises.rm(file.path, { force: true })));

  topLinesFiles = [...createdFiles, ...topLinesFiles];
  await saveTopLinesFiles();
  res.json({ files: createdFiles.map(withTopLinesProjectInfo) });
});

app.post('/top-lines/download', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

  if (!ids.length) {
    return res.status(400).json({ error: '请选择需要下载的文件' });
  }

  const records = ids
    .map(id => topLinesFiles.find(item => item.id === id))
    .filter(record => record && record.status === 1 && record.resultContentId);

  if (!records.length) {
    return res.status(404).json({ error: '没有可下载的截取结果' });
  }

  try {
    let content = '';
    let fileName = '前20行合并.txt';

    if (records.length === 1) {
      content = await readTopLinesResult(records[0]);
      fileName = records[0].fileName || '前20行.txt';
    } else {
      content = await buildCombinedTopLinesContent(records);
    }

    const safeFileName = encodeURIComponent(fileName)
      .replace(/[\'()]/g, escape)
      .replace(/\*/g, '%2A');

    res.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.set('Content-Type', 'text/plain');
    res.send(content);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: '下载失败', detail: error.message });
  }
});

app.post('/top-lines/delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) {
    return res.status(400).json({ error: '请选择需要删除的文件' });
  }

  try {
    await deleteTopLinesFilesByIds(ids);
    res.json({ files: topLinesFiles.map(withTopLinesProjectInfo) });
  } catch (error) {
    res.status(500).json({ error: '删除前20行记录失败', detail: error.message });
  }
});

app.post('/tasks/upload', upload.array('files'), async (req, res) => {
  if (!Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: '请至少上传一个 txt 文件' });
  }

  let selectedProject;
  try {
    selectedProject = resolveUploadProject(req.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || '绑定项目失败' });
  }

  const newTasks = req.files.map((file, index) => {
    const originalContent = fs.readFileSync(file.path, 'utf8');

    return {
      id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: decodeUploadFileName(file.originalname),
      filePath: file.filename,
      status: 0,
      model: '',
      promptType: 'preset',
      promptKey: '',
      promptContent: '',
      errorMessage: '',
      providerTraceId: '',
      providerFinishReason: '',
      processTime: '',
      projectId: selectedProject.id,
      projectType: selectedProject.type || '',
      startedAt: null,
      endTime: null,
      attemptCount: 0,
      lastErrorType: '',
      providerStatus: null,
      originalLength: originalContent.length,
      resultLength: 0
    };
  });

  tasks = [...newTasks, ...tasks];
  await saveTasks();
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

app.post('/tasks/config', async (req, res) => {
  const { ids, model, promptType, promptKey, promptContent } = req.body;
  tasks = tasks.map(task => (
    ids.includes(task.id)
      ? { ...task, model, promptType, promptKey, promptContent }
      : task
  ));
  await saveTasks();
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

    const startTime = Date.now();
    task.status = 2;
    task.startedAt = startTime;
    task.endTime = null;
    task.processTime = '';
    task.attemptCount = Number.isFinite(task.attemptCount) ? task.attemptCount + 1 : 1;
    task.lastErrorType = '';
    task.providerStatus = null;
    task.errorMessage = '';
    task.providerTraceId = '';
    task.providerFinishReason = '';
    let fileContent = '';
    const usePrompt = task.promptType === 'preset'
      ? prompts.find(prompt => prompt.key === task.promptKey)?.content || ''
      : task.promptContent;

    try {
      const resolvedPath = resolveUploadPath(task.filePath);
      fileContent = fs.readFileSync(resolvedPath, 'utf-8');
      task.originalLength = fileContent.length;
      const rewriteResult = await silicon.rewriteWithSilicon(fileContent, usePrompt, task.model);
      await writeTaskContent(TASK_CONTENT_DIR, task.id, rewriteResult.content);
      task.status = 1;
      if (hasInlineResult(task)) {
        task.result = rewriteResult.content;
      }
      task.errorMessage = '';
      task.providerTraceId = rewriteResult.traceId || '';
      task.providerFinishReason = rewriteResult.finishReason || '';
      task.resultLength = rewriteResult.content.length;
    } catch (error) {
      task.status = 3;
      task.errorMessage = error.message || '处理失败';
      task.providerTraceId = error.providerTraceId || '';
      task.providerFinishReason = error.providerFinishReason || '';
      task.lastErrorType = error.code || error.name || 'UNKNOWN';
      task.providerStatus = error.providerStatus ?? null;
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
    await saveTasks();
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

app.get('/tasks/result', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const task = tasks.find(item => String(item.id) === String(id));
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  try {
    const content = await readTaskResultForResponse(task);
    res.json({ id: task.id, content });
  } catch (error) {
    console.error('[tasks/result] Failed to read task result:', task.id, getTaskContentPath(TASK_CONTENT_DIR, task.id), error.message);
    res.status(error.statusCode || 500).json({ error: 'Failed to read task result', detail: error.message });
  }
});

app.post('/tasks/download', async (req, res) => {
  const { ids, zipFileName } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).send('No tasks for download');
  }

  if (ids.length === 1) {
    const task = tasks.find(item => item.id === ids[0]);
    if (!task) {
      return res.status(404).send('Task not found');
    }

    try {
      const resultContent = await readTaskResultForResponse(task);
      const fileName = task.fileName || 'result.txt';
      const safeFileName = encodeURIComponent(fileName).replace(/[\'()]/g, escape).replace(/\*/g, '%2A');
      res.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.set('Content-Type', 'text/plain');
      res.send(resultContent.replace(/\u2014\u2014/g, '\uFF0C'));
      return;
    } catch (error) {
      console.error('[tasks/download] Missing task result:', task.id, getTaskContentPath(TASK_CONTENT_DIR, task.id), error.message);
      return res.status(error.statusCode || 500).json({ error: 'Download failed', detail: error.message });
    }
  }

  try {
    const JSZip = require('jszip');
    const zip = new JSZip();

    for (const id of ids) {
      const task = tasks.find(item => item.id === id);
      if (!task) {
        continue;
      }

      const resultContent = await readTaskResultForResponse(task);
      zip.file(task.fileName || `${id}.txt`, resultContent.replace(/\u2014\u2014/g, '\uFF0C'));
    }

    const data = await zip.generateAsync({ type: 'nodebuffer' });
    const downloadName =
      typeof zipFileName === 'string' && zipFileName.trim()
        ? zipFileName.trim()
        : 'results.zip';
    const normalizedZipFileName = downloadName.toLowerCase().endsWith('.zip')
      ? downloadName
      : `${downloadName}.zip`;
    const safeZipFileName = encodeURIComponent(normalizedZipFileName)
      .replace(/[\'()]/g, escape)
      .replace(/\*/g, '%2A');

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${safeZipFileName}"`);
    res.send(data);
  } catch (error) {
    console.error('[tasks/download] Batch download failed:', error.message);
    res.status(error.statusCode || 500).json({ error: 'Batch download failed', detail: error.message });
  }
});

app.post('/tasks/delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Task IDs are required' });
  }

  const deletingTasks = tasks.filter(task => ids.includes(task.id));
  tasks = tasks.filter(task => !ids.includes(task.id));

  try {
    await saveTasks();

    for (const task of deletingTasks) {
      const filePath = resolveUploadPath(task.filePath);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.warn('Failed to delete upload file:', task.filePath, error.message);
        }
      }

      try {
        await deleteTaskContent(TASK_CONTENT_DIR, task.id);
      } catch (error) {
        console.warn('Failed to delete task content file:', task.id, error.message);
      }
    }

    res.json({ tasks: tasks.map(withProjectInfo) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete tasks', detail: error.message });
  }
});

app.post('/tasks/overwrite-original', async (req, res) => {
  const { id, content } = req.body;
  if (!id || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing id or content' });
  }

  const task = tasks.find(item => item.id === id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  try {
    await writeTaskContent(TASK_CONTENT_DIR, task.id, content);
    if (hasInlineResult(task)) {
      task.result = content;
    }
    task.resultLength = content.length;
    task.status = 1;
    task.errorMessage = '';
    task.lastErrorType = '';
    task.endTime = Date.now();
    await saveTasks();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Write failed', detail: error.message });
  }
});

app.get('/tasks/original', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const task = tasks.find(item => String(item.id) === String(id));
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const filePath = resolveUploadPath(task.filePath);
  try {
    let data = '';
    if (filePath && fs.existsSync(filePath)) {
      data = fs.readFileSync(filePath, 'utf8');
    } else if (hasInlineOriginalContent(task)) {
      data = task.originalContent;
    } else {
      return res.status(404).json({ error: 'Original file not found' });
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read file', detail: error.message });
  }
});

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
