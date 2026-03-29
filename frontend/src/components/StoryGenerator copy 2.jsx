import React, { useState, useEffect, useRef } from "react";
import { Input, Button, Select, message, Card, Space, Typography, Tag, Tooltip, Modal, Progress, Checkbox } from "antd";
import {
  PlusOutlined, DeleteOutlined, OrderedListOutlined,
  DownloadOutlined, ReloadOutlined, FolderOutlined,
  CopyOutlined
} from "@ant-design/icons";
import JSZip from "jszip";
import {
  generateStoryStream,
  getModels,
  saveStory,
  getStories,
  deleteStories,
} from "../api";

const { TextArea } = Input;
const { Paragraph } = Typography;

const baseInstructions = {
  basicInstruction: `严格以第一人我（女性），以温情女频小说的风格，以$$number字输出该主题的简介和分章节大纲，先列出大纲，再细化内容。1、大纲分为$$chapters个章节。2、直接输出每个章节的详细内容，不要断尾，要完整输出所有章节。`,
  theme: ""
};

let running = 0;
let taskIndex = 0;
const maxConcurrency = 3;

const TARGET_WORD_COUNT_OPTIONS = [
  { label: "1000", value: 1000 },
  { label: "2万字（柳如烟）", value: 20000 },
  { label: "5万字（老年故事）", value: 50000 },
];

