import React, { useState } from "react";
import { Table, Select, Input, Button, Spin, message } from "antd";
import { processFile } from "../api";

export default function FileList({ files, models, prompts, dispatch }) {
  const [loadingIdx, setLoadingIdx] = useState(null);

  const update = (idx, data) => {
    dispatch({ type: "updateFile", idx, data });
  };

  const handleModelChange = (idx, value) => {
    update(idx, { model: value });
  };
  const handlePromptChange = (idx, value) => {
    update(idx, { prompt: value });
  };
  const handlePromptInput = (idx, e) => {
    update(idx, { prompt: e.target.value });
  };
  const handleProcess = async (idx) => {
    const { fileName, filePath, model, prompt } = files[idx];
    if (!model || !prompt) return message.warning('请选择模型和提示词');
    setLoadingIdx(idx);
    try {
      const result = await processFile({ fileName, filePath, model, prompt });
      update(idx, { result });
      message.success(`${fileName} 处理完成`);
    } catch(e) {
      message.error(`${fileName} 处理失败`);
    }
    setLoadingIdx(null);
  };
  const handleDownload = (idx) => {
    const file = files[idx];
    const blob = new Blob([file.result], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `改写-${file.fileName}`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return <Table dataSource={files} rowKey="filePath" pagination={false} size="small" bordered
    columns={[
      {
        title: "文件名",
        dataIndex: "fileName",
        key: "fileName",
        width: 200
      },
      {
        title: "模型",
        dataIndex: "model",
        key: "model",
        width: 220,
        render: (val, _, idx) => <Select
          value={val}
          style={{ width: 200 }}
          options={models.map(m => ({ value: m, label: m }))}
          onChange={v => handleModelChange(idx, v)}
          placeholder="请选择"
        />
      },
      {
        title: "提示词",
        dataIndex: "prompt",
        key: "prompt",
        width: 300,
        render: (val, _, idx) => <>
          <Select
            style={{ width: 140 }}
            value={prompts.includes(val) ? val : undefined}
            options={prompts.map(m => ({ value: m, label: m }))}
            onChange={v => handlePromptChange(idx, v)}
            placeholder="选择"
          />
          <Input
            style={{ width: 140, marginLeft: 8 }}
            value={val}
            onChange={e => handlePromptInput(idx, e)}
            placeholder="自定义"
          />
        </>
      },
      {
        title: "状态/操作",
        key: "action",
        width: 220,
        render: (_, row, idx) => <>
          {loadingIdx === idx ? <Spin /> : (
            <Button type="primary" onClick={() => handleProcess(idx)} disabled={row.result}>处理</Button>
          )}
          {row.result ? <Button style={{ marginLeft: 12 }} onClick={() => handleDownload(idx)}>下载结果</Button> : null}
        </>
      },
      {
        title: "处理结果",
        dataIndex: "result",
        key: "result",
        width: 400,
        render: val => val ? <div style={{ maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{val}</div> : '--'
      }
    ]}
  />
}

