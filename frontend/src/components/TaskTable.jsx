import React, { useMemo, useState } from "react";
import { Button, Drawer, Input, message, Progress, Table, Tag, Tooltip } from "antd";
import { getOriginalById, overwriteOriginal } from "../api";

export default function TaskTable({
  tasks,
  setTasks,
  prompts,
  selected,
  setSelected,
  onConfigAI,
  onStart,
  onDownload
}) {
  const [previewTask, setPreviewTask] = useState(null);
  const [editedResult, setEditedResult] = useState("");
  const [savingPreview, setSavingPreview] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const promptLabelMap = useMemo(() => {
    const map = {};
    (prompts || []).forEach(prompt => {
      map[prompt.key] = prompt.label;
    });
    return map;
  }, [prompts]);

  const previewIndex = useMemo(() => {
    if (!previewTask) {
      return -1;
    }
    return tasks.findIndex(task => task.id === previewTask.id);
  }, [previewTask, tasks]);

  const openPreview = async row => {
    try {
      const rawOriginal = await getOriginalById(row.id);
      const originalContent =
        typeof rawOriginal === "string" ? rawOriginal : rawOriginal?.content || row.originalContent || "";

      setPreviewTask({
        ...row,
        originalContent,
        result: row.result || ""
      });
      setEditedResult(row.result || "");
    } catch (error) {
      if (row.originalContent) {
        setPreviewTask({
          ...row,
          originalContent: row.originalContent,
          result: row.result || ""
        });
        setEditedResult(row.result || "");
        messageApi.warning("原文文件缺失，已使用任务缓存内容");
        return;
      }
      messageApi.error(error?.response?.data?.error || "加载原文失败");
    }
  };

  const handleSavePreview = async () => {
    if (!previewTask) {
      return;
    }

    try {
      setSavingPreview(true);
      await overwriteOriginal(previewTask.id, editedResult);
      setTasks(current =>
        current.map(task =>
          task.id === previewTask.id ? { ...task, result: editedResult } : task
        )
      );
      setPreviewTask(current => (current ? { ...current, result: editedResult } : current));
      messageApi.success("改写结果已保存");
    } catch (error) {
      messageApi.error(error?.response?.data?.error || "保存失败");
    } finally {
      setSavingPreview(false);
    }
  };

  const switchPreview = async offset => {
    if (previewIndex === -1) {
      return;
    }
    const nextIndex = previewIndex + offset;
    if (nextIndex < 0 || nextIndex >= tasks.length) {
      return;
    }
    await openPreview(tasks[nextIndex]);
  };

  const columns = [
    {
      title: "文件名",
      dataIndex: "fileName",
      width: 70,
      ellipsis: true,
      sorter: (a, b) =>
        String(a.fileName || "").localeCompare(String(b.fileName || ""), "zh-Hans-CN", {
          numeric: true,
          sensitivity: "base"
        }),
      sortDirections: ["ascend", "descend"],
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="按文件名过滤"
            value={selectedKeys[0] || ""}
            onChange={event => setSelectedKeys(event.target.value ? [event.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 180, marginBottom: 8, display: "block" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="primary" size="small" onClick={() => confirm()}>
              筛选
            </Button>
            <Button size="small" onClick={() => clearFilters?.()}>
              重置
            </Button>
          </div>
        </div>
      ),
      onFilter: (value, record) =>
        (record.fileName || "").toLowerCase().includes(String(value || "").toLowerCase())
    },
    {
      title: "项目",
      dataIndex: "projectName",
      width: 25,
      ellipsis: true,
      render: value => value || "--"
    },
    {
      title: "模型",
      dataIndex: "model",
      width: 30,
      ellipsis: true,
      render: value => value || "--"
    },
    {
      title: "提示词",
      width: 30,
      render: (_, row) => {
        if (row.promptType === "custom") {
          return row.promptContent ? `${row.promptContent.slice(0, 18)}...` : "--";
        }
        return promptLabelMap[row.promptKey] || "--";
      }
    },
    {
      title: "进度",
      width: 20,
      render: (_, row) => {
        if (row.status === 2) {
          return <Progress percent={row.progress || 70} status="active" size="small" showInfo={false} />;
        }
        if (row.status === 1) {
          return <Progress percent={100} status="success" size="small" />;
        }
        if (row.status === 3) {
          const errorMessage = row.errorMessage || "\u5904\u7406\u5931\u8d25";
          return (
            <Tooltip title={`\u5931\u8d25\uff1a${errorMessage}`}>
              <Progress percent={100} status="exception" size="small" />
            </Tooltip>
          );
        }
        return null;
      }
    },
    // {
    //   title: "耗时/秒",
    //   dataIndex: "processTime",
    //   width: 150,
    //   render: value => value || "--"
    // },
    {
      title: "失败原因",
      dataIndex: "errorMessage",
      width: 10,
      ellipsis: true,
      render: (_, row) => (row.status === 3 ? row.errorMessage || "--" : "--")
    },
    {
      title: "时间",
      dataIndex: "endTime",
      width: 20,
      render: value => {
        if (!value) {
          return "--";
        }
        const date = new Date(Number(value));
        if (Number.isNaN(date.getTime())) {
          return "--";
        }
        const pad = n => String(n).padStart(2, "0");
        return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      }
    },
    {
      title: "字数",
      width: 20,
      sorter: (a, b) => (a.result || "").length - (b.result || "").length,
      sortDirections: ["ascend", "descend"],
      render: (_, row) => {
        const originalLength = (row.originalContent || "").length;
        const resultLength = (row.result || "").length;
        return resultLength ? `${originalLength} -> ${resultLength}` : originalLength;
      }
    },
    {
      title: "操作",
      key: "action",
      width: 25,
      // fixed: "right",
      render: (_, row) => {
        const processing = row.status === 2;
        return (
          <>
            {/* <Button
              size="small"
              onClick={() =>
                onConfigAI([row.id], {
                  model: row.model || undefined,
                  promptType: row.promptType || undefined,
                  promptKey: row.promptKey || undefined,
                  promptContent: row.promptContent || undefined
                })
              }
              disabled={processing}
            >
              AI配置
            </Button> */}
            {/* <Button
              size="small"
              style={{ marginLeft: 4 }}
              onClick={() => {
                if (!row.model || (!row.promptKey && row.promptType !== "custom")) {
                  Modal.warning({
                    title: "提示",
                    content: "请先配置AI模型和提示词"
                  });
                  return;
                }
                onStart([row.id]);
              }}
              disabled={processing}
            >
              处理
            </Button> */}
            <Button
              size="small"
              style={{ marginLeft: 4 }}
              onClick={() => onDownload([row.id])}
              disabled={processing || row.status !== 1}
            >
              下载
            </Button>
            <Button
              size="small"
              style={{ marginLeft: 4 }}
              onClick={() => openPreview(row)}
              disabled={row.status !== 1}
            >
              预览
            </Button>
          </>
        );
      }
    }
  ];

  return (
    <div>
      {contextHolder}
      <Table
        rowKey="id"
        bordered
        size="small"
        pagination={{
          showSizeChanger: true,
          pageSizeOptions: ["20", "50", "100", "200", "500", "1000"]
        }}
        dataSource={tasks}
        rowSelection={{
          type: "checkbox",
          columnWidth: 10,
          selectedRowKeys: selected,
          onChange: setSelected
        }}
        columns={columns}
      />

      <Drawer
        title={
          <div>
            <Tag bordered={false}>
              <h3 style={{ display: "inline-block", margin: 0 }}>{previewTask?.fileName}</h3>
            </Tag>
            <Tag color="blue">{previewTask?.projectName || "未分组"}</Tag>
            <Tag color="#2db7f5">{promptLabelMap[previewTask?.promptKey] || "自定义"}</Tag>
          </div>
        }
        placement="left"
        onClose={() => setPreviewTask(null)}
        open={!!previewTask}
        width={1600}
        destroyOnClose
      >
        {previewTask && (
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <h4>原文（{(previewTask.originalContent || "").length}字）</h4>
              <Input.TextArea
                value={previewTask.originalContent || ""}
                autoSize={{ minRows: 18, maxRows: 30 }}
                readOnly
                style={{ background: "#fafafa" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <h4>改写结果（{editedResult.length}字）</h4>
              <Input.TextArea
                value={editedResult}
                autoSize={{ minRows: 18, maxRows: 30 }}
                onChange={event => setEditedResult(event.target.value)}
              />
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Button onClick={() => switchPreview(-1)} disabled={previewIndex <= 0}>
                  上一个
                </Button>
                <Button
                  onClick={() => switchPreview(1)}
                  disabled={previewIndex < 0 || previewIndex >= tasks.length - 1}
                >
                  下一个
                </Button>
                <Button type="primary" loading={savingPreview} onClick={handleSavePreview}>
                  保存
                </Button>
                <Button onClick={() => onStart([previewTask.id])}>重新处理</Button>
                <Button onClick={() => onDownload([previewTask.id])}>下载</Button>
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(editedResult);
                      messageApi.success("内容已复制");
                    } catch (error) {
                      messageApi.error("复制失败，请手动复制");
                    }
                  }}
                >
                  复制
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
