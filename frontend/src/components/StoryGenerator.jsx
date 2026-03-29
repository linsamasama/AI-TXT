import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input, Button, Select, message, Card, Space, Tag, Tooltip, Modal, Popconfirm, Progress, Pagination} from "antd";
import {
  DeleteOutlined, OrderedListOutlined,
  DownloadOutlined, LoadingOutlined, FolderOutlined,
  CopyOutlined, PlayCircleOutlined, EditOutlined, SaveOutlined, CloseOutlined,
} from "@ant-design/icons";
import JSZip from "jszip";
import {
  generateStoryStream,
  getModels,
  saveStory,
  getStories,
  deleteStories,
  updateStory,
} from "../api";
const { TextArea } = Input;

// 简单的 uuid 生成算法
function simpleUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

const basicInstructionTemplates = [
//   {
//     key: 'women',
//     label: '女频',
//     themes: "" ,
//     basicInstruction: `严格以第一人我（女性），写一个温情女频小说。
//  1. 直接写出详细正文,控制整体剧情进度，严格要求字数在20000字。
//  2. 不要断尾。`,
//   },
// {
//     key: 'women',
//     label: '女频',
//     themes: "" ,
//     basicInstruction: `严格以第三人称进行故事讲述，用白话文的口吻，写一部女频小说。
//  1. 禁止使用‘总而言之’、‘那一刻，他明白’、‘这不仅是...更是...’这类总结性陈词。
//  2. 直接写出详细正文,字数在$$number字。
//  3. 剧情连贯，不要断尾。`,
//   },
{
    key: 'women',
    label: '女频',
    themes: "" ,
    basicInstruction: `严格以第三人称进行故事讲述，用白话文的口吻，写一个温情女频小说。
 1. 直接写出详细正文,字数在$$number字。
 2. 剧情连贯，不要断尾。`,
  },
  {
    key: 'man',
    label: '男频',
    themes: "" ,
    basicInstruction: `严格以第一人我（男性），写一个$$number字的温情女频小说。
 1. 先列出剧情简介和总体大纲章节的概述。
 2. 接着输出每个章节的详细内容，不要断尾。
 3. 正文中的男主角叫季伯达，女主角叫柳如烟，男小三叫伊藤诚，男主新欢叫张曼玉`
  }
];


const maxConcurrency = 2; // 并发数
const storyType= localStorage.getItem('storyType') || "women"

const TARGET_WORD_COUNT_OPTIONS = [
  // { label: "100", value: 100 },
  { label: "2万字", value: 20000 },
  // { label: "5万字（老年故事）", value: 50000 },
];

const SAVED_STORIES_PAGE_SIZE = 10;

