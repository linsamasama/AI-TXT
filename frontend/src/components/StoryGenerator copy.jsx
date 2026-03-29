import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { Input, Button, Select, message, Card, Spin, Space, Typography, Progress, Tag, Tooltip, Modal, Tabs } from "antd";
import { PlusOutlined, DeleteOutlined, OrderedListOutlined, DownloadOutlined, ReloadOutlined, ArrowRightOutlined, FileTextOutlined, SaveOutlined, FolderOutlined } from "@ant-design/icons";
import { generateStoryStream, getModels, saveStory, getStories, deleteStories, updateStory } from "../api";

const { TextArea } = Input;
const { Paragraph } = Typography;

const baseInstructions = {
  basicInstruction: `以第一人我的视角，写一个温情小说。
1. 先列出剧情简介和总体大纲章节。
2. 大纲章节分为10个章节，列出每个章节的标题和内容的简单概述。
3. 只需要列出大纲。
注意：所有内容，包括简介和大纲，要严格要求使用第一人称我来抒写。`,
  theme: ""
};

// 目标字数配置选项
const TARGET_WORD_COUNT_OPTIONS = [
  { label: "1000", value: 1000 },
  { label: "2万字（柳如烟）", value: 20000 },
  { label: "5万字（老年故事）", value: 40000 },
];

// 优化：全文内容输出采用memo组件避免不必要的重渲染
const FullContentBox = memo(function FullContentBox({ task, fullContentRef }) {
  // 只在内容增加时滚动，不会因为其他state变更重渲染
  useEffect(() => {
    if (!fullContentRef.current) return;
    fullContentRef.current.scrollTop = fullContentRef.current.scrollHeight;
  }, [task.content]);
  return (
    <div
      ref={el => { if (el) fullContentRef.current = el; }}
      style={{
        maxHeight: 280,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#f8f8fa",
        borderRadius: 6,
        padding: 7,
      }}
    >
      <Paragraph
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.7,
          fontSize: 14,
          color: "#272b30",
          margin: 0
        }}
      >
        {task.content}
      </Paragraph>
     
    </div>
  );
});