export default function StoryGenerator() {
  const [instructions, setInstructions] = useState([{ id: Date.now(), ...baseInstructions }]);
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [wordCount, setWordCount] = useState(1000);
  const [tasks, setTasks] = useState([]);
  const [savedStories, setSavedStories] = useState([]);
  const [storyCategory, setStoryCategory] = useState('全部');
  const [storyModalVisible, setStoryModalVisible] = useState(false);
  const updateTimerRef = useRef({});
  const contentRefs = useRef({});
  const [selectedInstructions, setSelectedInstructions] = useState(new Set());
  const contentPendingSaveRef = useRef([]);
  // 新增：保存所选小说id
  const [selectedSavedStoryIds, setSelectedSavedStoryIds] = useState([]);

  useEffect(() => {
    loadModels();
    loadSavedStories();
    return () => {
      Object.values(updateTimerRef.current).forEach(timer => timer && clearTimeout(timer));
      updateTimerRef.current = {};
    };
  }, []);

  const loadSavedStories = async (category = '全部') => {
    try {
      const stories = await getStories(category === '全部' ? null : category);
      setSavedStories(stories);
      // 初始化选择状态：不选择任何项目
      setSelectedSavedStoryIds([]);
    } catch (error) {
      console.error('加载已保存小说失败:', error);
    }
  };

  const saveContentData = async (task) => {
    if (task.status !== 'completed') return;
    contentPendingSaveRef.current.push(task);
  };

  const batchSaveContents = async (tasks) => {
    if (!tasks.length) return;
    const promises = tasks.map(task => {
      const targetOption = TARGET_WORD_COUNT_OPTIONS.find(opt => opt.value === wordCount);
      return saveStory({
        instruction: `主题：${task.theme}\n${task.basicInstruction}`,
        basicInstruction: task.basicInstruction,
        theme: task.theme,
        content: task.content,
        wordCount: task.wordCount || 0,
        targetWordCount: wordCount,
        targetWordCountLabel: targetOption?.label || `${wordCount}字`
      });
    });
    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('批量保存正文失败:', error);
    }
    // outlinePendingSaveRef.current = [];
    loadSavedStories(storyCategory);
  };

  const loadModels = async () => {
    try {
      const modelList = await getModels();
      setModels(modelList);
      if (modelList.length > 0 && !model) {
        setModel(modelList[0].id || modelList[0]);
      }
    } catch (error) {
      alert("加载模型列表失败");
    }
  };

  const handleAddInstruction = () => {
    setInstructions(prev => [...prev, { id: Date.now(), ...baseInstructions }]);
  };

  const handleRemoveInstruction = (id) => {
    if (instructions.length === 1) {
      alert("至少需要保留一个指令");
      return;
    }
    setInstructions(prev => prev.filter(item => item.id !== id));
    setTasks(prev => prev.filter(task => task.instructionId !== id));
  };

  const handleUpdateInstruction = (id, field, value) => {
    setInstructions(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
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
        .filter(t => t.status === 'completed')
        .map(t => t.instructionId);
      setSelectedInstructions(new Set(allInstructionIds));
    } else {
      setSelectedInstructions(new Set());
    }
  };

  const handleBatchGenerate = async () => {
    const validInstructions = instructions.filter(item =>
      item.basicInstruction.trim() && item.theme.trim()
    );
    if (validInstructions.length === 0) {
      alert("请至少输入一个有效的生成指令和主题");
      return;
    }
    if (!model) {
      alert("请选择AI模型");
      return;
    }
    contentPendingSaveRef.current = [];
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
    const totalBatchCount = tasksToStart.length;
    let completedBatchCount = 0;

    const tryDoBatchSave = () => {
      completedBatchCount++;
      if (completedBatchCount === totalBatchCount) {
        const savedTasks = contentPendingSaveRef.current.slice();
        batchSaveContents(savedTasks);
      }
    };

    const startNextTask = async () => {
      if (taskIndex >= tasksToStart.length) {
        if (running === 0) {
          alert(`所有任务已完成！`);
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
        generateTask(task.id, task.basicInstruction, task.theme, undefined, tryDoBatchSave).finally(() => {
          running--;
          startNextTask();
        });
      }
    };
    startNextTask();
  };

  // 生成大纲单个任务
  const generateTask = async (taskId, basicInstruction, theme, existingContent = '', onFinal) => {
    const fullInstruction = `以 “${theme}” 作为主题，\n${basicInstruction.replace('$$number',wordCount).replace('$$chapters',wordCount/10000*6)}`;
    console.log(fullInstruction)
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
            if (updateTimerRef.current[taskId]) clearTimeout(updateTimerRef.current[taskId]);
            updateTimerRef.current[taskId] = setTimeout(() => {
              setTasks(prev => prev.map(task => {
                if (task.id !== taskId) return task;
                return {
                  ...task,
                  status: 'generating',
                  content: data.fullContent,
                  progress: typeof data.progress === 'number' ? data.progress : (data.wordCount ? Math.min(100, Math.round((data.wordCount / (wordCount || 1000)) * 100)) : 0),
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
                  statusMessage: data.message || "开始生成正文...",
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
                saveContentData(completedTask);
                if (onFinal) onFinal();
                return completedTask;
              } else if (data.type === 'error') {
                if (updateTimerRef.current[taskId]) {
                  clearTimeout(updateTimerRef.current[taskId]);
                  delete updateTimerRef.current[taskId];
                }
                if (onFinal) onFinal();
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
      if (onFinal) onFinal();
      setTasks(prev => prev.map(task =>
        task.id === taskId
          ? { ...task, status: 'error', statusMessage: `生成失败：${error.message}` }
          : task
      ));
    }
  };

  // 批量下载当前批量生成区已选正文
  const handleBatchDownload = async () => {
    // 获取所有被选中的 instructionId
    const selectedIds = Array.from(selectedInstructions);
    // 找到所有已完成且被选中的任务
    const downloadTasks = tasks.filter(
      t => t.status === 'completed' && selectedIds.includes(t.instructionId) && t.content && t.content.trim()
    );
    if (downloadTasks.length === 0) {
      message.warning("暂无可批量下载的已完成正文，请先选择");
      return;
    }

    try {
      // 创建ZIP压缩包
      const zip = new JSZip();
      
      // 添加每个小说文件到压缩包
      downloadTasks.forEach((task, index) => {
        const safeTheme = (task.theme || `小说_${index + 1}`).replace(/[\\/:*?"<>|]/g, '_');
        const content = `主题：${task.theme}\n\n${task.content}`;
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
      
      message.success(`已下载包含 ${downloadTasks.length} 个小说的压缩包`);
    } catch (error) {
      console.error('创建压缩包失败:', error);
      message.error('创建压缩包失败，请重试');
    }
  };

  // 批量下载已保存的小说
  const handleBatchDownloadStories = async () => {
    const storiesToDownload = savedStories.filter(story => story.content && story.content.trim());
    if (storiesToDownload.length === 0) {
      message.warning('没有可下载的小说内容');
      return;
    }
    
    try {
      // 创建ZIP压缩包
      const zip = new JSZip();
      
      // 添加每个小说文件到压缩包
      storiesToDownload.forEach((story, index) => {
        const safeTheme = (story.theme || `小说_${index + 1}`).replace(/[\\/:*?"<>|]/g, '_');
        const content = `主题：${story.theme}\n\n${story.content}`;
        zip.file(`${safeTheme}.txt`, content);
      });

      // 生成压缩包
      const zipBlob = await zip.generateAsync({ type: "blob" });
      
      // 下载压缩包
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `已保存小说合集_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      
      message.success(`已下载包含 ${storiesToDownload.length} 个小说的压缩包`);
    } catch (error) {
      console.error('创建压缩包失败:', error);
      message.error('创建压缩包失败，请重试');
    }
  };

  const handleCopyTheme = (theme) => {
    navigator.clipboard.writeText(theme).then(() => {
      alert('主题已复制到剪贴板');
    }).catch(() => {
      alert('复制失败');
    });
  };

  const handleBatchCopyThemes = () => {
    const themes = savedStories.map(story => story.theme || '未命名小说').join('\n');
    navigator.clipboard.writeText(themes).then(() => {
      alert(`已复制 ${savedStories.length} 个主题到剪贴板`);
    }).catch(() => {
      alert('批量复制失败');
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

  // 选择控制已简化（content字段已去除）
  const handleSelectAllSavedStories = (checked) => {
    alert('正文内容已移除，选择功能已禁用');
    setSelectedSavedStoryIds([]);
  };
  const handleSelectSavedStory = (storyId, checked) => {
    setSelectedSavedStoryIds(prev => {
      if (checked) {
        if (!prev.includes(storyId)) return [...prev, storyId];
        return prev;
      } else {
        return prev.filter(id => id !== storyId);
      }
    });
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

  // 选择状态判断已更新（使用content字段）
  const isAllSavedStoriesSelected = () => {
    return savedStories.length > 0 && selectedSavedStoryIds.length === savedStories.length;
  };

  return (
    <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* 左：生成配置 */}
        <div style={{ width: "30%", display: "flex", flexDirection: "column", height: "100%" }}>
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
                        value={item.basicInstruction.replace('$$number',wordCount).replace('$$chapters',wordCount/10000*6)}
                        onChange={(e) => handleUpdateInstruction(item.id, 'basicInstruction', e.target.value)}
                        placeholder="请输入创作指令，例如：写一个关于未来世界的科幻短篇小说，主角是一个机器人..."
                        rows={10}
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
                    批量正文生成 ({instructions.filter(item => item.basicInstruction.trim() && item.theme.trim()).length} 个)
                  </Button>
                  <Button
                    icon={<FolderOutlined />}
                    onClick={handleOpenSavedStories}
                  >
                    已保存小说
                  </Button>
                </div>
                {tasks.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>任务统计：</div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <Tag color="default">正文: {tasks.length}</Tag>
                      <Tag color="error">失败: {tasks.filter(t => t.status === 'error').length}</Tag>
                    </div>
                  </div>
                )}
              </Space>
            </div>
          </Card>
        </div>

        {/* 中栏：正文生成+章节正文 */}
        <div style={{ width: "70%", display: "flex", flexDirection: "column" }}>
          <Card
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex" }}>
                  <OrderedListOutlined style={{ marginRight: 6 }} />
                  <span>小说正文 & 章节内容</span>
                </div>
                {tasks.filter(t => t.status === 'completed').length > 0 && (
                  <Space size="small">
                    <Button
                      size="small"
                      onClick={() => toggleAllInstructions(selectedInstructions.size > 0 ? false : true)}
                    >
                      {selectedInstructions.size > 0 ? '取消全选' : '全选'}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={selectedInstructions.size === 0}
                      onClick={() => handleBatchDownload()}
                    >
                      批量下载(ZIP)
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
                    title={
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                            {task.status === 'completed' && (
                              <input
                                type="checkbox"
                                checked={selectedInstructions.has(task.instructionId)}
                                onChange={() => toggleInstructionSelection(task.instructionId)}
                                style={{ marginRight: 8 }}
                              />
                            )}
                            <Tag color="blue" style={{ marginRight: 8 }}>
                              指令 {instructions.findIndex(i => i.id === task.instructionId) + 1}
                            </Tag>
                            <span style={{ fontWeight: 500 }}>
                              {task.theme?.substring(0, 30)}
                              {task.theme?.length > 30 && "..."}
                            </span>
                          </div>
                          {(['generating', 'completed'].includes(task.status)) && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span>
                                字数：{task.wordCount || 0}
                                {task.status === 'generating' && <span style={{ marginLeft: 8, color: "#1890ff" }}>（生成中...）</span>}
                                {task.status === 'completed' && <span style={{ marginLeft: 8, color: "#52c41a" }}>（已完成）</span>}
                              </span>
                            </div>
                          )}

                        </div>

                      </div>
                    }
                    extra={
                      task.status === 'completed' && (
                        <Space>
                          <Tooltip title="重新生成正文">
                            <Button
                              type="link"
                              size="small"
                              icon={<ReloadOutlined />}
                              onClick={() => {
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
                                contentPendingSaveRef.current = [];
                                setTimeout(() => {
                                  generateTask(task.id, task.basicInstruction, task.theme, '', () => {
                                    batchSaveContents(contentPendingSaveRef.current.slice());
                                  });
                                }, 0);
                              }}
                              title="重新生成"
                            />
                          </Tooltip>
                        </Space>
                      )
                    }
                  >
                    {/* 正文内容展示 */}
                    <div
                      ref={(el) => {
                        if (el) contentRefs.current[task.id] = el;
                      }}
                      style={{
                        maxHeight: 200,
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Space>
              <Button
                icon={<CopyOutlined />}
                onClick={handleBatchCopyThemes}
                disabled={savedStories.length === 0}
              >
                批量复制主题
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleBatchDownloadStories}
                disabled={savedStories.length === 0}
              >
                批量下载(ZIP)
              </Button>
            </Space>
            <Button onClick={() => setStoryModalVisible(false)}>
              关闭
            </Button>
          </div>
        }
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
              共 {savedStories.length} 条（正文内容已移除）
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
              {savedStories.map((story) => {
                return (
                  <Card
                    key={story.id}
                    size="small"
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
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
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyTheme(story.theme)}
                          title="复制主题"
                        >
                          复制主题
                        </Button>
                        
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => {
                            if (!story.content || !story.content.trim()) {
                              alert('该小说没有可下载的内容');
                              return;
                            }
                            const safeTheme = (story.theme || '小说').replace(/[\\/:*?"<>|]/g, '_');
                            const content = `主题：${story.theme}\n\n${story.content}`;
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
                            alert(`已下载：${safeTheme}.txt`);
                          }}
                          title="下载小说"
                        >
                          下载
                        </Button>

                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={async () => {
                            await deleteStories([story.id]);
                            await loadSavedStories(storyCategory);
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
                      {story.content && (
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
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
                );
              })}
            </Space>
          )}
        </div>
      </Modal>
    </div>
  );
}