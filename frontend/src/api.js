import axios from 'axios';
import abortManager from './utils/abortControllerManager';
const BASE = 'http://192.168.31.61:3001';

// ---------------------- 任务相关（原有保留） ----------------------
export async function uploadFiles(files, projectPayload = {}) {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  if (projectPayload.projectId) {
    form.append('projectId', projectPayload.projectId);
  }
  if (projectPayload.newProjectName) {
    form.append('newProjectName', projectPayload.newProjectName);
  }
  const res = await axios.post(`${BASE}/tasks/upload`, form);
  return res.data.tasks;
}
export async function getTasks(params = {}) {
  const res = await axios.get(`${BASE}/tasks`, { params });
  return res.data.tasks;
}
export async function getModels() {
  const res = await axios.get(`${BASE}/models`);
  return res.data.models;
}
export async function getPrompts() {
  const res = await axios.get(`${BASE}/prompts`);
  return res.data.prompts;
}
export async function savePrompt(d) {
  const res = await axios.post(`${BASE}/prompts`, d);
  return res.data.prompts;
}
export async function configTasks(params) {
  const res = await axios.post(`${BASE}/tasks/config`, params);
  return res.data;
}
export async function startTasks(params) {
  const res = await axios.post(`${BASE}/tasks/start`, params);
  return res.data;
}
export async function downloadTasks(ids, zipFileName) {
  return await axios.post(
    `${BASE}/tasks/download`,
    { ids, zipFileName },
    { responseType: 'blob' }
  );
}
export async function deleteTasks(ids) {
  const res = await axios.post(`${BASE}/tasks/delete`, { ids });
  return res.data.tasks;
}

export async function getProjects() {
  const res = await axios.get(`${BASE}/projects`);
  return res.data.projects;
}

export async function createProject(payload) {
  const res = await axios.post(`${BASE}/projects`, payload);
  return res.data;
}

export async function updateProject(id, payload) {
  const res = await axios.put(`${BASE}/projects/${id}`, payload);
  return res.data;
}

export async function deleteProject(id, targetProjectId) {
  const res = await axios.delete(`${BASE}/projects/${id}`, {
    data: targetProjectId ? { targetProjectId } : {}
  });
  return res.data;
}
// ---------------------------------------------------------------

// 获取原文内容（根据任务id）
export async function getOriginalById(id) {
  const res = await axios.get(`${BASE}/tasks/original`, { params: { id } });
  return res.data; // 期望 { id, content }
}

// 覆盖原文（根据任务id）
export async function getResultById(id) {
  const res = await axios.get(`${BASE}/tasks/result`, { params: { id } });
  return res.data; // ?? { id, content }
}

export async function overwriteOriginal(id, content) {
  const res = await axios.post(`${BASE}/tasks/overwrite-original`, { id, content });
  return res.data; // 期望 { success: true }
}

// 生成短篇小说（非流式版本）
export async function generateStory(params) {
  const res = await axios.post(`${BASE}/story/generate`, params);
  return res.data; // 期望 { content: "..." }
}

// 生成短篇小说（流式版本，支持实时进度和继续生成）
export async function generateStoryStream(params, onProgress, taskId) {
  // 创建或获取 AbortController
  const controller = abortManager.createController(taskId);
  
  const response = await fetch(`${BASE}/story/generate-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      existingContent: params.existingContent || ''
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成失败');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
debugger
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (onProgress) {
              onProgress(data);
            }
          } catch (e) {
            console.error('解析 SSE 数据失败:', e);
          }
        }
      }
    }

    // 处理剩余的 buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (onProgress) {
          onProgress(data);
        }
      } catch (e) {
        console.error('解析 SSE 数据失败:', e);
      }
    }
  } catch (error) {
    // 检查是否是中止错误
    if (error.name === 'AbortError' || controller.signal.aborted) {
      console.log(`⏹️ 生成被中止: ${taskId}`);
      throw new Error('生成已停止');
    }
    throw error;
  } finally {
    // 清理 AbortController 资源
    abortManager.cleanup(taskId);
  }
}

// 保存小说数据
export async function saveStory(data) {
  const res = await axios.post(`${BASE}/stories/save`, data);
  return res.data;
}

// 获取所有小说数据（支持按分类筛选）
export async function getStories(category) {
  const params = category ? { params: { category } } : {};
  const res = await axios.get(`${BASE}/stories`, params);
  return res.data.stories;
}

// 根据ID获取单个小说
export async function getStoryById(id) {
  const res = await axios.get(`${BASE}/stories/${id}`);
  return res.data.story;
}

// 更新小说数据
export async function updateStory(data) {
  const res = await axios.post(`${BASE}/stories/update`, data);
  return res.data;
}

// 删除小说数据
export async function deleteStories(ids) {
  const res = await axios.post(`${BASE}/stories/delete`, { ids });
  return res.data;
}

// 生成故事大纲（概述+章节大纲）- 流式版本
export async function generateStoryOutlineStream(params, onProgress, taskId) {
  // 创建或获取 AbortController
  const controller = abortManager.createController(taskId);
  
  const response = await fetch(`${BASE}/story/generate-outline-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal: controller.signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成大纲失败');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (onProgress) {
              onProgress(data);
            }
          } catch (e) {
            console.error('解析大纲 SSE 数据失败:', e);
          }
        }
      }
    }

    // 处理剩余的 buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (onProgress) {
          onProgress(data);
        }
      } catch (e) {
        console.error('解析大纲 SSE 数据失败:', e);
      }
    }
  } catch (error) {
    // 检查是否是中止错误
    if (error.name === 'AbortError' || controller.signal.aborted) {
      console.log(`⏹️ 大纲生成被中止: ${taskId}`);
      throw new Error('大纲生成已停止');
    }
    throw error;
  } finally {
    // 清理 AbortController 资源
    abortManager.cleanup(taskId);
  }
}

// 生成故事大纲（概述+章节大纲）- 保留非流式版本
export async function generateStoryOutline(theme, wordCount) {
  try {
    const res = await axios.post(`${BASE}/story/generate-outline`, { theme, wordCount });
    return res.data;
  } catch (error) {
    console.error('API调用失败:', { 
      url: `${BASE}/story/generate-outline`,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message 
    });
    throw error;
  }
}

// 生成单章内容（流式）
export async function generateChapterStream(params, onProgress, taskId) {
  // 创建或获取 AbortController
  const controller = abortManager.createController(taskId);
  
  const response = await fetch(`${BASE}/story/generate-chapter-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal: controller.signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成章节失败');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (onProgress) {
              onProgress(data);
            }
          } catch (e) {
            console.error('解析章节 SSE 数据失败:', e);
          }
        }
      }
    }

    // 处理剩余的 buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (onProgress) {
          onProgress(data);
        }
      } catch (e) {
        console.error('解析章节 SSE 数据失败:', e);
      }
    }
  } catch (error) {
    // 检查是否是中止错误
    if (error.name === 'AbortError' || controller.signal.aborted) {
      console.log(`⏹️ 章节生成被中止: ${taskId}`);
      throw new Error('章节生成已停止');
    }
    throw error;
  } finally {
    // 清理 AbortController 资源
    abortManager.cleanup(taskId);
  }
}
