import React, { useState } from "react";
import { Select, Input, Button, message } from "antd";
import { savePrompt } from "../api";

export default function PromptManager({ prompts, dispatch, files }) {
  const [custom, setCustom] = useState("");

  // 一键设置全部
  const setAllPrompt = value => {
    dispatch({ type: 'setFiles', files: files.map(f => ({ ...f, prompt: value })) });
  };

  // 保存自定义提示词
  const handleSave = async () => {
    if (!custom) return message.warning("请输入提示词");
    const newPrompts = await savePrompt(custom);
    message.success("已保存提示词");
    dispatch({ type: "setPrompts", prompts: newPrompts });
    setCustom("");
  };

  return (
    <div style={{ margin: '16px 0' }}>
      <span>提示词：</span>
      <Select
        style={{ width: 320 }}
        options={prompts.map(m => ({ value: m, label: m }))}
        onChange={setAllPrompt}
        placeholder="为全部设置提示词"
      />
      <Input style={{ width: 240, margin: '0 8px' }} value={custom} onChange={e => setCustom(e.target.value)} placeholder="自定义提示词" />
      <Button type="primary" onClick={handleSave} >保存为预设</Button>
      <span style={{ marginLeft: 16, fontSize: 12, color: '#888' }}>（每行文件可单独设置提示词）</span>
    </div>
  );
}

