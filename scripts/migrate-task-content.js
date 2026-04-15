const fs = require('fs');
const path = require('path');
const {
  ensureDirSync,
  normalizeTaskMetadata,
  readTaskContent,
  writeJsonAtomic,
  writeTaskContent
} = require('../backend/task_storage');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const dataDir = path.join(backendDir, 'data');
const storageDir = path.join(backendDir, 'storage');
const uploadDir = path.join(storageDir, 'uploads');
const tasksFile = path.join(dataDir, 'tasks.json');
const taskContentDir = path.join(dataDir, 'task-content');

function loadTasks() {
  if (!fs.existsSync(tasksFile)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
}

function resolveUploadPath(rawFilePath) {
  if (!rawFilePath) {
    return null;
  }

  if (path.isAbsolute(rawFilePath)) {
    return rawFilePath.startsWith(uploadDir)
      ? rawFilePath
      : path.join(uploadDir, path.basename(rawFilePath));
  }

  return path.join(uploadDir, path.basename(rawFilePath));
}

async function migrate() {
  const tasks = loadTasks();
  if (!tasks.length) {
    console.log('[skip] 没有可迁移的任务数据');
    return;
  }

  ensureDirSync(taskContentDir);

  const backupFile = path.join(dataDir, `tasks.backup.${Date.now()}.json`);
  fs.copyFileSync(tasksFile, backupFile);
  console.log(`[backup] ${path.relative(rootDir, backupFile)}`);

  let migratedResultCount = 0;
  let existingContentCount = 0;
  let missingOriginalCount = 0;

  const migratedTasks = [];

  for (const task of tasks) {
    const normalizedTask = normalizeTaskMetadata(task);
    const inlineResult = typeof task.result === 'string' ? task.result : '';
    const inlineOriginal = typeof task.originalContent === 'string' ? task.originalContent : '';

    if (inlineResult) {
      await writeTaskContent(taskContentDir, task.id, inlineResult);
      migratedResultCount += 1;
    } else {
      const existingContent = await readTaskContent(taskContentDir, task.id);
      if (existingContent && typeof existingContent.result === 'string') {
        existingContentCount += 1;
        normalizedTask.resultLength = existingContent.result.length;
      }
    }

    if (!normalizedTask.originalLength) {
      if (inlineOriginal) {
        normalizedTask.originalLength = inlineOriginal.length;
      } else {
        const uploadPath = resolveUploadPath(task.filePath);
        if (uploadPath && fs.existsSync(uploadPath)) {
          normalizedTask.originalLength = fs.readFileSync(uploadPath, 'utf8').length;
        } else {
          normalizedTask.originalLength = 0;
          missingOriginalCount += 1;
        }
      }
    }

    if (!normalizedTask.resultLength && inlineResult) {
      normalizedTask.resultLength = inlineResult.length;
    }

    migratedTasks.push(normalizedTask);
  }

  await writeJsonAtomic(tasksFile, migratedTasks);

  console.log(`[done] 总任务数: ${migratedTasks.length}`);
  console.log(`[done] 已迁移结果文件: ${migratedResultCount}`);
  console.log(`[done] 已存在结果文件: ${existingContentCount}`);
  console.log(`[done] 缺失原文文件: ${missingOriginalCount}`);
  console.log(`[done] 已写入精简版 tasks.json`);
}

migrate().catch(error => {
  console.error('[error] 迁移失败:', error.message);
  process.exit(1);
});
