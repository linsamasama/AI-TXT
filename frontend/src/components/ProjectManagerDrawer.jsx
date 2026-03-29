import React, { useMemo, useState } from "react";
import { Button, Drawer, Input, message, Modal, Select, Space, Table } from "antd";
import { createProject, deleteProject, updateProject } from "../api";

export default function ProjectManagerDrawer({
  open,
  onClose,
  projects = [],
  onRefresh
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingProject, setDeletingProject] = useState(null);
  const [targetProjectId, setTargetProjectId] = useState("");


  const targetOptions = useMemo(() => {
    if (!deletingProject) {
      return [];
    }
    return projects
      .filter(project => project.id !== deletingProject.id)
      .map(project => ({ label: project.name, value: project.id }));
  }, [deletingProject, projects]);

  const resetCreateForm = () => {
    setNewName("");
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      message.error("请输入项目名称");
      return;
    }
    try {
      setSubmitting(true);
      await createProject({ name: newName.trim() });
      message.success("项目创建成功");
      resetCreateForm();
      await onRefresh();
    } catch (error) {
      message.error(error?.response?.data?.error || "创建项目失败");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = project => {
    setEditingId(project.id);
    setEditingName(project.name || "");
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditingName("");
  };

  const handleSaveEdit = async projectId => {
    if (!editingName.trim()) {
      message.error("项目名称不能为空");
      return;
    }

    try {
      setSubmitting(true);
      await updateProject(projectId, { name: editingName.trim() });
      message.success("项目更新成功");
      cancelEdit();
      await onRefresh();
    } catch (error) {
      message.error(error?.response?.data?.error || "更新项目失败");
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteDialog = project => {
    setDeletingProject(project);
    const nextTarget = projects.find(item => item.id !== project.id);
    setTargetProjectId(nextTarget?.id || "");
  };

  const closeDeleteDialog = () => {
    setDeletingProject(null);
    setTargetProjectId("");
  };

  const handleDelete = async () => {
    if (!deletingProject) {
      return;
    }

    if (deletingProject.taskCount > 0 && !targetProjectId) {
      message.error("该项目下有任务，请选择迁移目标项目");
      return;
    }

    try {
      setSubmitting(true);
      await deleteProject(
        deletingProject.id,
        deletingProject.taskCount > 0 ? targetProjectId : undefined
      );
      message.success("项目删除成功");
      closeDeleteDialog();
      if (editingId === deletingProject.id) {
        cancelEdit();
      }
      await onRefresh();
    } catch (error) {
      message.error(error?.response?.data?.error || "删除项目失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Drawer
        title="项目管理"
        open={open}
        onClose={onClose}
        width={860}
        destroyOnClose
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Input
            placeholder="新项目名称"
            value={newName}
            maxLength={30}
            onChange={event => setNewName(event.target.value)}
          />
          <Button type="primary" loading={submitting} onClick={handleCreate}>
            新建项目
          </Button>
        </div>

        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8 }}
          dataSource={projects}
          columns={[
            {
              title: "项目名称",
              dataIndex: "name",
              render: (value, row) => (
                editingId === row.id ? (
                  <Input
                    value={editingName}
                    maxLength={30}
                    onChange={event => setEditingName(event.target.value)}
                  />
                ) : value
              )
            },
            {
              title: "任务数",
              dataIndex: "taskCount",
              width: 90,
              render: value => value || 0
            },
            {
              title: "操作",
              key: "action",
              width: 240,
              render: (_, row) => (
                editingId === row.id ? (
                  <Space>
                    <Button size="small" type="primary" loading={submitting} onClick={() => handleSaveEdit(row.id)}>
                      保存
                    </Button>
                    <Button size="small" onClick={cancelEdit}>
                      取消
                    </Button>
                  </Space>
                ) : (
                  <Space>
                    <Button size="small" onClick={() => startEdit(row)}>
                      编辑
                    </Button>
                    <Button size="small" danger onClick={() => openDeleteDialog(row)}>
                      删除
                    </Button>
                  </Space>
                )
              )
            }
          ]}
        />
      </Drawer>

      <Modal
        title="删除项目"
        open={!!deletingProject}
        onCancel={closeDeleteDialog}
        onOk={handleDelete}
        okText="确认删除"
        cancelText="取消"
        confirmLoading={submitting}
      >
        {deletingProject && deletingProject.taskCount > 0 ? (
          <>
            <p>该项目下有 {deletingProject.taskCount} 个任务，请先选择迁移目标。</p>
            <Select
              style={{ width: "100%" }}
              placeholder="选择迁移目标项目"
              value={targetProjectId}
              options={targetOptions}
              onChange={setTargetProjectId}
            />
          </>
        ) : (
          <p>确认删除项目“{deletingProject?.name}”？该操作不可恢复。</p>
        )}
      </Modal>
    </>
  );
}

