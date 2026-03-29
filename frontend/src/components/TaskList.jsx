import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, message, Modal, Select, Space, Tabs } from "antd";
import {
  configTasks,
  deleteTasks,
  downloadTasks,
  getModels,
  getProjects,
  getPrompts,
  getTasks,
  startTasks,
  uploadFiles
} from "../api";
import AiConfigDrawer from "./AiConfigDrawer";
import ProjectManagerDrawer from "./ProjectManagerDrawer";
import TaskTable from "./TaskTable";
import UploadButton from "./UploadButton";

const GLM_RATE_LIMIT_MODEL = "glm-4.7-flash";
const GLM_BATCH_INTERVAL_MS = 1000;

export default function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [models, setModels] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);

  const [projectIdFilter, setProjectIdFilter] = useState("ALL");
  const [statusTab, setStatusTab] = useState("ALL");

  const buildTaskQuery = useCallback(() => {
    const query = {};
    if (projectIdFilter !== "ALL") {
      query.projectId = projectIdFilter;
    }
    return query;
  }, [projectIdFilter]);

  const loadTaskList = useCallback(async () => {
    const list = await getTasks(buildTaskQuery());
    setTasks(list);
    setSelected([]);
  }, [buildTaskQuery]);

  const loadProjectsAndTypes = useCallback(async () => {
    const projectList = await getProjects();
    setProjects(projectList || []);
  }, []);

  const loadBasicData = useCallback(async () => {
    const [modelList, promptList] = await Promise.all([getModels(), getPrompts()]);
    setModels(modelList || []);
    setPrompts(promptList || []);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadBasicData(), loadProjectsAndTypes(), loadTaskList()]);
  }, [loadBasicData, loadProjectsAndTypes, loadTaskList]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    loadTaskList();
  }, [loadTaskList]);

  useEffect(() => {
    if (
      projectIdFilter !== "ALL" &&
      !projects.some(project => project.id === projectIdFilter)
    ) {
      setProjectIdFilter("ALL");
    }
  }, [projects, projectIdFilter]);

  const displayedTasks =
    statusTab === "ALL" ? tasks : tasks.filter(task => task.status === Number(statusTab));

  const handleUpload = async (files, projectPayload) => {
    const list = await uploadFiles(files, projectPayload);
    await Promise.all([loadProjectsAndTypes(), loadTaskList()]);
    messageApi.success(`成功上传 ${list.length} 个文件`);
  };

  const handleConfig = async config => {
    const ids = selected.length ? selected : displayedTasks.map(task => task.id);
    if (!ids.length) {
      messageApi.warning("当前筛选条件下没有可配置任务");
      return;
    }

    await configTasks({ ids, ...config });
    await loadTaskList();
    messageApi.success("配置已应用");
    setAiConfigOpen(false);
  };

  const handleStart = async ids => {
    if (!ids.length) {
      messageApi.warning("请先选择任务");
      return;
    }

    setTasks(current =>
      current.map(task => (ids.includes(task.id) ? { ...task, status: 2 } : task))
    );

    const selectedTasks = tasks.filter(task => ids.includes(task.id));
    const shouldThrottleGlmBatch =
      ids.length > 1 && selectedTasks.some(task => task.model === GLM_RATE_LIMIT_MODEL);
    const maxConcurrency = shouldThrottleGlmBatch ? 1 : 50;
    const pendingIds = [...ids];

    const pollTasks = async () => {
      const latest = await getTasks(buildTaskQuery());
      setTasks(latest);
    };

    const runSingleTask = async taskId => {
      try {
        await startTasks({ ids: [taskId] });
      } catch (error) {
        console.log(error);
      } finally {
        await pollTasks();
      }
    };

    const workerCount = Math.min(maxConcurrency, pendingIds.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (pendingIds.length > 0) {
        const nextId = pendingIds.shift();
        if (!nextId) {
          return;
        }
        await runSingleTask(nextId);
        if (shouldThrottleGlmBatch && pendingIds.length > 0) {
          await new Promise(resolve => setTimeout(resolve, GLM_BATCH_INTERVAL_MS));
        }
      }
    });

    messageApi.success("任务已启动，处理中...");
    if (shouldThrottleGlmBatch) {
      messageApi.info(`检测到 ${GLM_RATE_LIMIT_MODEL}，批量处理已切换为串行模式，任务间隔 1 秒`);
    }
    await Promise.all(workers);
    const latest = await getTasks(buildTaskQuery());
    setTasks(latest);
    const scopedTasks = latest.filter(task => ids.includes(task.id));
    const successCount = scopedTasks.filter(task => task.status === 1).length;
    const failedTasks = scopedTasks.filter(task => task.status === 3);
    const emptyResultCount = failedTasks.filter(task => task.errorMessage === "AI返回空结果").length;
    messageApi.success(`处理完成：成功 ${successCount} 个，失败 ${failedTasks.length} 个（其中空结果 ${emptyResultCount} 个）`);
  };

  const handleDelete = async ids => {
    if (!ids.length) {
      return;
    }
    await deleteTasks(ids);
    await Promise.all([loadProjectsAndTypes(), loadTaskList()]);
    messageApi.success("任务已删除");
  };

  const confirmBatchStart = ids => {
    if (!ids.length) {
      messageApi.warning("请先选择任务");
      return;
    }
    modal.confirm({
      title: "确认批量处理",
      content: `确定开始处理这 ${ids.length} 个任务吗？`,
      okText: "确认处理",
      cancelText: "取消",
      onOk: () => {
        void handleStart(ids);
      }
    });
  };

  const confirmBatchDelete = ids => {
    if (!ids.length) {
      messageApi.warning("请先选择任务");
      return;
    }
    modal.confirm({
      title: "确认批量删除",
      content: `确定删除这 ${ids.length} 个任务吗？删除后不可恢复。`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await handleDelete(ids);
      }
    });
  };

  const handleDownload = async ids => {
    if (!ids.length) {
      return;
    }

    const { data, headers } = await downloadTasks(ids);
    const disposition = headers["content-disposition"] || "";
    let fileName = decodeURIComponent((disposition.match(/filename="?([^"]+)"?/) || [])[1] || "result.txt");

    if (ids.length === 1) {
      const task = tasks.find(item => item.id === ids[0]);
      if (task?.fileName) {
        fileName = task.fileName;
      }
    }

    let fileType = "text/plain";
    if (
      fileName.toLowerCase().endsWith(".zip") ||
      (headers["content-type"] && headers["content-type"].includes("zip"))
    ) {
      fileType = "application/zip";
      if (!fileName.toLowerCase().endsWith(".zip")) {
        fileName = "results.zip";
      }
    }

    const url = window.URL.createObjectURL(new Blob([data], { type: fileType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const statusTabItems = [
    { key: "ALL", label: "全部任务" },
    { key: "0", label: "未处理" },
    { key: "2", label: "处理中" },
    { key: "1", label: "已完成" },
    { key: "3", label: "处理失败" }
  ];

  return (
    <div style={{ width: 1600, margin: "0 auto" }}>
      {contextHolder}
      {modalContextHolder}
      <h2 style={{ marginTop: 0 }}>任务列表</h2>
      <Space style={{ marginBottom: 12 }} wrap>
        <UploadButton
          onUpload={handleUpload}
          projects={projects}
        />

        <Button onClick={() => setProjectManagerOpen(true)}>项目管理</Button>

        <Button
          type="primary"
          onClick={() => setAiConfigOpen(true)}
          disabled={!displayedTasks.length}
        >
          批量AI配置
        </Button>

        <Button
          type="primary"
          onClick={() => confirmBatchStart(selected.length ? selected : displayedTasks.map(task => task.id))}
          disabled={!selected.length}
        >
          批量处理
        </Button>

        <Button
          type="primary"
          onClick={() => handleDownload(selected.length ? selected : displayedTasks.filter(task => task.status === 1).map(task => task.id))}
          disabled={!selected.length}
        >
          批量下载
        </Button>

        <Button
          danger
          onClick={() => confirmBatchDelete(selected.length ? selected : displayedTasks.map(task => task.id))}
          disabled={!selected.length}
        >
          批量删除
        </Button>
      </Space>

      <div style={{ marginBottom: 8 }}>
        <Select
          style={{ width: 280 }}
          value={projectIdFilter}
          onChange={value => {
            setProjectIdFilter(value);
            setSelected([]);
          }}
          options={[
            { label: "全部项目", value: "ALL" },
            ...projects.map(project => ({
              label: project.name,
              value: project.id
            }))
          ]}
        />
      </div>

      <Tabs
        activeKey={statusTab}
        items={statusTabItems}
        onChange={key => {
          setStatusTab(key);
          setSelected([]);
        }}
        style={{ marginBottom: 4 }}
      />

      <TaskTable
        tasks={displayedTasks}
        setTasks={setTasks}
        models={models}
        prompts={prompts}
        selected={selected}
        setSelected={setSelected}
        onConfigAI={taskIds => {
          setSelected(taskIds);
          setAiConfigOpen(true);
        }}
        onStart={handleStart}
        onDownload={handleDownload}
        onDelete={handleDelete}
        refresh={loadTaskList}
      />

      <Drawer
        title="AI配置"
        open={aiConfigOpen}
        onClose={() => setAiConfigOpen(false)}
        destroyOnClose
        width={800}
      >
        <AiConfigDrawer
          models={models}
          prompts={prompts}
          onSubmit={handleConfig}
          initialValues={(() => {
            const task = tasks.find(item => item.id === selected[0]);
            if (task) {
              return {
                model: task.model || undefined,
                promptType: task.promptType || undefined,
                promptKey: task.promptKey || undefined,
                promptContent: task.promptContent || undefined
              };
            }
            return {};
          })()}
        />
      </Drawer>

      <ProjectManagerDrawer
        open={projectManagerOpen}
        onClose={() => setProjectManagerOpen(false)}
        projects={projects}
        onRefresh={async () => {
          await Promise.all([loadProjectsAndTypes(), loadTaskList()]);
        }}
      />
    </div>
  );
}
