import React, { useState, useEffect } from "react";
import { Form, Select, Radio, Input, Button, message } from "antd";
import { savePrompt } from "../api";

export default function AiConfigDrawer({ models, prompts, onSubmit, initialValues }) {
  const [form] = Form.useForm();
  const [promptType, setPromptType] = useState(initialValues?.promptType || "preset");
  const [promptContent, setPromptContent] = useState(initialValues?.promptKey);
  const [showNewPrompt, setShowNewPrompt] = useState(false);

  // 当initialValues变更时，重设表单与promptType
  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues);
      setPromptType(initialValues.promptType || "preset");
    }
  }, [initialValues, form]);

  useEffect(()=>{

  },[])

  // 新增提示词
  const handleSavePrompt = async () => {
    const { newKey, newLabel, newContent } = form.getFieldsValue();
    if (!newKey || !newLabel || !newContent) return message.error("必须填写完整");
    await savePrompt({ key: newKey, label: newLabel, content: newContent });
    message.success("新提示词保存成功");
    setShowNewPrompt(false);
    form.resetFields(["newKey", "newLabel", "newContent"]);
  };
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onSubmit}
      initialValues={initialValues}
      onValuesChange={({promptKey})=>{
        setPromptContent(promptKey)
      }}
    >
      <Form.Item name="model" label="选择模型" rules={[{ required: true }]}>
        <Select
          showSearch
          placeholder="请选择模型"
          options={models.map(m => ({ label: <><b style={{paddingRight:20}}>{m.label}</b><span style={{fontSize:13}}>{m.description}</span></>, value: m.id }))}
        />
      </Form.Item>
      <Form.Item name="promptType" initialValue="preset" label="提示词类型">
        <Radio.Group
          value={promptType}
          onChange={e => {
            setPromptType(e.target.value);
            form.setFieldsValue({ promptType: e.target.value });
          }}
        >
          <Radio value="preset">预设提示词</Radio>
          <Radio value="custom">自定义提示词</Radio>
        </Radio.Group>
      </Form.Item>
      {promptType === "preset" &&
        <Form.Item name="promptKey" label="选择提示词" rules={[{ required: true }]} >
          <Select
            placeholder="请选择"
            options={prompts.map(p => ({ label: p.label, value: p.key }))}
          />
        </Form.Item>
      }
      <p>{prompts.find(prompt=>prompt.key===promptContent)?.content || ''}</p>
      {promptType === "preset" && (
        <>
          <Button size="small" style={{ marginBottom: 8 }} onClick={() => setShowNewPrompt(s => !s)}>
            {showNewPrompt ? "取消" : "新增提示词"}
          </Button>
          {showNewPrompt && (
            <div style={{ border: '1px solid #eee', marginBottom: 12, padding: 12 }}>
              <Form.Item name="newKey" label="标识 (唯一英文字符串)" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="newLabel" label="标题（用于下拉显示）" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="newContent" label="指令内容" rules={[{ required: true }]}>
                <Input.TextArea autoSize rows={3} />
              </Form.Item>
              <Button type="primary" size="small" onClick={handleSavePrompt}>保存</Button>
            </div>
          )}
        </>
      )}
      {promptType === "custom" && (
          <Form.Item name="promptContent" label="自定义指令" rules={[{ required: true }]}>
            <Input.TextArea autoSize rows={4} />
          </Form.Item>
      )}
      <Form.Item>
        <Button type="primary" htmlType="submit">确认配置</Button>
      </Form.Item>
    </Form>
  );
}