export default function StoryGenerator() {
  const [instructions, setInstructions] = useState([{ id: Date.now(), ...baseInstructions }]);
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [wordCount, setWordCount] = useState(1000);
  const [tasks, setTasks] = useState([]); // 大纲任务
  const [fullTasks, setFullTasks] = useState([]); // 全文任务
  const [savedStories, setSavedStories] = useState([]); // 已保存的小说列表
  const [storyCategory, setStoryCategory] = useState('全部'); // 小说分类筛选
  const [storyModalVisible, setStoryModalVisible] = useState(false); // 已保存小说弹窗
  const updateTimerRef = useRef({});
  const contentRefs = useRef({});
  const fullContentRefs = useRef({});

  // 单个全文任务发起时当前高亮的全文任务ID
  const [highlightFullId, setHighlightFullId] = useState(null);

  // 并发参数
  const maxConcurrency = 3;
  const maxFullConcurrency = 2;
  let running = 0;
  let taskIndex = 0;
  let fullRunning = 0;
  let fullTaskIndex = 0;

  useEffect(() => {
    loadModels();
    loadSavedStories();
    return () => {
      Object.values(updateTimerRef.current).forEach(timer => timer && clearTimeout(timer));
      updateTimerRef.current = {};
    };
  }, []);

  // 加载已保存的小说
  const loadSavedStories = async (category = '全部') => {
    try {
      const stories = await getStories(category === '全部' ? null : category);
      setSavedStories(stories);
    } catch (error) {
      console.error('加载已保存小说失败:', error);
    }
  };

  // 保存大纲数据（如果已存在该指令大纲，则覆盖，不要重复保存）
  const saveOutlineData = async (task) => {
    if (!task.content || task.status !== 'completed') return;
    const targetOption = TARGET_WORD_COUNT_OPTIONS.find(opt => opt.value === wordCount);

    try {
      // 查询是否已存在同主题和同outline的大纲，content为空表示尚未生成正文
      const allStories = await getStories(null);
      const existingStory = allStories.find(s => 
        s.theme === task.theme && 
        s.outline === task.content && 
        (!s.content || s.content === '')
      );
      if (existingStory) {
        // 覆盖更新已存在的大纲记录
        await updateStory({
          id: existingStory.id,
          instruction: `主题：${task.theme}\n${task.basicInstruction}`,
          basicInstruction: task.basicInstruction,
          theme: task.theme,
          outline: task.content,
          content: '',
          wordCount: task.wordCount || 0,
          targetWordCount: wordCount, // 使用配置的目标字数
          targetWordCountLabel: targetOption?.label || `${wordCount}字`
        });
      } else {
        // 新增保存
        await saveStory({
          instruction: `主题：${task.theme}\n${task.basicInstruction}`,
          basicInstruction: task.basicInstruction,
          theme: task.theme,
          outline: task.content,
          content: '',
          wordCount: task.wordCount || 0,
          targetWordCount: wordCount, // 使用配置的目标字数
          targetWordCountLabel: targetOption?.label || `${wordCount}字`
        });
      }
    } catch (error) {
      console.error('保存大纲失败:', error);
    }
  };

  // 保存全文数据
  const saveFullStoryData = async (fullTask) => {
    if (!fullTask.content || fullTask.status !== 'completed') return;
    // 从 instructions 中获取 basicInstruction
    const instruction = instructions.find(i => i.id === fullTask.instructionId);
    const outlineTask = tasks.find(t => t.instructionId === fullTask.instructionId);
    const targetOption = TARGET_WORD_COUNT_OPTIONS.find(opt => opt.value === wordCount);
    
    // 先查找是否有对应的大纲记录
    const outlineContent = fullTask.outline || outlineTask?.content || '';
    let existingStoryId = null;
    
    if (outlineContent && fullTask.theme) {
      try {
        const allStories = await getStories(null);
        const existingStory = allStories.find(s => 
          s.theme === fullTask.theme && 
          s.outline === outlineContent && 
          (!s.content || s.content === '')
        );
        if (existingStory) {
          existingStoryId = existingStory.id;
        }
      } catch (error) {
        console.error('查找已有记录失败:', error);
      }
    }
    
    try {
      if (existingStoryId) {
        // 更新已有记录
        await updateStory({
          id: existingStoryId,
          content: fullTask.content,
          wordCount: fullTask.wordCount || 0,
          targetWordCount: wordCount,
          targetWordCountLabel: targetOption?.label || `${wordCount}字`
        });
        message.success('小说已更新到本地');
      } else {
        // 创建新记录
        await saveStory({
          instruction: `主题：${fullTask.theme}\n${instruction?.basicInstruction || outlineTask?.basicInstruction || ''}`,
          basicInstruction: instruction?.basicInstruction || outlineTask?.basicInstruction || '',
          theme: fullTask.theme,
          outline: outlineContent,
          content: fullTask.content,
          wordCount: fullTask.wordCount || 0,
          targetWordCount: wordCount, // 使用配置的目标字数
          targetWordCountLabel: targetOption?.label || `${wordCount}字` // 保存目标字数的标签
        });
        message.success('小说已保存到本地');
      }
      loadSavedStories(storyCategory);
    } catch (error) {
      console.error('保存全文失败:', error);
      message.error('保存失败');
    }
  };

  const loadModels = async () => {
    try {
      const modelList = await getModels();
      setModels(modelList);
      if (modelList.length > 0 && !model) {
        setModel(modelList[0].id || modelList[0]);
      }
    } catch (error) {
      message.error("加载模型列表失败");
    }
  };

  // 添加指令
  const handleAddInstruction = () => {
    setInstructions(prev => [...prev, { id: Date.now(), ...baseInstructions }]);
  };

  // 删除指令
  const handleRemoveInstruction = (id) => {
    if (instructions.length === 1) {
      message.warning("至少需要保留一个指令");
      return;
    }
    setInstructions(prev => prev.filter(item => item.id !== id));
    setTasks(prev => prev.filter(task => task.instructionId !== id));
    setFullTasks(prev => prev.filter(task => task.instructionId !== id));
  };

  // 更新指令
  const handleUpdateInstruction = (id, field, value) => {
    setInstructions(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // --- 大纲批量生成 ---
  const handleBatchGenerate = async () => {
    const validInstructions = instructions.filter(item =>
      item.basicInstruction.trim() && item.theme.trim()
    );
    if (validInstructions.length === 0) {
      message.warning("请至少输入一个有效的生成指令和主题");
      return;
    }
    if (!model) {
      message.warning("请选择AI模型");
      return;
    }
    startBatchGenerate(validInstructions);
  };

  const startBatchGenerate = (validInstructions) => {
    setTasks(prev => {
      const newTasks = validInstructions.map(item => {
        const existingTask = prev.find(t => t.instructionId === item.id);
        if (existingTask && existingTask.status === 'completed') {
          return {
            ...existingTask,
            status: 'pending',
            content: '',
            progress: 0,
            wordCount: 0,
            statusMessage: '等待开始...',
            basicInstruction: item.basicInstruction.trim(),
            theme: item.theme.trim(),
          };
        }
        return {
          id: item.id,
          instructionId: item.id,
          basicInstruction: item.basicInstruction.trim(),
          theme: item.theme.trim(),
          status: 'pending',
          content: '',
          progress: 0,
          wordCount: 0,
          statusMessage: '等待开始...',
          startTime: Date.now(),
        };
      });

      const incompleteTasks = prev.filter(t =>
        !validInstructions.some(item => item.id === t.instructionId)
      );
      const updatedTasks = [...incompleteTasks, ...newTasks];
      startTaskGeneration(updatedTasks, validInstructions);
      return updatedTasks;
    });
  };

  const startTaskGeneration = (currentTasks, validInstructions) => {
    const taskMap = new Map(currentTasks.map(t => [t.id, t]));
    const tasksToStart = validInstructions.map(item => taskMap.get(item.id)).filter(Boolean);

    const startNextTask = async () => {
      if (taskIndex >= tasksToStart.length) {
        if (running === 0) {
          message.success(`所有任务已完成！`);
        }
        return;
      }
      while (running < maxConcurrency && taskIndex < tasksToStart.length) {
        const task = tasksToStart[taskIndex];
        taskIndex++;
        running++;
        setTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: 'generating', statusMessage: '正在连接AI服务...' } : t
        ));

        generateTask(task.id, task.basicInstruction, task.theme).finally(() => {
          running--;
          startNextTask();
        });
      }
    };
    startNextTask();
  };

  // 生成单个大纲任务，大纲字数默认1000字左右
  const generateTask = async (taskId, basicInstruction, theme, existingContent = '') => {
    const fullInstruction = `主题：${theme}\n${basicInstruction}`;
    try {
      await generateStoryStream(
        {
          instruction: fullInstruction,
          model,
          wordCount: 1000,
          existingContent,
        },
        (data) => {
          if (data.type === 'content') {
            if (updateTimerRef.current[taskId]) clearTimeout(updateTimerRef.current[taskId]);
            updateTimerRef.current[taskId] = setTimeout(() => {
              setTasks(prev => prev.map(task => {
                if (task.id !== taskId) return task;
                return {
                  ...task,
                  status: 'generating',
                  content: data.fullContent,
                  progress: data.progress || 0,
                  wordCount: data.wordCount || 0,
                  statusMessage: `正在生成中... (${data.wordCount || 0} 字)`,
                };
              }));
              setTimeout(() => {
                const contentEl = contentRefs.current[taskId];
                if (contentEl) contentEl.scrollTop = contentEl.scrollHeight;
              }, 50);
            }, 200);
          } else {
            setTasks(prev => prev.map(task => {
              if (task.id !== taskId) return task;
              if (data.type === 'start') {
                return {
                  ...task,
                  status: 'generating',
                  statusMessage: data.message || "开始生成大纲...",
                };
              } else if (data.type === 'done') {
                if (updateTimerRef.current[taskId]) {
                  clearTimeout(updateTimerRef.current[taskId]);
                  delete updateTimerRef.current[taskId];
                }
                setTimeout(() => {
                  const contentEl = contentRefs.current[taskId];
                  if (contentEl) contentEl.scrollTop = contentEl.scrollHeight;
                }, 100);
                const completedTask = {
                  ...task,
                  status: 'completed',
                  content: data.content,
                  progress: 100,
                  wordCount: data.wordCount || 0,
                  statusMessage: `生成完成！共 ${data.wordCount || 0} 字`,
                };
                // 自动保存大纲
                saveOutlineData(completedTask);
                return completedTask;
              } else if (data.type === 'error') {
                if (updateTimerRef.current[taskId]) {
                  clearTimeout(updateTimerRef.current[taskId]);
                  delete updateTimerRef.current[taskId];
                }
                return {
                  ...task,
                  status: 'error',
                  statusMessage: `生成失败：${data.error || "未知错误"}`,
                };
              }
              return task;
            }));
          }
        }
      );
    } catch (error) {
      setTasks(prev => prev.map(task =>
        task.id === taskId
          ? { ...task, status: 'error', statusMessage: `生成失败：${error.message}` }
          : task
      ));
    }
  };

  // --- 批量全文生成 ---
  const handleBatchFullGenerate = () => {
    if (!model) {
      message.warning("请选择AI模型");
      return;
    }
    const readyTasks = tasks.filter(t => t.status === 'completed' && t.content && t.theme);
    if (readyTasks.length === 0) {
      alert("请先批量生成大纲，并确保至少有一个已完成的大纲任务");
      return;
    }
    setFullTasks(prev => {
      const fullTaskMap = {};
      prev.forEach(t => { fullTaskMap[t.instructionId] = t; });
      const newFullTasks = readyTasks.map(t => {
        const existed = fullTaskMap[t.instructionId];
        if (existed && existed.status === 'completed') return existed;
        return {
          id: t.instructionId,
          instructionId: t.instructionId,
          theme: t.theme,
          outline: t.content,
          status: 'pending',
          content: '',
          progress: 0,
          wordCount: 0,
          statusMessage: '等待开始...',
          startTime: Date.now(),
        };
      });
      const result = [
        ...prev.filter(t => !readyTasks.some(r => r.instructionId === t.instructionId)),
        ...newFullTasks,
      ];
      startBatchFullStory(result, readyTasks);
      return result;
    });
  };

  const startBatchFullStory = (currentFullTasks, outlineTasks) => {
    const fullMap = new Map(currentFullTasks.map(t => [t.instructionId, t]));
    const tasksToStart = outlineTasks.map(t => fullMap.get(t.instructionId)).filter(Boolean);

    const startNextFullTask = async () => {
      if (fullTaskIndex >= tasksToStart.length) {
        if (fullRunning === 0) {
          message.success(`所有全文任务已完成！`);
        }
        return;
      }
      while (fullRunning < maxFullConcurrency && fullTaskIndex < tasksToStart.length) {
        const task = tasksToStart[fullTaskIndex];
        fullTaskIndex++;
        fullRunning++;
        setFullTasks(prev => prev.map(item =>
          item.id === task.id ? { ...item, status: 'generating', statusMessage: '正在生成全文...' } : item
        ));
        console.log('3333333')
        generateFullStoryTask(task).finally(() => {
          fullRunning--;
          startNextFullTask();
        });
      }
    };
    startNextFullTask();
  };

  // 生成单个全文任务
  const generateFullStoryTask = async (task) => {
    const fullInstruction = `请基于如下小说大纲内容，严格以“我”为主角的第一人称，按章节进行叙述，每个章节严格控制字数在3000字，写出一篇完整的小说正文。\n\n【小说主题】：${task.theme}\n\n【大纲内容】：\n${task.outline}\n\n要求：\n- 内容生动感人、有起伏。\n- 结构完整、细节丰富。\n- 不要再重复输出大纲，只需要添故事简介里的主人公介绍，然后直接进入正文。`;
    let currentContent = "";
    try {
      await generateStoryStream(
        {
          instruction: fullInstruction,
          model,
          wordCount: wordCount > 4000 ? wordCount : Math.max(4000, wordCount),
          existingContent: "",
        },
        (data) => {
          if (data.type === 'content') {
            currentContent = data.fullContent || "";
            // 优化：只在内容有变化时才更新
            setFullTasks(prev => prev.map(t =>
              t.id === task.id && t.content !== currentContent
                ? {
                  ...t,
                  content: currentContent,
                  progress: data.progress || 0,
                  wordCount: data.wordCount || 0,
                  status: 'generating',
                  statusMessage: `生成中...（${data.wordCount || 0} 字）`
                }
                : t
            ));
            // 滚动操作放到 FullContentBox useEffect 里
          } else if (data.type === 'start') {
            setFullTasks(prev => prev.map(t =>
              t.id === task.id ? { ...t, status: 'generating', statusMessage: data.message || "开始生成..." } : t
            ));
          } else if (data.type === 'done') {
            setFullTasks(prev => prev.map(t => {
              if (t.id === task.id) {
                const completedTask = {
                  ...t,
                  content: data.content || currentContent,
                  status: 'completed',
                  progress: 100,
                  wordCount: data.wordCount || 0,
                  statusMessage: `生成完成！（共 ${data.wordCount || currentContent.length} 字）`
                };
                // 自动保存全文
                saveFullStoryData(completedTask);
                return completedTask;
              }
              return t;
            }));
          } else if (data.type === 'error') {
            setFullTasks(prev => prev.map(t =>
              t.id === task.id
                ? { ...t, status: 'error', statusMessage: "生成失败：" + (data.error || "未知错误") }
                : t
            ));
          }
        }
      );
    } catch (e) {
      setFullTasks(prev => prev.map(t =>
        t.id === task.id
          ? { ...t, status: 'error', statusMessage: "生成失败：" + (e.message || "未知错误") }
          : t
      ));
    }
  };

  // 单个正文生成 —— 实际是右栏新增一项特殊的全文任务（临时/手工生成项）
  const handleGenerateFullStory = (task) => {
    if (!model) {
      message.warning("请选择AI模型");
      return;
    }
    if (!task || !task.content) {
      message.warning("需要选择一个已生成的大纲任务");
      return;
    }

    // 检查fullTasks中是否已有该任务，且未完成则重置，否则新增/重置临时任务
    // setFullTasks(prev => {
      const existed = fullTasks.find(t => t.instructionId === task.id && t.outline === task.content);
      let updated = [];
      if (existed) {
        updated = fullTasks.map(t =>
          t.instructionId === task.id
            ? {
              ...t,
              theme: task.theme,
              outline: task.content,
              status: 'pending',
              content: '',
              progress: 0,
              wordCount: 0,
              statusMessage: '等待开始...',
              startTime: Date.now(),
            }
            : t
        );
      } else {
        updated = [
          ...fullTasks,
          {
            id: "single-" + task.id + "-" + Date.now(),
            instructionId: task.id,
            theme: task.theme,
            outline: task.content,
            status: 'pending',
            content: '',
            progress: 0,
            wordCount: 0,
            statusMessage: '等待开始...',
            startTime: Date.now(),
          }
        ];
      }
      console.log('00111111111111')
      // 令该ID高亮
      // setTimeout(() => setHighlightFullId((existed ? existed.id : updated[updated.length - 1].id)), 50);
      setHighlightFullId( updated[updated.length - 1].id)
      generateFullStoryTask(updated[updated.length - 1]);
      // !highlightFullId && setTimeout(() => {
      //   generateFullStoryTask(existed
      //     ? { ...existed, theme: task.theme, outline: task.content }
      //     : updated[updated.length - 1]
      //   );
      // }, 80);
      // return updated;
    // });
    setFullTasks(updated)
  };

  // 下载单个全文任务
  const handleSaveFullTask = (task) => {
    if (!task.content) {
      message.warning("没有可保存的内容");
      return;
    }
    const safeTheme = (task.theme || '全文').replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([task.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTheme}_全文.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    message.success(`已保存：${safeTheme}_全文.txt`);
  };

  // 批量下载所有已完成的全文
  const handleBatchDownloadFull = () => {
    const completedFulls = fullTasks.filter(t => t.status === 'completed' && t.content);
    if (completedFulls.length === 0) {
      message.warning("没有可下载的内容");
      return;
    }
    completedFulls.forEach((task, index) => {
      setTimeout(() => handleSaveFullTask(task), index * 250);
    });
    message.success(`开始下载 ${completedFulls.length} 个全文文件`);
  };

  // 清空所有
  const handleClear = () => {
    setInstructions([ { id: Date.now(), ...baseInstructions }]);
    setTasks([]);
    setFullTasks([]);
    setHighlightFullId(null);
  };

  // 打开已保存小说弹窗
  const handleOpenSavedStories = async () => {
    setStoryModalVisible(true);
    await loadSavedStories(storyCategory);
  };

  // 分类切换
  const handleCategoryChange = async (category) => {
    setStoryCategory(category);
    await loadSavedStories(category);
  };

  // 加载已保存的小说到编辑器
  const handleLoadStory = (story) => {
    // 查找或创建对应的指令
    let instruction = instructions.find(i => 
      i.theme === story.theme && i.basicInstruction === story.basicInstruction
    );
    
    if (!instruction) {
      instruction = { id: Date.now(), theme: story.theme, basicInstruction: story.basicInstruction };
      setInstructions(prev => [...prev, instruction]);
    }

    // 如果有大纲，创建大纲任务
    if (story.outline) {
      const outlineTask = {
        id: instruction.id,
        instructionId: instruction.id,
        basicInstruction: story.basicInstruction,
        theme: story.theme,
        status: 'completed',
        content: story.outline,
        progress: 100,
        wordCount: story.outline.length,
        statusMessage: `已加载（${story.outline.length} 字）`,
      };
      setTasks(prev => {
        const existing = prev.find(t => t.instructionId === instruction.id);
        if (existing) {
          return prev.map(t => t.instructionId === instruction.id ? outlineTask : t);
        }
        return [...prev, outlineTask];
      });
    }

    // 如果有正文，创建全文任务
    if (story.content) {
      const fullTask = {
        id: instruction.id,
        instructionId: instruction.id,
        theme: story.theme,
        outline: story.outline,
        status: 'completed',
        content: story.content,
        progress: 100,
        wordCount: story.wordCount || story.content.length,
        statusMessage: `已加载（${story.wordCount || story.content.length} 字）`,
      };
      setFullTasks(prev => {
        const existing = prev.find(t => t.instructionId === instruction.id);
        if (existing) {
          return prev.map(t => t.instructionId === instruction.id ? fullTask : t);
        }
        return [...prev, fullTask];
      });
    }

    message.success('已加载小说数据');
    setStoryModalVisible(false);
  };

  // 删除已保存的小说
  const handleDeleteStory = async (id) => {
    try {
      await deleteStories([id]);
      message.success('删除成功');
      await loadSavedStories(storyCategory);
    } catch (error) {
      message.error('删除失败');
    }
  };

  // 继续生成
  const handleContinueGenerate = (task) => {
    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, status: 'generating', statusMessage: '继续生成中...' }
        : t
    ));
    generateTask(task.id, task.basicInstruction, task.theme, task.content || '');
  };

  // 重新生成大纲任务
  const handleRegenerateTask = (task) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === task.id
          ? {
            ...t,
            status: 'pending',
            content: '',
            progress: 0,
            wordCount: 0,
            statusMessage: '等待开始...',
            startTime: Date.now(),
          }
          : t
      )
    );
    setTimeout(() => {
      generateTask(task.id, task.basicInstruction, task.theme, '');
    }, 0);
  };

  // 重新生成全文任务
  const handleRegenerateFullTask = (task) => {
    setFullTasks(prev =>
      prev.map(t =>
        t.id === task.id
          ? {
            ...t,
            status: 'pending',
            content: '',
            progress: 0,
            wordCount: 0,
            statusMessage: '等待开始...',
            startTime: Date.now(),
          }
          : t
      )
    );
    const outlineTask = tasks.find(tk => tk.instructionId === task.instructionId);
    if (outlineTask) {
      console.log('22222222222222')
      setTimeout(() => {
        generateFullStoryTask({
          ...task,
          outline: outlineTask.content,
          theme: outlineTask.theme,
        });
      }, 0);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'generating': return 'processing';
      case 'error': return 'error';
      case 'interrupted': return 'warning';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'generating': return '生成中';
      case 'completed': return '已完成';
      case 'error': return '失败';
      case 'interrupted': return '已中断';
      default: return '未知';
    }
  };

  // 检查任务是否中断（生成中但字数未达到目标）
  const isTaskInterrupted = (task) => {
    return task.status === 'completed' &&
      task.content &&
      task.wordCount < wordCount * 0.8 &&
      Date.now() - task.startTime > 60000;
  };

  // --- 三栏界面 ---
  return (
    <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* 左：生成配置 */}
        <div style={{ width: "28%", display: "flex", flexDirection: "column", height: "100%" }}>
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

            <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {instructions.map((item, index) => (
                  <Card key={item.id} size="small" style={{ backgroundColor: "#fafafa" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontWeight: 500, marginRight: 8 }}>指令 {index + 1}：</span>
                      {instructions.length > 1 && (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveInstruction(item.id)}
                          style={{ marginLeft: "auto" }}
                        />
                      )}
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                        小说主题：
                      </label>
                      <Input
                        value={item.theme}
                        onChange={(e) => handleUpdateInstruction(item.id, 'theme', e.target.value)}
                        placeholder="例如：未来世界的机器人"
                        showCount
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                        基本指令：
                      </label>
                      <TextArea
                        value={item.basicInstruction}
                        onChange={(e) => handleUpdateInstruction(item.id, 'basicInstruction', e.target.value)}
                        placeholder="请输入创作指令，例如：写一个关于未来世界的科幻短篇小说，主角是一个机器人..."
                        rows={3}
                        maxLength={500}
                        showCount
                      />
                    </div>
                  </Card>
                ))}
              </Space>
            </div>
            <div style={{ flexShrink: 0 }}>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Button
                  type="dashed"
                  onClick={handleAddInstruction}
                  icon={<PlusOutlined />}
                  block
                >
                  添加指令
                </Button>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="primary"
                    onClick={handleBatchGenerate}
                    block
                  >
                    批量大纲生成 ({instructions.filter(item => item.basicInstruction.trim() && item.theme.trim()).length} 个)
                  </Button>
                  <Button
                    type="primary"
                    disabled={tasks.filter(t => t.status === 'completed' && t.content && t.theme).length === 0}
                    onClick={handleBatchFullGenerate}
                    block
                  >
                    批量全文生成 ({tasks.filter(t => t.status === 'completed' && t.content).length} 个)
                  </Button>
                  <Button
                    icon={<FolderOutlined />}
                    onClick={handleOpenSavedStories}
                  >
                    已保存小说
                  </Button>
                  <Button
                    onClick={handleClear}
                    disabled={tasks.some(t => t.status === 'generating') ||
                      fullTasks.some(t => t.status === 'generating')}
                  >
                    清空
                  </Button>
                </div>
                {tasks.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>任务统计：</div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <Tag color="default">大纲: {tasks.length}</Tag>
                      <Tag color="error">失败: {tasks.filter(t => t.status === 'error').length}</Tag>
                      <Tag color="green">全文任务: {fullTasks.length}</Tag>
                      <Tag color="error">
                        全文失败: {fullTasks.filter(t => t.status === 'error').length}
                      </Tag>
                    </div>
                  </div>
                )}
              </Space>
            </div>
          </Card>
        </div>

        {/* 中栏：大纲生成结果 */}
        <div style={{ width: "38%", display: "flex", flexDirection: "column" }}>
          <Card
            title={
              <div style={{ display: "flex", }}>
                <OrderedListOutlined style={{ marginRight: 6 }} />
                <span>内容大纲</span>
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
                    title={
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <Tag color="blue" style={{ marginRight: 8 }}>
                              指令 {instructions.findIndex(i => i.id === task.instructionId) + 1}
                            </Tag>
                            <span style={{ fontWeight: 500 }}>
                              {task.theme?.substring(0, 30)}
                              {task.theme?.length > 30 && "..."}
                            </span>
                          </div>
                          <Tag style={{ float: 'right' }} color={getStatusColor(task.status)}>{getStatusText(task.status)}</Tag>
                        </div>
                      </div>
                    }
                    extra={
                      task.status === 'completed' && (
                        <Space>
                          <Tooltip title="重新生成大纲">
                            <Button
                              type="link"
                              size="small"
                              icon={<ReloadOutlined />}
                              onClick={() => handleRegenerateTask(task)}
                              title="重新生成"
                            />
                          </Tooltip>
                          <Tooltip title="基于此大纲生成全文">
                            <Button
                              type="link"
                              size="small"
                              icon={<ArrowRightOutlined />}
                              onClick={() => handleGenerateFullStory(task)}
                            />
                          </Tooltip>
                        </Space>
                      )
                    }
                  >
                    {task.status === 'generating' && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#666" }}>{task.statusMessage}</span>
                          <span style={{ fontSize: 12, color: "#666" }}>
                            {task.wordCount > 0 && `${task.wordCount} 字`}
                          </span>
                        </div>
                        <Progress
                          percent={task.progress}
                          status="active"
                          size="small"
                        />
                        {isTaskInterrupted(task) && (
                          <div style={{ marginTop: 8 }}>
                            <Button
                              type="primary"
                              size="small"
                              icon={<ReloadOutlined />}
                              onClick={() => handleContinueGenerate(task)}
                            >
                              继续生成
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {task.status === 'pending' && (
                      <div style={{ textAlign: "center", padding: 20, color: "#999" }}>
                        <Spin size="small" /> 等待开始...
                      </div>
                    )}
                    {task.status === 'error' && (
                      <div>
                        <div style={{ color: "#ff4d4f", fontSize: 12, marginBottom: 8 }}>
                          {task.statusMessage}
                        </div>
                        {task.content && (
                          <Button
                            type="primary"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={() => handleContinueGenerate(task)}
                          >
                            继续生成
                          </Button>
                        )}
                      </div>
                    )}
                    {task.status === 'interrupted' && (
                      <div>
                        <div style={{ color: "#faad14", fontSize: 12, marginBottom: 8 }}>
                          生成已中断，当前字数：{task.wordCount} / {wordCount}
                        </div>
                        <Button
                          type="primary"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => handleContinueGenerate(task)}
                        >
                          继续生成
                        </Button>
                      </div>
                    )}
                    {task.status === 'completed' && (
                      <div style={{ fontSize: 13, position: "relative", top: -10 }}>
                        字数：<span style={{ color: "red" }}>{task.wordCount}</span> 字
                      </div>
                    )}
                    {task.content && (
                      <div
                        ref={(el) => {
                          if (el) contentRefs.current[task.id] = el;
                        }}
                        style={{
                          maxHeight: 300,
                          overflowY: "auto",
                          overflowX: "hidden",
                          paddingRight: 8
                        }}
                      >
                        <Paragraph
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                            fontSize: 13,
                            color: "#333",
                            margin: 0,
                            paddingRight: 4
                          }}
                        >
                          {task.content}
                          {task.status === 'generating' && (
                            <span style={{
                              display: "inline-block",
                              width: "6px",
                              height: "14px",
                              backgroundColor: "#1890ff",
                              marginLeft: "4px",
                              animation: "blink 1s infinite"
                            }} />
                          )}
                        </Paragraph>
                      </div>
                    )}
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </div>

        {/* 右栏：批量&单个全文生成合体输出 */}
        <div style={{ width: "34%", display: "flex", flexDirection: "column" }}>
          <Card
            title={
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>
                  <FileTextOutlined style={{ marginRight: 6 }} />
                  基于大纲生成的{wordCount > 5000 ? wordCount : Math.max(5000, wordCount)}字全文
                </span>
                {fullTasks.filter(t => t.status === 'completed').length > 0 && (
                  <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    size="small"
                    onClick={handleBatchDownloadFull}
                  >
                    批量下载全部全文
                  </Button>
                )}
              </div>
            }
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
            bodyStyle={{ flex: 1, overflow: "auto", padding: 12 }}
            extra={null}
          >
            {fullTasks.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                暂无全文生成任务，请先批量生成大纲并点击“批量全文生成”，或点单个指令生成全文
              </div>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {fullTasks.map((task, idx) => (
                  <Card
                    key={task.id}
                    size="small"
                    style={{
                      border: highlightFullId === task.id ? "2px solid #1890ff" : undefined,
                      boxShadow: highlightFullId === task.id ? "0 0 8px #1890ff44" : undefined,
                      position: highlightFullId === task.id ? "relative" : undefined
                    }}
                    title={
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>
                          <Tag color="blue" style={{ marginRight: 4 }}>指令{instructions.findIndex(i => i.id === task.instructionId) + 1}</Tag>
                          {task.theme?.substring(0, 28)}
                          {task.theme?.length > 28 && "..."}
                        </span>
                        <Tag style={{ float: 'right' }} color={getStatusColor(task.status)}>{getStatusText(task.status)}</Tag>
                      </div>
                    }
                    extra={
                      task.status === 'completed' && (
                        <Space>
                          <Button
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleSaveFullTask(task)}
                            title="下载全文"
                          />
                          <Button
                            type="link"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={() => handleRegenerateFullTask(task)}
                            title="重新生成全文"
                          />
                        </Space>
                      )
                    }
                  >
                    {task.status === 'generating' && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#666" }}>{task.statusMessage}</span>
                          <span style={{ fontSize: 12, color: "#666" }}>
                            {task.wordCount > 0 && `${task.wordCount} 字`}
                          </span>
                        </div>
                        <Progress
                          percent={task.progress}
                          status="active"
                          size="small"
                        />
                      </div>
                    )}
                    {task.status === 'pending' && (
                      <div style={{ textAlign: "center", padding: 18, color: "#999" }}>
                        <Spin size="small" /> 等待开始...
                      </div>
                    )}
                    {task.status === 'error' && (
                      <div style={{ color: "#ff4d4f", fontSize: 12, marginBottom: 8 }}>
                        {task.statusMessage}
                        <Button
                          type="primary"
                          size="small"
                          icon={<ReloadOutlined />}
                          style={{ marginLeft: 8 }}
                          onClick={() => handleRegenerateFullTask(task)}
                        >
                          重新生成全文
                        </Button>
                      </div>
                    )}
                    {task.status === 'completed' && (
                      <div style={{ fontSize: 13, position: "relative", top: -10 }}>
                        字数：<span style={{ color: "red" }}>{task.wordCount}</span> 字
                      </div>
                    )}
                    {task.content && (
                      <FullContentBox task={task} fullContentRef={{
                        current: fullContentRefs.current[task.id],
                        set current(val) {
                          fullContentRefs.current[task.id] = val;
                        }
                      }} />
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
        footer={null}
        width={900}
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
            <span style={{ color: '#666', fontSize: 12 }}>
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
              {savedStories.map((story) => (
                <Card
                  key={story.id}
                  size="small"
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Tag color="blue" style={{ marginRight: 8 }}>{story.category}</Tag>
                        <span style={{ fontWeight: 500 }}>
                          {story.theme || '未命名小说'}
                        </span>
                      </div>
                      <div>
                        <Tag color="red">{story.wordCount || 0} 字</Tag>
                        {story.targetWordCount && story.targetWordCount !== story.wordCount && (
                          <Tag color="orange" style={{ marginLeft: 4 }}>
                            目标: {story.targetWordCountLabel || `${story.targetWordCount}字`}
                          </Tag>
                        )}
                      </div>
                    </div>
                  }
                  extra={
                    <Space>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => handleLoadStory(story)}
                      >
                        加载
                      </Button>
                      <Button
                        type="link"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          handleDeleteStory(story.id)
                        }}
                      >
                        删除
                      </Button>
                    </Space>
                  }
                >
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                      <strong>指令：</strong>
                      {story.basicInstruction?.substring(0, 100)}
                      {story.basicInstruction?.length > 100 && '...'}
                    </div>
                    {story.outline && (
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                        <strong>大纲：</strong>
                        {story.outline.substring(0, 150)}
                        {story.outline.length > 150 && '...'}
                      </div>
                    )}
                    {story.content && (
                      <div style={{ fontSize: 12, color: '#666' }}>
                        <strong>正文：</strong>
                        {story.content.substring(0, 150)}
                        {story.content.length > 150 && '...'}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    创建时间：{new Date(story.createdAt).toLocaleString('zh-CN')}
                  </div>
                </Card>
              ))}
            </Space>
          )}
        </div>
      </Modal>
    </div>
  );
}
