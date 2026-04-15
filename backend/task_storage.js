const fs = require('fs');
const path = require('path');

const TASK_METADATA_FIELDS = [
  'id',
  'fileName',
  'filePath',
  'status',
  'model',
  'promptType',
  'promptKey',
  'promptContent',
  'processTime',
  'errorMessage',
  'providerTraceId',
  'providerFinishReason',
  'projectId',
  'projectType',
  'startedAt',
  'endTime',
  'attemptCount',
  'lastErrorType',
  'providerStatus',
  'originalLength',
  'resultLength'
];

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeTaskMetadata(task = {}) {
  const normalizedTask = {};

  TASK_METADATA_FIELDS.forEach(field => {
    if (task[field] !== undefined) {
      normalizedTask[field] = task[field];
    }
  });

  if (normalizedTask.status === undefined) {
    normalizedTask.status = typeof task.status === 'number' ? task.status : 0;
  }

  if (normalizedTask.promptType === undefined) {
    normalizedTask.promptType = task.promptType || 'preset';
  }

  if (normalizedTask.promptKey === undefined) {
    normalizedTask.promptKey = task.promptKey || '';
  }

  if (normalizedTask.promptContent === undefined) {
    normalizedTask.promptContent = task.promptContent || '';
  }

  if (normalizedTask.model === undefined) {
    normalizedTask.model = task.model || '';
  }

  if (normalizedTask.errorMessage === undefined) {
    normalizedTask.errorMessage = task.errorMessage || '';
  }

  if (normalizedTask.providerTraceId === undefined) {
    normalizedTask.providerTraceId = task.providerTraceId || '';
  }

  if (normalizedTask.providerFinishReason === undefined) {
    normalizedTask.providerFinishReason = task.providerFinishReason || '';
  }

  if (normalizedTask.processTime === undefined) {
    normalizedTask.processTime = task.processTime || '';
  }

  if (normalizedTask.attemptCount === undefined) {
    normalizedTask.attemptCount = Number.isFinite(task.attemptCount) ? task.attemptCount : 0;
  }

  if (normalizedTask.lastErrorType === undefined) {
    normalizedTask.lastErrorType = task.lastErrorType || '';
  }

  if (normalizedTask.providerStatus === undefined) {
    normalizedTask.providerStatus = task.providerStatus ?? null;
  }

  if (normalizedTask.startedAt === undefined) {
    normalizedTask.startedAt = task.startedAt ?? null;
  }

  if (normalizedTask.endTime === undefined) {
    normalizedTask.endTime = task.endTime ?? null;
  }

  if (normalizedTask.originalLength === undefined) {
    if (Number.isFinite(task.originalLength)) {
      normalizedTask.originalLength = task.originalLength;
    } else if (typeof task.originalContent === 'string') {
      normalizedTask.originalLength = task.originalContent.length;
    } else {
      normalizedTask.originalLength = 0;
    }
  }

  if (normalizedTask.resultLength === undefined) {
    if (Number.isFinite(task.resultLength)) {
      normalizedTask.resultLength = task.resultLength;
    } else if (typeof task.result === 'string') {
      normalizedTask.resultLength = task.result.length;
    } else {
      normalizedTask.resultLength = 0;
    }
  }

  return normalizedTask;
}

function hydrateTask(task = {}) {
  const normalizedTask = normalizeTaskMetadata(task);

  if (typeof task.originalContent === 'string') {
    normalizedTask.originalContent = task.originalContent;
  }

  if (typeof task.result === 'string') {
    normalizedTask.result = task.result;
  }

  return normalizedTask;
}

function hasInlineOriginalContent(task = {}) {
  return typeof task.originalContent === 'string';
}

function hasInlineResult(task = {}) {
  return typeof task.result === 'string';
}

function hasLegacyTaskContent(task = {}) {
  return hasInlineOriginalContent(task) || hasInlineResult(task);
}

function buildTasksSnapshot(tasks = []) {
  const preserveLegacyInlineContent = tasks.some(hasLegacyTaskContent);

  return tasks.map(task => {
    const snapshot = normalizeTaskMetadata(task);

    if (preserveLegacyInlineContent) {
      if (hasInlineOriginalContent(task)) {
        snapshot.originalContent = task.originalContent;
      }
      if (hasInlineResult(task)) {
        snapshot.result = task.result;
      }
    }

    return snapshot;
  });
}

async function writeFileAtomic(filePath, content) {
  ensureDirSync(path.dirname(filePath));
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.promises.writeFile(tempFilePath, content, 'utf8');

  try {
    await fs.promises.rename(tempFilePath, filePath);
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'EPERM') {
      await fs.promises.rm(filePath, { force: true });
      await fs.promises.rename(tempFilePath, filePath);
    } else {
      await fs.promises.rm(tempFilePath, { force: true });
      throw error;
    }
  }
}

async function writeJsonAtomic(filePath, data) {
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}

function createJsonWriteQueue(filePath, getSnapshot) {
  let writingPromise = null;
  let hasPendingWrite = false;

  const flush = async () => {
    if (writingPromise) {
      return writingPromise;
    }

    writingPromise = (async () => {
      try {
        do {
          hasPendingWrite = false;
          await writeJsonAtomic(filePath, getSnapshot());
        } while (hasPendingWrite);
      } finally {
        writingPromise = null;
      }
    })();

    return writingPromise;
  };

  return {
    async save() {
      hasPendingWrite = true;
      return flush();
    },
    async wait() {
      if (writingPromise) {
        await writingPromise;
      }
    }
  };
}

function getTaskContentPath(contentDir, taskId) {
  return path.join(contentDir, `${taskId}.json`);
}

async function readTaskContent(contentDir, taskId) {
  const filePath = getTaskContentPath(contentDir, taskId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeTaskContent(contentDir, taskId, result) {
  const payload = {
    result: typeof result === 'string' ? result : '',
    resultUpdatedAt: Date.now()
  };

  await writeJsonAtomic(getTaskContentPath(contentDir, taskId), payload);
  return payload;
}

async function deleteTaskContent(contentDir, taskId) {
  await fs.promises.rm(getTaskContentPath(contentDir, taskId), { force: true });
}

module.exports = {
  TASK_METADATA_FIELDS,
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
  writeFileAtomic,
  writeJsonAtomic,
  writeTaskContent
};
