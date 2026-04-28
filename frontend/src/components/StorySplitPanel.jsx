import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, message, Progress, Select, Space, Table, Tag } from "antd";
import {
  deleteSplitStoryFiles,
  downloadTasks,
  getProjects,
  getSplitStoryFiles,
  startSplitStoryFiles,
  uploadSplitStoryFiles
} from "../api";
import UploadButton from "./UploadButton";

function getStatusMeta(record) {
  if (record.status === 2) {
    return { color: "processing", label: "拆分中" };
  }
  if (record.status === 1) {
    return { color: "success", label: "已完成" };
  }
  if (record.status === 3) {
    return { color: "error", label: "失败" };
  }
  return { color: "default", label: "待拆分" };
}

function renderStoryTitles(record) {
  if (!Array.isArray(record.storyTitles) || !record.storyTitles.length) {
    return "--";
  }

  return (
    <Space size={[4, 4]} wrap>
      {record.storyTitles.map((title, index) => (
        <Tag key={`${record.id}_${index}`} color="blue">
          {title}
        </Tag>
      ))}
    </Space>
  );
}

export default function StorySplitPanel() {
  const [files, setFiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [projectIdFilter, setProjectIdFilter] = useState("ALL");
  const [splitting, setSplitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const loadProjects = useCallback(async () => {
    const projectList = await getProjects();
    setProjects(projectList || []);
  }, []);

  const loadFiles = useCallback(async () => {
    const list = await getSplitStoryFiles(
      projectIdFilter !== "ALL" ? { projectId: projectIdFilter } : {}
    );
    setFiles(list || []);
  }, [projectIdFilter]);

  useEffect(() => {
    void Promise.all([loadProjects(), loadFiles()]);
  }, [loadFiles, loadProjects]);

  useEffect(() => {
    if (
      projectIdFilter !== "ALL" &&
      !projects.some(project => project.id === projectIdFilter)
    ) {
      setProjectIdFilter("ALL");
    }
  }, [projectIdFilter, projects]);

  const selectedFiles = useMemo(() => {
    return files.filter(file => selectedRowKeys.includes(file.id));
  }, [files, selectedRowKeys]);

  const oneStoryFiles = useMemo(() => {
    return files.filter(file => Number(file.storyCount) === 1);
  }, [files]);

  const completedSelectedFiles = useMemo(() => {
    return selectedFiles.filter(file => file.status === 1 && file.resultTaskIds?.length);
  }, [selectedFiles]);

  const completedOneStoryFiles = useMemo(() => {
    return oneStoryFiles.filter(file => file.status === 1 && file.resultTaskIds?.length);
  }, [oneStoryFiles]);

  const stats = useMemo(() => {
    return {
      total: files.length,
      pending: files.filter(file => file.status === 0).length,
      processing: files.filter(file => file.status === 2).length,
      done: files.filter(file => file.status === 1).length,
      failed: files.filter(file => file.status === 3).length,
      oneStory: oneStoryFiles.length
    };
  }, [files, oneStoryFiles]);

  const handleUpload = async (uploadFiles, projectPayload) => {
    const uploadedFiles = await uploadSplitStoryFiles(uploadFiles, projectPayload);
    await Promise.all([loadProjects(), loadFiles()]);
    setSelectedRowKeys(uploadedFiles.map(file => file.id));
    messageApi.success(`已上传 ${uploadedFiles.length} 个 txt 文件`);
  };

  const handleStart = async ids => {
    if (!ids.length) {
      messageApi.warning("请先选择需要拆分的文件");
      return;
    }

    try {
      setSplitting(true);
      const result = await startSplitStoryFiles(ids);
      await loadFiles();

      const finishedCount = result?.files?.length || 0;
      const skipped = result?.skipped || [];

      if (finishedCount) {
        messageApi.success(`已完成 ${finishedCount} 个文件的拆分`);
      }
      if (skipped.length) {
        messageApi.warning(skipped.map(item => item.reason).join("，"));
      }
    } catch (error) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        "拆分失败";
      messageApi.error(errorMessage);
    } finally {
      setSplitting(false);
    }
  };

  const handleDownload = async targetFiles => {
    const completedFiles = targetFiles.filter(file => file.status === 1 && file.resultTaskIds?.length);
    const taskIds = completedFiles.flatMap(file => file.resultTaskIds);

    if (!taskIds.length) {
      messageApi.warning("当前没有可下载的拆分结果");
      return;
    }

    const zipFileName =
      taskIds.length > 1 ? `小说拆分_共${taskIds.length}个文件.zip` : undefined;

    try {
      const { data, headers } = await downloadTasks(taskIds, zipFileName);
      const disposition = headers["content-disposition"] || "";
      let fileName = decodeURIComponent(
        (disposition.match(/filename="?([^"]+)"?/) || [])[1] || "result.txt"
      );

      let fileType = "text/plain";
      if (
        fileName.toLowerCase().endsWith(".zip") ||
        (headers["content-type"] && headers["content-type"].includes("zip"))
      ) {
        fileType = "application/zip";
        fileName = zipFileName || fileName;
      }

      const url = window.URL.createObjectURL(new Blob([data], { type: fileType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        "下载失败";
      messageApi.error(errorMessage);
    }
  };

  const handleDelete = async ids => {
    if (!ids.length) {
      messageApi.warning("当前没有可删除的文件");
      return;
    }

    try {
      setDeleting(true);
      const nextFiles = await deleteSplitStoryFiles(ids);
      setFiles(nextFiles || []);
      setSelectedRowKeys(current => current.filter(id => !ids.includes(id)));
      messageApi.success(`已删除 ${ids.length} 个文件`);
    } catch (error) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        "删除失败";
      messageApi.error(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectOneStory = () => {
    setSelectedRowKeys(oneStoryFiles.map(file => file.id));
    if (oneStoryFiles.length) {
      messageApi.success(`已选中 ${oneStoryFiles.length} 个单故事文件`);
      return;
    }
    messageApi.warning("当前没有单故事文件");
  };

  const columns = [
    {
      title: "原始文件",
      dataIndex: "fileName",
      width: 360,
      ellipsis: true
    },
    {
      title: "项目",
      dataIndex: "projectName",
      width: 180,
      ellipsis: true,
      render: value => value || "--"
    },
    {
      title: "状态",
      width: 110,
      render: (_, record) => {
        const statusMeta = getStatusMeta(record);
        return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>;
      }
    },
    {
      title: "拆分进度",
      width: 320,
      render: (_, record) => (
        <div>
          <div style={{ marginBottom: 6 }}>{record.statusText || "--"}</div>
          <Progress
            percent={record.progress || 0}
            size="small"
            status={record.status === 3 ? "exception" : undefined}
          />
        </div>
      )
    },
    {
      title: "故事数",
      dataIndex: "storyCount",
      width: 90,
      render: value => (value > 0 ? value : "--")
    },
    {
      title: "标题",
      width: 340,
      render: (_, record) => renderStoryTitles(record)
    },
    {
      title: "操作",
      width: 220,
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            onClick={() => handleStart([record.id])}
            loading={splitting}
          >
            开始拆分
          </Button>
          <Button
            size="small"
            onClick={() => handleDownload([record])}
            disabled={record.status !== 1 || !record.resultTaskIds?.length}
          >
            下载
          </Button>
          <Button
            size="small"
            danger
            onClick={() => handleDelete([record.id])}
            loading={deleting}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ width: 1780, maxWidth: "100%", margin: "0 auto" }}>
      {contextHolder}
      <h2 style={{ marginTop: 0 }}>小说拆分</h2>
      <p style={{ color: "#666", marginTop: 0 }}>
        上传 txt 后，系统会直接用 Node.js 查找“第二个故事”这句话，并从这里截断成两个独立文件。
      </p>

      <Space style={{ marginBottom: 12 }} wrap>
        <UploadButton onUpload={handleUpload} projects={projects} />
        <Button
          type="primary"
          onClick={() => handleStart(selectedRowKeys)}
          disabled={!selectedRowKeys.length}
          loading={splitting}
        >
          批量拆分
        </Button>
        <Button onClick={handleSelectOneStory}>选中全部单故事</Button>
        <Button
          onClick={() => handleDownload(completedOneStoryFiles)}
          disabled={!completedOneStoryFiles.length}
        >
          下载单故事 ZIP
        </Button>
        <Button
          danger
          onClick={() => handleDelete(oneStoryFiles.map(file => file.id))}
          disabled={!oneStoryFiles.length}
          loading={deleting}
        >
          删除单故事
        </Button>
        <Button
          onClick={() => handleDownload(completedSelectedFiles)}
          disabled={!completedSelectedFiles.length}
        >
          下载选中 ZIP
        </Button>
        <Button
          danger
          onClick={() => handleDelete(selectedRowKeys)}
          disabled={!selectedRowKeys.length}
          loading={deleting}
        >
          删除选中
        </Button>
        <Select
          style={{ width: 260 }}
          value={projectIdFilter}
          onChange={value => {
            setProjectIdFilter(value);
            setSelectedRowKeys([]);
          }}
          options={[
            { label: "全部项目", value: "ALL" },
            ...projects.map(project => ({
              label: project.name,
              value: project.id
            }))
          ]}
        />
      </Space>

      <Space style={{ marginBottom: 12 }} wrap>
        <Tag color="blue">总文件数：{stats.total}</Tag>
        <Tag color="gold">待拆分：{stats.pending}</Tag>
        <Tag color="processing">拆分中：{stats.processing}</Tag>
        <Tag color="success">已完成：{stats.done}</Tag>
        <Tag color="cyan">单故事：{stats.oneStory}</Tag>
        <Tag color="error">失败：{stats.failed}</Tag>
      </Space>

      <Table
        rowKey="id"
        bordered
        size="small"
        dataSource={files}
        columns={columns}
        scroll={{ x: 1820 }}
        pagination={{
          showSizeChanger: true,
          pageSizeOptions: ["20", "50", "100", "300"],
          defaultPageSize: 20
        }}
        rowSelection={{
          type: "checkbox",
          selectedRowKeys,
          onChange: setSelectedRowKeys
        }}
      />
    </div>
  );
}
