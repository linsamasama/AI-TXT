import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, message, Select, Space, Table, Tag } from "antd";
import {
  deleteTopLinesFiles,
  downloadTopLinesFiles,
  getProjects,
  getTopLinesFiles,
  uploadTopLinesFiles
} from "../api";
import UploadButton from "./UploadButton";

function getStatusMeta(record) {
  if (record.status === 1) {
    return { color: "success", label: "已完成" };
  }
  if (record.status === 3) {
    return { color: "error", label: "失败" };
  }
  return { color: "default", label: "待处理" };
}

export default function TopLinesPanel() {
  const [files, setFiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [projectIdFilter, setProjectIdFilter] = useState("ALL");
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const loadProjects = useCallback(async () => {
    const projectList = await getProjects();
    setProjects(projectList || []);
  }, []);

  const loadFiles = useCallback(async () => {
    const list = await getTopLinesFiles(
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

  const completedFiles = useMemo(() => {
    return files.filter(file => file.status === 1 && file.resultContentId);
  }, [files]);

  const selectedFiles = useMemo(() => {
    return files.filter(file => selectedRowKeys.includes(file.id));
  }, [files, selectedRowKeys]);

  const completedSelectedFiles = useMemo(() => {
    return selectedFiles.filter(file => file.status === 1 && file.resultContentId);
  }, [selectedFiles]);

  const stats = useMemo(() => {
    return {
      total: files.length,
      done: files.filter(file => file.status === 1).length,
      failed: files.filter(file => file.status === 3).length
    };
  }, [files]);

  const handleUpload = async (uploadFiles, projectPayload) => {
    const uploadedFiles = await uploadTopLinesFiles(uploadFiles, projectPayload);
    await Promise.all([loadProjects(), loadFiles()]);
    setSelectedRowKeys(uploadedFiles.map(file => file.id));
    messageApi.success(`已处理 ${uploadedFiles.length} 个 txt 文件`);
  };

  const triggerBrowserDownload = async targetFiles => {
    const ids = targetFiles
      .filter(file => file.status === 1 && file.resultContentId)
      .map(file => file.id);

    if (!ids.length) {
      messageApi.warning("当前没有可下载的结果");
      return;
    }

    try {
      setDownloading(true);
      const { data, headers } = await downloadTopLinesFiles(ids);
      const disposition = headers["content-disposition"] || "";
      const fileName = decodeURIComponent(
        (disposition.match(/filename="?([^"]+)"?/) || [])[1] || "result.txt"
      );

      const url = window.URL.createObjectURL(
        new Blob([data], { type: "text/plain" })
      );
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
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async ids => {
    if (!ids.length) {
      messageApi.warning("请先选择需要删除的文件");
      return;
    }

    try {
      setDeleting(true);
      const nextFiles = await deleteTopLinesFiles(ids);
      setFiles(nextFiles || []);
      setSelectedRowKeys(current => current.filter(id => !ids.includes(id)));
      messageApi.success(`已删除 ${ids.length} 条记录`);
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

  const columns = [
    {
      title: "原始文件",
      dataIndex: "fileName",
      width: 340,
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
      width: 100,
      render: (_, record) => {
        const statusMeta = getStatusMeta(record);
        return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>;
      }
    },
    {
      title: "原始行数",
      dataIndex: "originalLineCount",
      width: 100
    },
    {
      title: "截取行数",
      dataIndex: "extractedLineCount",
      width: 100
    },
    {
      title: "预览",
      width: 420,
      render: (_, record) => (
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 120,
            overflow: "auto"
          }}
        >
          {record.previewText || "--"}
        </div>
      )
    },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={() => triggerBrowserDownload([record])}
            disabled={record.status !== 1 || !record.resultContentId}
            loading={downloading}
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
    <div style={{ width: 1600, maxWidth: "100%", margin: "0 auto" }}>
      {contextHolder}
      <h2 style={{ marginTop: 0 }}>前20行截取</h2>
      <p style={{ color: "#666", marginTop: 0 }}>
        上传多个 txt 后，系统会直接使用 Node.js 截取每个文件的前 20 行。批量下载时，会按原始文件名作为标题，合并到同一个 txt 文件里。
      </p>

      <Space style={{ marginBottom: 12 }} wrap>
        <UploadButton
          onUpload={handleUpload}
          projects={projects}
          requireProject={false}
        />
        <Button
          onClick={() => setSelectedRowKeys(completedFiles.map(file => file.id))}
          disabled={!completedFiles.length}
        >
          全选可下载文件
        </Button>
        <Button
          type="primary"
          onClick={() => triggerBrowserDownload(completedSelectedFiles)}
          disabled={!completedSelectedFiles.length}
          loading={downloading}
        >
          合并下载选中
        </Button>
        <Button
          onClick={() => triggerBrowserDownload(completedFiles)}
          disabled={!completedFiles.length}
          loading={downloading}
        >
          合并下载全部
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
        <Tag color="success">已完成：{stats.done}</Tag>
        <Tag color="error">失败：{stats.failed}</Tag>
      </Space>

      <Table
        rowKey="id"
        bordered
        size="small"
        dataSource={files}
        columns={columns}
        scroll={{ x: 1320 }}
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
