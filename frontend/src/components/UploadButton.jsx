import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, message, Modal, Radio, Select } from "antd";
import { UploadOutlined } from "@ant-design/icons";

export default function UploadButton({
  onUpload,
  projects = [],
  requireProject = true
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("existing");
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);
  const pendingPayloadRef = useRef({});

  const canUseExistingProject = projects.length > 0;

  const existingProjectOptions = useMemo(
    () => projects.map(project => ({ label: project.name, value: project.id })),
    [projects]
  );

  useEffect(() => {
    if (!requireProject) {
      return;
    }

    if (!canUseExistingProject) {
      setMode("new");
      setProjectId("");
      return;
    }

    if (!projectId || !projects.some(project => project.id === projectId)) {
      setProjectId(projects[0].id);
    }
  }, [canUseExistingProject, projectId, projects, requireProject]);

  const openFileDialog = payload => {
    pendingPayloadRef.current = payload;
    if (!fileInputRef.current) {
      throw new Error("文件选择器初始化失败");
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const buildPayload = () => {
    if (!requireProject) {
      return {};
    }

    if (mode === "existing") {
      if (!projectId) {
        throw new Error("请先选择项目");
      }
      return { projectId };
    }

    if (!newProjectName.trim()) {
      throw new Error("请输入新项目名称");
    }

    return {
      newProjectName: newProjectName.trim()
    };
  };

  const handleButtonClick = () => {
    if (!requireProject) {
      try {
        openFileDialog({});
      } catch (error) {
        message.error(error.message || "无法打开文件选择器");
      }
      return;
    }

    setOpen(true);
  };

  const handleChooseFiles = () => {
    try {
      openFileDialog(buildPayload());
    } catch (error) {
      message.error(error.message || "上传参数不合法");
    }
  };

  const handleFileChange = async event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      setUploading(true);
      await onUpload(files, pendingPayloadRef.current || {});
      setOpen(false);
      setNewProjectName("");
    } catch (error) {
      const errorMessage = error?.response?.data?.error || error?.message || "上传失败";
      message.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button icon={<UploadOutlined />} onClick={handleButtonClick}>
        上传 txt 文件
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {requireProject ? (
        <Modal
          title="上传前绑定项目"
          open={open}
          onCancel={() => {
            if (!uploading) {
              setOpen(false);
            }
          }}
          onOk={handleChooseFiles}
          okText={uploading ? "上传中..." : "选择文件并上传"}
          confirmLoading={uploading}
          okButtonProps={{ disabled: uploading }}
          cancelButtonProps={{ disabled: uploading }}
          destroyOnClose
        >
          <div style={{ marginBottom: 12 }}>
            <Radio.Group
              value={mode}
              onChange={event => setMode(event.target.value)}
              options={[
                {
                  label: "选择已有项目",
                  value: "existing",
                  disabled: !canUseExistingProject
                },
                {
                  label: "创建新项目",
                  value: "new"
                }
              ]}
            />
          </div>

          {mode === "existing" ? (
            <Select
              style={{ width: "100%" }}
              placeholder="请选择项目"
              options={existingProjectOptions}
              value={projectId}
              onChange={setProjectId}
            />
          ) : (
            <Input
              value={newProjectName}
              onChange={event => setNewProjectName(event.target.value)}
              placeholder="请输入新项目名称"
              maxLength={30}
            />
          )}
        </Modal>
      ) : null}
    </>
  );
}