export default function StoryGenerator() {
  const [messageApi, contextHolder] = message.useMessage();
  const [instructions, setInstructions] = useState([{ id: simpleUuid(), ...basicInstructionTemplates.find(t=>t.key === (storyType || 'man')) }]);
  const [model, setModel] = useState();
  const [models, setModels] = useState([]);
  const [wordCount, setWordCount] = useState(20000);
  const [tasks, setTasks] = useState([]);
  const [savedStories, setSavedStories] = useState([]);
  const [storyCategory, setStoryCategory] = useState('全部');
  const [storyModalVisible, setStoryModalVisible] = useState(false);
  const [savedStoriesPage, setSavedStoriesPage] = useState(1);
  const contentRefs = useRef({});
  const [selectedInstructions, setSelectedInstructions] = useState(new Set());
  const contentPendingSaveRef = useRef([]);
  const [selectedSavedStoryIds, setSelectedSavedStoryIds] = useState(new Set());
  const [editingInstructionId, setEditingInstructionId] = useState(null);
  const savingTaskIds = useRef(new Set());
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingContent, setEditingContent] = useState({});
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [editingStoryContent, setEditingStoryContent] = useState('');
  const tasksRef = useRef([]);
  const runningCountRef = useRef(0);
  const activeTaskIdsRef = useRef(new Set());
  const batchTrackerRef = useRef(new Map());
  const [taskStats, setTaskStats] = useState({}); // 存储任务的生成统计信息
  
  // 章节数字检测
  const CHAPTER_NUMBER_PATTERNS = [
    /第([一二三四五六七八九十百千万\d]+)章/g,   // 中文数字或阿拉伯数字
    /Chapter\s*([0-9]+)/gi,                    // 英文Chapter+数字
    /\b([0-9]+)\b[、.:\s]/g,                    // 行首独立数字+常见标点或空格
  ];
  

  // 检测内容里出现了多少个“第X章”编号（不关注标题细节，只看编号触发）
  const detectChapters = (content) => {
    if (!content || !content.trim()) return 0;
    let chapters = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      for (const pattern of CHAPTER_NUMBER_PATTERNS) {
        let match;
        // 因为全局g，所以不能用test，需要exec配合while
        pattern.lastIndex = 0;
        while ((match = pattern.exec(trimmedLine)) !== null) {
          // 去重：同一行可能多次匹配，但只算一次
          if (!chapters.includes(match[0])) {
            chapters.push(match[0]);
            break; // 每行只计一次章节
          }
        }
      }
    }

    // 查找重复（正文开始往往标题会再次出现）
    const seen = new Set();
    let duplicateIndex = -1;
    for (let i = 0; i < chapters.length; i++) {
      const numStr = chapters[i];
      if (seen.has(numStr)) {
        duplicateIndex = i;
        break;
      }
      seen.add(numStr);
    }

    if (duplicateIndex !== -1) {
      // 从正文（重复出现后的部分）统计章节数
      const mainChapters = chapters.slice(duplicateIndex);
      return mainChapters;
    } else {
      // 没有重复，全部数字都算（大纲+正文）
      return chapters;
    }
  };

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const loadSavedStories = useCallback(async (category = '全部') => {
    try {
      const stories = await getStories(category === '全部' ? null : category);
      setSavedStories(stories);
      setSavedStoriesPage(1);
      // 初始化选择状态：不选择任何项目
      setSelectedSavedStoryIds(new Set());
    } catch (error) {
      console.error('加载已保存小说失败:', error);
    }
  }, []);

  const saveSingleStory = async (task) => {
    savingTaskIds.current.add(task.id);
    try {
      // 构建要保存的数据
      const storyData = {
        instruction: `主题：${task.theme}\n${task.basicInstruction}`,
        basicInstruction: task.basicInstruction,
        theme: task.theme,
        content: task.content,
        wordCount: task.content.length || 0,
        targetWordCount: wordCount
      };
      
      await saveStory(storyData);
     
      // 刷新已保存小说列表
      await loadSavedStories();
      
    } catch (error) {
      console.error('保存单个小说失败:', error);
      messageApi.error(`保存《${task.theme}》失败，请重试`);
    } finally {
      // 清除保存状态
      savingTaskIds.current.delete(task.id);
    }
  };

  const batchSaveContents = async (tasks) => {
    const promises = tasks.map(task => {
      // 构建要保存的数据
      const storyData = {
        basicInstruction: task.basicInstruction,
        theme: task.theme,
        type: instructions.storyType,
        content: task.content,
        wordCount: task.content.length || 0,
        targetWordCount: wordCount
      };
      
      return saveStory(storyData);
    });
    
    try {
      await Promise.all(promises);
      // 刷新已保存小说列表
      await loadSavedStories(storyCategory);
      
      // 显示成功提示（统一提示，不再区分章节模式）
      messageApi.success(`成功保存 ${tasks.length} 个小说到"已保存小说"`);
      
    } catch (error) {
      console.error('批量保存正文失败:', error);
      messageApi.error('保存到"已保存小说"失败，请重试');
    }
  };

  const loadModels = useCallback(async () => {
    try {
      const modelList = await getModels();
      setModels(modelList);
      if (modelList.length > 0) {
        setModel(prevModel => prevModel || modelList[0].id || modelList[0]);
      }
    } catch (error) {
      messageApi.error("加载模型列表失败");
    }
  }, [messageApi]);

  useEffect(() => {
    loadModels();
    loadSavedStories();

    const currentSavingTaskIds = savingTaskIds.current;
    return () => {
      // 清理保存状态
      currentSavingTaskIds.clear();
    };
  }, [loadModels, loadSavedStories]);

  const handleUpdateInstruction = (id, field, value, key) => {
    if(field==='basicInstruction'){
      const thisInstructions = basicInstructionTemplates.find(t=>t.key === key) 
      setInstructions(prev => prev.map(item => item.id === id ? { ...item, ...thisInstructions } : item));
    }else{
      setInstructions(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    }
  };
  const toggleInstructionSelection = (instructionId) => {
    setSelectedInstructions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instructionId)) {
        newSet.delete(instructionId);
      } else {
        newSet.add(instructionId);
      }
      return newSet;
    });
  };

  const toggleAllInstructions = (selectAll) => {
    if (selectAll) {
      const allInstructionIds = tasks
        .filter(t => t.status === 'completed' && t.content && t.content.trim())
        .map(t => t.id);
      setSelectedInstructions(new Set(allInstructionIds));
    } else {
      setSelectedInstructions(new Set());
    }
  };

  // 编辑功能处理函数
  const handleStartEdit = (taskId) => {
    setEditingTaskId(taskId);
    // 保存当前编辑内容
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setEditingContent(prev => ({
        ...prev,
        [taskId]: task.content || ''
      }));
    }
  };

  const handleContentEdit = (taskId, content) => {
    setEditingContent(prev => ({
      ...prev,
      [taskId]: content
    }));
  };

  const handleCancelEdit = (taskId) => {
    // 清理编辑状态，恢复原始内容
    setEditingTaskId(null);
    setEditingContent(prev => {
      const newContent = { ...prev };
      delete newContent[taskId];
      return newContent;
    });
  };

  // 已保存小说编辑功能处理函数
  const handleStartStoryEdit = (story) => {
    setEditingStoryId(story.id);
    setEditingStoryContent(story.content || '');
  };

  const handleSaveStoryEdit = async () => {
    if (!editingStoryId || !editingStoryContent.trim()) {
      messageApi.error('保存失败：内容为空');
      return;
    }

    try {
      const story = savedStories.find(s => s.id === editingStoryId);
      if (!story) {
        messageApi.error('保存失败：找不到对应小说');
        return;
      }

      // 更新数据库
      const updateData = {
        id: editingStoryId,
        instruction: story.instruction,
        basicInstruction: story.basicInstruction,
        theme: story.theme,
        content: editingStoryContent,
        wordCount: editingStoryContent.length,
        targetWordCount: story.targetWordCount
      };
      await updateStory(updateData);
      
      // 更新本地状态
      setSavedStories(prev => prev.map(s => 
        s.id === editingStoryId ? { ...s, content: editingStoryContent, wordCount: editingStoryContent.length } : s
      ));
      
      // 清理编辑状态
      setEditingStoryId(null);
      setEditingStoryContent('');
      
      messageApi.success('小说编辑内容保存成功');
    } catch (error) {
      console.error('保存小说编辑内容失败:', error);
      messageApi.error('保存失败，请重试');
    }
  };

  const handleCancelStoryEdit = () => {
    setEditingStoryId(null);
    setEditingStoryContent('');
  };

  const handleBatchGenerate = async () => {
    const validInstructions = instructions.filter(item =>
      item.basicInstruction.trim() && (item.themes.trim() || item.themes.trim())
    );
    if (validInstructions.length === 0) {
      messageApi.error("请至少输入一个有效的生成指令和主题");
      return;
    }
    if (!model) {
      messageApi.error("请选择AI模型");
      return;
    }
    contentPendingSaveRef.current = [];

    const multiThemeTasks = [];
    validInstructions.forEach(item => {
      const themes = item.themes
        ? item.themes.split('\n').filter(t => t.trim())
        : (item.theme ? [item.theme.trim()] : []);

      themes.forEach(theme => {
        multiThemeTasks.push({
          ...item,
          theme: theme.trim(),
          originalInstructionId: item.id,
        });
      });
    });

    console.log(`生成 ${multiThemeTasks.length} 个任务（来自 ${validInstructions.length} 个指令）`);
    startBatchGenerate(multiThemeTasks);
  };

  const startBatchGenerate = (validInstructions) => {
    const batchId = `batch_${Date.now()}_${simpleUuid()}`;
    const batchStartTime = Date.now();
    const newTasks = validInstructions.map((item, index) => ({
      id: `${item.originalInstructionId || item.id}_${item.theme.replace(/\s/g, '_')}_${batchStartTime}_${index}`,
      batchId,
      type: item.key,
      instructionId: item.id,
      basicInstruction: item.basicInstruction.trim(),
      theme: item.theme.trim(),
      status: 'pending',
      content: '',
      wordCount: 0,
      statusMessage: '等待开始...',
      startTime: batchStartTime,
      regenerationAttempt: 0,
    }));

    if (newTasks.length === 0) {
      return;
    }

    batchTrackerRef.current.set(batchId, {
      total: newTasks.length,
      finished: 0,
      completedTasks: [],
    });

    setTasks(prev => {
      const updatedTasks = [...prev, ...newTasks];
      tasksRef.current = updatedTasks;
      return updatedTasks;
    });

    setTimeout(() => {
      schedulePendingTasks();
    }, 0);
  };

  const markBatchTaskFinished = (finishedTask) => {
    if (!finishedTask?.batchId) {
      return;
    }

    const tracker = batchTrackerRef.current.get(finishedTask.batchId);
    if (!tracker) {
      return;
    }

    tracker.finished += 1;
    if (finishedTask.status === 'completed' && finishedTask.content && finishedTask.content.trim()) {
      tracker.completedTasks.push(finishedTask);
    }

    if (tracker.finished >= tracker.total) {
      batchTrackerRef.current.delete(finishedTask.batchId);
      if (tracker.completedTasks.length > 0) {
        batchSaveContents(tracker.completedTasks.slice());
      }
    }
  };

  const startTaskExecution = (task, existingContent = '') => {
    if (!task || activeTaskIdsRef.current.has(task.id) || runningCountRef.current >= maxConcurrency) {
      return false;
    }

    runningCountRef.current += 1;
    activeTaskIdsRef.current.add(task.id);

    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, status: 'generating', statusMessage: '正在连接AI服务...' }
        : t
    ));

    generateTask(task.id, task.basicInstruction, task.theme, existingContent, (finishedTask) => {
      markBatchTaskFinished(finishedTask);
    }).finally(() => {
      activeTaskIdsRef.current.delete(task.id);
      runningCountRef.current = Math.max(0, runningCountRef.current - 1);
      schedulePendingTasks();
    });

    return true;
  };

  const schedulePendingTasks = () => {
    const currentTasks = tasksRef.current || [];

    while (runningCountRef.current < maxConcurrency) {
      const nextTask = currentTasks.find(task => 
        task.status === 'pending' && !activeTaskIdsRef.current.has(task.id)
      );

      if (!nextTask) {
        break;
      }

      const started = startTaskExecution(nextTask);
      if (!started) {
        break;
      }
    }
  };

  const generateTask = async (taskId, basicInstruction, theme, existingContent = '', onFinal) => {
    const fullInstruction = `以 "${theme}" 作为主题，\n${basicInstruction.replace('$$number', wordCount)}`;
    const startTime = Date.now();

    try {
      await generateStoryStream(
        {
          instruction: fullInstruction,
          model,
          wordCount,
          existingContent,
        },
        (data) => {
          if (data.type === 'content') {
            setTasks(prev => prev.map(task => {
              if (task.id !== taskId) return task;
              const currentWordCount = data.wordCount || 0;
              const progress = Math.min(100, Math.round((currentWordCount / wordCount) * 100));

              updateTaskStats(taskId, {
                currentWordCount,
                progress,
              });

              return {
                ...task,
                status: 'generating',
                content: data.fullContent,
                wordCount: currentWordCount,
                statusMessage: `正在生成中... ${currentWordCount}/${wordCount} 字 (${progress}%)`,
              };
            }));
          } else {
            setTasks(prev => prev.map(task => {
              if (task.id !== taskId) return task;

              if (data.type === 'start') {
                updateTaskStats(taskId, { startTime, status: 'starting' });
                return {
                  ...task,
                  status: 'generating',
                  statusMessage: data.message || "开始生成正文...",
                };
              }

              if (data.type === 'done') {
                const finalWordCount = data.wordCount || 0;
                const completedTask = {
                  ...task,
                  status: 'completed',
                  content: data.content || '',
                  wordCount: finalWordCount,
                  statusMessage: '生成完成！',
                };

                updateTaskStats(taskId, {
                  status: 'completed',
                  completedAt: Date.now(),
                });

                saveSingleStory(completedTask);
                if (onFinal) onFinal(completedTask);
                return completedTask;
              }

              if (data.type === 'error') {
                updateTaskStats(taskId, {
                  status: 'error',
                  error: data.error,
                  completedAt: Date.now(),
                });

                const errorTask = {
                  ...task,
                  status: 'error',
                  statusMessage: `生成失败：${data.error || "未知错误"}`,
                  error: data.error,
                };

                if (onFinal) onFinal(errorTask);
                return errorTask;
              }

              return task;
            }));
          }
        },
        taskId
      );
    } catch (error) {
      updateTaskStats(taskId, {
        status: 'error',
        error: error.message,
        completedAt: Date.now(),
      });

      let finalErrorTask = null;
      setTasks(prev => prev.map(task => {
        if (task.id !== taskId) {
          return task;
        }

        finalErrorTask = {
          ...task,
          status: 'error',
          statusMessage: `生成失败：${error.message || "网络错误"}`,
          error: error.message,
        };
        return finalErrorTask;
      }));

      if (onFinal && finalErrorTask) onFinal(finalErrorTask);
    }
  };

  const handleBatchDownload = async () => {
    const selectedIds = Array.from(selectedInstructions);
    const downloadTasks = tasks.filter(
      t => t.status === 'completed' && selectedIds.includes(t.id) && t.content && t.content.trim()
    );
    if (downloadTasks.length === 0) {
      messageApi.warning("暂无可批量下载的已完成正文，请先选择");
      return;
    }

    try {
      if (downloadTasks.length === 1) {
        // 单个小说，直接下载txt
        const task = downloadTasks[0];
        const safeTheme = (task.theme || '小说').replace(/[\\/:*?"<>|]/g, '_');
        let content = `主题：${task.theme}\n\n`;
        content += task.content || '';
        
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeTheme}.txt`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
        
        messageApi.success(`已下载：${safeTheme}.txt`);
      } else {
        // 多个小说，创建ZIP压缩包
        const zip = new JSZip();
        downloadTasks.forEach((task, index) => {
          const safeTheme = (task.theme || `小说_${index + 1}`).replace(/[\\/:*?"<>|]/g, '_');
          let content = `主题：${task.theme}\n\n`;
          content += task.content || '';
          zip.file(`${safeTheme}.txt`, content);
        });

        // 生成压缩包
        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        // 下载压缩包
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `小说合集_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
        
        messageApi.success(`已下载包含 ${downloadTasks.length} 个小说的压缩包`);
      }
    } catch (error) {
      console.error('下载失败:', error);
      messageApi.error('下载失败，请重试');
    }
  };

  // 批量下载已保存的小说（支持自定义选择）
  const handleBatchDownloadStories = async () => {
    // 获取选中的小说，如果没有选中任何小说则提示
    const selectedIds = Array.from(selectedSavedStoryIds);
    let storiesToDownload;
    
    if (selectedIds.length > 0) {
      // 下载选中的小说
      storiesToDownload = savedStories.filter(story => 
        selectedIds.includes(story.id) && story.content && story.content.trim()
      );
      if (storiesToDownload.length === 0) {
        messageApi.warning('选中的小说没有可下载的内容');
        return;
      }
    } else {
      // 如果没有选中任何小说，提示用户先选择
      messageApi.warning('请先选择要下载的小说');
      return;
    }
    
    try {
      // 创建ZIP压缩包
      const zip = new JSZip();
      
      // 添加每个小说文件到压缩包
      storiesToDownload.forEach((story, index) => {
        const safeTheme = (story.theme || `小说_${index + 1}`).replace(/[\\/:*?"<>|]/g, '_');
        let content = `主题：${story.theme}\n\n`;
        content += story.content || '';
        zip.file(`${safeTheme}.txt`, content);
      });

      // 生成压缩包
      const zipBlob = await zip.generateAsync({ type: "blob" });
      
      // 下载压缩包
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `已选小说合集_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      
      messageApi.success(`已下载包含 ${storiesToDownload.length} 个小说的压缩包`);
    } catch (error) {
      console.error('创建压缩包失败:', error);
      messageApi.error('创建压缩包失败，请重试');
    }
  };

  // 继续生成
  const continueGenerate = (task) =>{
    setTimeout(() => {
      const existingCompleteStoryIndex = savedStories.findIndex(s => 
        s.theme === task.theme
      );
      generateTask(task.id, task.basicInstruction, task.theme, savedStories[existingCompleteStoryIndex].content, () => {
        batchSaveContents(contentPendingSaveRef.current.slice());
      });
    }, 0);
  }

  // 保存编辑
  const savedStoriesFromUnComplete = async(task)=>{
   
    const thisEditTaskContent = editingContent[task.id];
    const existingCompleteStoryIndex = savedStories.findIndex(s => 
      s.theme === task.theme
    );
    // 更新数据库
    const updateData = {
      ...savedStories[existingCompleteStoryIndex],
      content: thisEditTaskContent,
    };
    await updateStory(updateData);
    // 更新本地状态
    setSavedStories(prev => prev.map(s => 
      s.theme === task.theme ? { ...s, content: thisEditTaskContent } : s
    ));
    setTasks(prev => prev.map(s => 
      s.theme === task.theme ? { ...s, content: thisEditTaskContent } : s
    ))
    // 清理编辑状态
    setEditingStoryId(null);
    setEditingStoryContent('');
    setEditingTaskId(null);
    messageApi.success('小说编辑内容保存成功');
  }

  const handleCopyTheme = (theme) => {
    navigator.clipboard.writeText(theme).then(() => {
      messageApi.success('主题已复制到剪贴板');
    }).catch(() => {
      messageApi.error('复制失败');
    });
  };

  const handleOpenSavedStories = async () => {
    setStoryModalVisible(true);
    await loadSavedStories(storyCategory);
  };

  const handleCategoryChange = async (category) => {
    setStoryCategory(category);
    await loadSavedStories(category);
  };

  // 已保存小说选择功能相关函数
  const toggleSavedStorySelection = (storyId) => {
    setSelectedSavedStoryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(storyId)) {
        newSet.delete(storyId);
      } else {
        newSet.add(storyId);
      }
      return newSet;
    });
  };

  const toggleAllSavedStories = (selectAll) => {
    if (selectAll) {
      // 全选：选择所有有内容的小说
      const allStoryIds = savedStories
        .filter(story => story.content && story.content.trim())
        .map(story => story.id);
      setSelectedSavedStoryIds(new Set(allStoryIds));
    } else {
      // 取消全选
      setSelectedSavedStoryIds(new Set());
    }
  };

  const isAllSavedStoriesSelected = () => {
    const availableStories = savedStories.filter(story => story.content && story.content.trim());
    if (availableStories.length === 0) return false;
    return availableStories.every(story => selectedSavedStoryIds.has(story.id));
  };

  const isSomeSavedStoriesSelected = () => {
    return selectedSavedStoryIds.size > 0;
  };

  const paginatedSavedStories = savedStories.slice(
    (savedStoriesPage - 1) * SAVED_STORIES_PAGE_SIZE,
    savedStoriesPage * SAVED_STORIES_PAGE_SIZE
  );

  // 更新任务统计信息
  const updateTaskStats = useCallback((taskId, stats) => {
    setTaskStats(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        ...stats,
        lastUpdated: Date.now()
      }
    }));
  }, []);

  return (
    <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      {contextHolder}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* 左：生成配置 */}
        <div style={{ width: "40%", display: "flex", flexDirection: "column", height: "100%" }}>
          <Card
            title="生成配置"
            style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}
            bodyStyle={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="large">
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                    AI 模型：
                  </label>
                  <Select
                    value={model}
                    onChange={setModel}
                    style={{ width: "100%" }}
                    placeholder="请选择模型"
                    options={models.map((m) => ({
                      label: m.label || m.id || m,
                      value: m.id || m,
                      title: m.description || m.label || m.id || m
                    }))}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                    目标字数：
                  </label>
                  <Select
                    value={wordCount}
                    onChange={setWordCount}
                    style={{ width: "100%" }}
                    options={TARGET_WORD_COUNT_OPTIONS}
                  />
                </div>
              </div>
              <h3 style={{ margin: 0 }}>指令列表</h3>
            </Space>

            <div style={{  overflowY: "auto", marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {instructions.map((item, index) => (
                  <Card key={item.id} size="small" style={{ backgroundColor: "#fafafa" }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                        小说标题、概述：<span style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        marginBottom: '8px',
                        padding: '4px 8px',
                        backgroundColor: '#f0f8ff',
                        borderRadius: '4px'
                      }}>
                        💡 每行输入一个，越详细越好，每个标题生成一个小说
                      </span>
                      </label>
                      
                      <TextArea
                        value={item.themes || ''}
                        onChange={(e) => handleUpdateInstruction(item.id, 'themes', e.target.value)}
                        placeholder="例如：離婚時我咬牙帶走龍鳳胎，12 年後前夫成地產大亨，校門口看到孩子獎狀，他當場捐了 10 棟教學樓！"
                        rows={8}
                        style={{ resize: 'vertical' }}
                      />
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <label style={{ fontWeight: 500 }}>
                          基本指令：
                        </label>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => setEditingInstructionId(editingInstructionId === item.id ? null : item.id)}
                        >
                          {editingInstructionId === item.id ? '完成编辑' : '编辑指令'}
                        </Button>
                      </div>
                      {editingInstructionId === item.id ? (
                        <TextArea
                          value={item.basicInstruction}
                          onChange={e => handleUpdateInstruction(item.id, 'basicInstruction', e.target.value)}
                          autoSize={{ minRows: 4, maxRows: 10 }}
                          placeholder="请输入指令内容"
                          style={{
                            marginTop: 6,
                            fontSize: '14px',
                            borderRadius: '6px',
                            lineHeight: '1.5'
                          }}
                        />
                      ) : (
                        <div 
                          style={{ 
                            padding: '8px 12px', 
                            border: '1px solid #d9d9d9', 
                            borderRadius: '6px',
                            backgroundColor: '#fafafa',
                            minHeight: '64px',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {item.basicInstruction.replace('$$number', wordCount)}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </Space>
            </div>
            <div style={{ flexShrink: 0 }}>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                 <div style={{ display: "flex", gap: 8 }}>
                   <Button
                     type="primary"
                     onClick={handleBatchGenerate}
                     block
                     size="large"
                     style={{
                       height: 40,
                       borderRadius: 8,
                       fontWeight: 500,
                       boxShadow: '0 2px 0 rgba(0, 0, 0, 0.045)',
                     }}
                   >
                    📝 开始生成
                   </Button>
                   <Button
                     icon={<FolderOutlined />}
                     block
                     onClick={handleOpenSavedStories}
                     size="large"
                     style={{
                       height: 40,
                       borderRadius: 8,
                       fontWeight: 500
                     }}
                   >
                     已完成
                   </Button>
                 </div>
              </Space>
            </div>
          </Card>
        </div>

        {/* 右：正文生成 */}
        <div style={{ width: "60%", display: "flex", flexDirection: "column" }}>
          <Card
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex" }}>
                  <OrderedListOutlined style={{ marginRight: 6 }} />
                  <span>小说正文 & 章节内容</span>
                  <span style={{marginLeft: 10}}>( 13000 ≈ 42 分钟 )</span>
                </div>
                {tasks.filter(t => t.status === 'completed' && t.content && t.content.trim()).length > 0 && (
                  <Space size="small">
                    <Button
                      size="small"
                      onClick={() => toggleAllInstructions(selectedInstructions.size > 0 ? false : true)}
                    >
                      {selectedInstructions.size > 0 ? '取消选择' : '全选'}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={selectedInstructions.size === 0}
                      onClick={() => handleBatchDownload()}
                    >
                      下载
                    </Button>
                  </Space>
                )}
              </div>
            }
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
            bodyStyle={{ flex: 1, overflow: "auto", padding: 16 }}
          >
            {tasks.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                暂无生成任务，请在上方配置并开始生成
              </div>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {tasks.map((task) => (
                  <Card
                    key={task.id}
                    size="small"
                    style={{
                      borderLeft: `4px solid ${
                        task.status === 'completed' ? '#52c41a' :
                        task.status === 'generating' ? '#1890ff' :
                        task.status === 'regenerating' ? '#ff7a45' :
                        task.status === 'error' ? '#ff4d4f' :
                        task.status === 'interrupted' ? '#fa8c16' : '#d9d9d9'
                      }`,
                      boxShadow: task.status === 'generating' || task.status === 'regenerating'
                        ? '0 2px 8px rgba(24, 144, 255, 0.2)' 
                        : '0 1px 2px rgba(0, 0, 0, 0.03)',
                      transition: 'all 0.3s ease'
                    }}
                    title={
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                            {task.status === 'completed' && task.content && task.content.trim() && (
                              <input
                                type="checkbox"
                                id={task.id}
                                checked={selectedInstructions.has(task.id)}
                                onChange={() => toggleInstructionSelection(task.id)}
                                style={{ marginRight: 8 }}
                              />
                            )}
                            {task.wordCount ? <span style={{color: "rgb(24, 144, 255)", width: 40 }}>{task.wordCount}</span> : null}
                            <span style={{ fontWeight: 500 }}>
                              {task.theme?.substring(0, 36)}
                              {task.theme?.length > 36 && "..."}
                            </span>
                          </div>
                        </div>
                      </div>
                    }
                      extra={
                       <Space>
                         {/* 状态标签 */}
                         {task.status === 'completed' && (
                           <Tag color="success">已完成</Tag>
                         )}
                         {task.status === 'generating' && (
                           <Tag color="processing" icon={<LoadingOutlined />}>
                             生成中 {taskStats[task.id]?.progress?.toFixed(1) || 0}%
                           </Tag>
                         )}
                         {task.status === 'error' && (
                           <Tooltip title={task.error || '未知错误'}>
                             <Tag color="error">生成失败</Tag>
                           </Tooltip>
                         )}
                         
                         {/* 生成中的控制按钮 */}
                         
                         {/* 传统模式：已完成或者生成失败 */}
                         {task.status !=='generating' && editingTaskId !== task.id ? (
                           <>
                           {/* 错误重试按钮 */}
                           {task.status === 'error' && (
                             <Tooltip title="重试生成">
                               <Button
                                 type="link"
                                 size="small"
                                 onClick={() => {
                                   setTasks(prev =>
                                     prev.map(t =>
                                       t.id === task.id
                                         ? {
                                             ...t,
                                             status: 'pending',
                                             content: '',
                                             wordCount: 0,
                                             statusMessage: '等待重试生成...',
                                             regenerationAttempt: (t.regenerationAttempt || 0) + 1,
                                             error: null
                                           }
                                         : t
                                     )
                                   );
                                 updateTaskStats(task.id, { status: 'retrying' });
                                   
                                  setTimeout(() => {
                                     generateTask(task.id, task.basicInstruction, task.theme, '', () => {
                                       batchSaveContents(contentPendingSaveRef.current.slice());
                                     });
                                   }, 0);
                                 }}
                                 style={{ color: '#ff4d4f' }}
                               >
                                 重试
                               </Button>
                             </Tooltip>
                           )}
                           
                           {/* 重新生成按钮 */}
                           <Tooltip title="重新生成正文">
                              <Button
                               type="link"
                               size="small"
                               onClick={() => {
                                 setTasks(prev =>
                                   prev.map(t =>
                                     t.id === task.id
                                       ? {
                                           ...t,
                                           status: 'pending',
                                           content: '',
                                           wordCount: 0,
                                           statusMessage: '等待重新生成...',
                                           regenerationAttempt: 0,
                                           error: null
                                         }
                                       : t
                                   )
                                 );
                                setTimeout(() => {
                                  generateTask(task.id, task.basicInstruction, task.theme, '', () => {
                                    batchSaveContents(contentPendingSaveRef.current.slice());
                                  });
                                }, 0);
                               }}
                               style={{ color: '#ff4d4f' }}
                             >
                               重新生成
                             </Button>
                           </Tooltip>
                             <Button
                               type="link"
                               size="small"
                               onClick={() => continueGenerate(task)}
                               style={{ color: '#fa8c16' }}
                             >
                               继续生成
                             </Button> 
                           </>
                         ): null}
                          { editingTaskId === task.id ? (
                            <Tooltip title="保存该小说">
                              <Button
                                type="link"
                                size="small"
                                icon={<PlayCircleOutlined />}
                                onClick={() => savedStoriesFromUnComplete(task)}
                                style={{ color: '#fa8c16' }}
                              >
                                保存修改
                              </Button>
                            </Tooltip>
                          ): null}

                          {/* 编辑按钮：已完成且未在编辑中时显示 */}
                          {task.status !=='generating' && editingTaskId !== task.id ? (
                            <Tooltip title="编辑小说内容">
                              <Button
                                type="link"
                                size="small"
                                onClick={() => handleStartEdit(task.id)}
                                style={{ color: '#1890ff' }}
                              >
                                编辑
                              </Button>
                            </Tooltip>
                          ): null}

                          {/* 编辑模式的保存和取消按钮 */}
                          {editingTaskId === task.id ? (
                             <Button
                               type="link"
                               size="small"
                               icon={<CloseOutlined />}
                               onClick={() => handleCancelEdit(task.id)}
                               style={{ color: '#ff4d4f' }}
                             >
                               取消编辑
                             </Button>
                          ): null}
                       </Space>
                     }
                   >
                     {editingTaskId === task.id ? (
                       <TextArea
                         value={editingContent[task.id] || task.content || ''}
                         onChange={(e) => handleContentEdit(task.id, e.target.value)}
                         autoSize={{ minRows: 3, maxRows: 15 }}
                         style={{
                           whiteSpace: "pre-wrap",
                           wordBreak: "break-word",
                           lineHeight: 1.3,
                           fontSize: 13,
                           color: "#333",
                           margin: 0,
                           paddingRight: 4,
                           border: "1px solid #1890ff",
                           borderRadius: "4px"
                         }}
                         placeholder="在此编辑小说内容..."
                       />
                     ) : (
                       <div>
                         {/* 进度条区域 */}
                         {task.status === 'generating' && taskStats[task.id] && (
                           <div style={{ marginBottom: 12 }}>
                             <Progress 
                               percent={taskStats[task.id].progress || 0}
                               status="active"
                               format={() => `${task.wordCount} 字 `}
                               strokeColor={{
                                 '0%': '#108ee9',
                                 '100%': '#87d068',
                               }}
                             />
                           </div>
                         )}
     
                         {/* 内容显示区域 */}
                         <div 
                           ref={el => contentRefs.current[task.id] = el}
                           style={{
                             height: task.status === 'generating' ? '300px' : 'auto',
                             maxHeight: task.status === 'pending' ? '160px' : '400px',
                             overflowY: 'auto',
                             border: '1px solid #f0f0f0',
                             borderRadius: '6px',
                             padding: '12px',
                             backgroundColor: '#fafafa',
                             fontFamily: '"Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                             fontSize: '14px',
                             lineHeight: '1.6',
                             whiteSpace: 'pre-wrap',
                             wordBreak: 'break-word',
                             color: '#333',
                             position: 'relative'
                           }}
                         >
                          {/* 显示内容：直接显示真实流式内容 */}
                          {task.status === 'error' ? (
                            <div style={{ color: '#ff4d4f', textAlign: 'center', padding: '20px' }}>
                              <div style={{ marginBottom: '8px' }}>❌ 生成失败</div>
                               <div style={{ fontSize: '12px', color: '#666' }}>
                                 {task.error || '未知错误，请重试'}
                               </div>
                               {task.regenerationAttempt > 0 && (
                                 <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                   重试次数: {task.regenerationAttempt}
                                 </div>
                               )}
                             </div>
                         ) : task.content || (
                            <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                              {task.status === 'generating'
                                ? '正在生成内容...'
                                : task.status === 'pending'
                                  ? '等待生成中......'
                                  : '暂无内容'}
                            </div>
                          )}
                         </div>
                       </div>
                     )}
                   </Card>
                ))}
              </Space>
            )}
          </Card>
        </div>
      </div>

      {/* 已保存小说弹窗 */}
      <Modal
        title="已保存的小说"
        open={storyModalVisible}
        onCancel={() => setStoryModalVisible(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleBatchDownloadStories}
                disabled={!isSomeSavedStoriesSelected()}
              >
                下载
              </Button>
              <Popconfirm
                title="请确认是否删除已选择的小说"
                onConfirm={async () => {
                  await deleteStories(Array.from(selectedSavedStoryIds));
                  await loadSavedStories(storyCategory);
                }}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="link"
                  danger
                  size="small"
                  disabled={!isSomeSavedStoriesSelected()}
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Popconfirm>
              
            </Space>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#666', fontSize: '12px' }}>
                已选择 {selectedSavedStoryIds.size} / {savedStories.filter(s => s.content && s.content.trim()).length} 个可下载
              </span>
              <Button
                size="small"
                onClick={() => toggleAllSavedStories(!isAllSavedStoriesSelected())}
                disabled={savedStories.filter(s => s.content && s.content.trim()).length === 0}
              >
                {isAllSavedStoriesSelected() ? '取消全选' : '全选'}
              </Button>
            </div>
          </div>
        }
        width={1600}
        style={{ top: 20 }}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <span>分类筛选：</span>
            <Select
              value={storyCategory}
              onChange={handleCategoryChange}
              style={{ width: 200 }}
              options={[
                { label: '全部', value: '全部' },
                ...TARGET_WORD_COUNT_OPTIONS.map(opt => ({
                  label: opt.label,
                  value: opt.label
                }))
              ]}
            />
            <span style={{ color: '#666' }}>
              共 {savedStories.length} 条
            </span>
          </Space>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {savedStories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              暂无已保存的小说
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {paginatedSavedStories.map((story) => {
                return (
                  <Card
                    key={story.id}
                    style={{
                      borderLeft: '4px solid #52c41a',
                      boxShadow: '0 2px 8px rgba(24, 144, 255, 0.2)' ,
                      transition: 'all 0.3s ease'
                    }}
                    size="small"
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {story.content && story.content.trim() && (
                            <input
                              type="checkbox"
                              checked={selectedSavedStoryIds.has(story.id)}
                              onChange={() => toggleSavedStorySelection(story.id)}
                              style={{ marginRight: 8, cursor: 'pointer' }}
                            />
                          )}
                          <span style={{ fontWeight: 500 }}>
                            {story.theme.substring(0, 40)}
                            {story.theme.length > 30 && '...'}
                          </span>
                        </div>
                        <div>
                          <Tag color="red">{story.wordCount || 0} 字</Tag>
                        </div>
                      </div>
                    }
                    extra={
                      <Space >
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyTheme(story.theme)}
                          title="复制主题"
                        >
                          复制主题
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            if(tasks.find(task=>task.id === story.id)){
                              messageApi.error('已回炉，请勿重复操作')
                              return
                            }
                            setTasks(prev=>[{...story, status: 'regenerating'}, ...prev])
                            messageApi.success('回炉成功，请在正文列表查看')
                          }}
                        >
                          回炉
                        </Button>
                        {editingStoryId !== story.id ? (
                          <Button
                            type="link"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => handleStartStoryEdit(story)}
                            title="编辑小说"
                            style={{ color: '#1890ff' }}
                          >
                            编辑
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="link"
                              size="small"
                              icon={<SaveOutlined />}
                              onClick={() => handleSaveStoryEdit()}
                              title="保存编辑"
                              style={{ color: '#52c41a' }}
                            >
                              保存
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              icon={<CloseOutlined />}
                              onClick={() => handleCancelStoryEdit()}
                              title="取消编辑"
                              style={{ color: '#ff4d4f' }}
                            >
                              取消
                            </Button>
                          </>
                        )}
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => {
                            if (!story.content || !story.content.trim()) {
                              messageApi.error('该小说没有可下载的内容');
                              return;
                            }
                            const safeTheme = (story.theme || '小说').replace(/[\\/:*?"<>|]/g, '_');
                            let content = `主题：${story.theme}\n\n` + story.content;
                            const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${safeTheme}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }, 0);
                          }}
                          title="下载小说"
                        >
                          下载
                        </Button>
                        <Popconfirm
                          title="请确认是否删除该的小说"
                          onConfirm={async () => {
                            await deleteStories([story.id]);
                            await loadSavedStories(storyCategory);
                          }}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button
                            type="link"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    }
                  >
                    {editingStoryId === story.id ? (
                      // 编辑模式
                      <div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                          编辑模式 - 一起{detectChapters(editingStoryContent).length}章
                        </div>
                        <TextArea
                          value={editingStoryContent}
                          onChange={(e) => setEditingStoryContent(e.target.value)}
                          autoSize={{ minRows: 5, maxRows: 20 }}
                          style={{
                            fontSize: 12,
                            lineHeight: 1.3,
                            border: "1px solid #1890ff",
                            borderRadius: "4px"
                          }}
                          placeholder="在此编辑小说内容..."
                        />
                        <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                          字数：{editingStoryContent.length} | 创建时间：{new Date(story.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    ) : (
                      // 查看模式
                      story.content && (
                        <div>
                          <div>
                            <span style={{ fontSize: 12}}>
                              {story.content.substring(0, 120)}
                              {story.content.length > 120 && '......【中间内容省略】......'}
                              {story.content.slice(-50)}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, float: 'right', position: 'relative', top: -8 }}>
                            {new Date(story.createdAt).toLocaleString('zh-CN')}
                          </div>
                        </div>
                      )
                    )}
                  </Card>
                );
              })}
            </Space>
          )}
        </div>
        {savedStories.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Pagination
              current={savedStoriesPage}
              pageSize={SAVED_STORIES_PAGE_SIZE}
              total={savedStories.length}
              onChange={setSavedStoriesPage}
              showSizeChanger={false}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
