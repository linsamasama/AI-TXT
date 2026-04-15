const {
  requestChatCompletion,
  extractMessageContent,
  extractCompletionMeta,
  extractStreamDelta
} = require('./llm_client');

async function rewriteWithSilicon(fileContent, prompt, model) {
  const response = await requestChatCompletion({
    model,
    messages: [
      { role: 'user', content: `${prompt}\n${fileContent}` }
    ],
    stream: false
  });

  const content = extractMessageContent(response).trim();
  const meta = extractCompletionMeta(response);

  if (!content) {
    const error = new Error('\u0041\u0049\u8fd4\u56de\u7a7a\u7ed3\u679c');
    error.code = 'EMPTY_AI_RESULT';
    error.providerTraceId = meta.traceId;
    error.providerFinishReason = meta.finishReason;
    error.usageTotalTokens = meta.usageTotalTokens;
    error.hasReasoningContent = meta.hasReasoningContent;
    throw error;
  }

  return {
    content,
    traceId: meta.traceId,
    finishReason: meta.finishReason,
    usageTotalTokens: meta.usageTotalTokens,
    hasReasoningContent: meta.hasReasoningContent
  };
}

async function generateStory(instruction, model, wordCount = 1000) {
  const prompt = `请根据以下指令创作一篇短篇小说，要求：
1. 严格按照指令要求创作
2. 目标字数严格按照指定 ${wordCount} 字（允许±10%的误差）
3. 情节完整，有开头、发展、高潮和结尾
4. 语言流畅，符合现代言情小说风格

创作指令：
${instruction}

请直接输出小说内容，不要添加任何解释、说明、markdown格式或标记。`;

  const response = await requestChatCompletion({
    model,
    messages: [
      { role: 'user', content: prompt }
    ],
    stream: false
  });

  return extractMessageContent(response);
}

// 流式生成小说（支持实时进度和继续生成）
async function* generateStoryStream(instruction, model, wordCount = 1000, existingContent = '', res = null) {
  let prompt;

  if (existingContent && existingContent.trim()) {
    // 继续生成模式 - 重新生成时从中断位置继续
    prompt = `请继续完成以下小说的创作，要求：
1. 严格从中断位置继续已有内容的情节发展，保持风格和人物一致性
2. 目标总字数约 ${wordCount} 字（当前已有 ${existingContent.length} 字，还需生成约 ${Math.max(0, wordCount - existingContent.length)} 字）
3. 小说格式规范
4. 情节完整，有开头、发展、高潮和结尾
5. 语言流畅，符合现代小说风格

已有内容（请从这里继续）：
${existingContent}

创作指令：
${instruction}

请直接输出小说内容，不要添加任何解释、说明或标记。`;
  } else {
    // 全新生成模式
    prompt = `你是一个冷峻的硬汉派作家，拒绝一切无意义的情感呻吟和环境铺陈。请根据以下指令创作一篇小说，要求：
1. 严格按照指令要求创作
2. 目标字数约 ${wordCount} 字（允许±10%的误差）
3. 小说格式规范
4. 情节完整，有开头、发展、高潮和结尾
5. 语言流畅，符合现代小说风格
6. 请在每个章节结尾采用“戛然而止”的处理方式。最后一句话必须是角色的某个具体动作或一句关键对话，严禁出现超过20字的环境渲染或心理感悟。

创作指令：
${instruction}

请直接输出小说内容，不要添加任何解释、说明或标记。`;
  }

  try {
    const response = await requestChatCompletion({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    });

    let newContent = '';
    let buffer = '';

    for await (const chunk of response.data) {
      if (res && (res.writableEnded || res.destroyed)) {
        console.log('🔌 检测到连接中断，停止生成');
        return;
      }

      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const data = line.slice(6);
        if (data === '[DONE]') {
          const finalContent = existingContent ? existingContent + newContent : newContent;
          yield { type: 'done', content: finalContent };
          return;
        }

        try {
          const json = JSON.parse(data);
          const delta = extractStreamDelta(json);

          if (!delta) {
            continue;
          }

          newContent += delta;
          const fullContent = existingContent ? existingContent + newContent : newContent;
          yield { type: 'content', content: delta, fullContent };
        } catch (_error) {
          // 忽略解析错误
        }
      }
    }

    const finalContent = existingContent ? existingContent + newContent : newContent;
    yield { type: 'done', content: finalContent };
  } catch (error) {
    yield { type: 'error', error: error.message };
    throw error;
  }
}

// 通用文本翻译函数
async function translateText(prompt, model = 'deepseek-ai/DeepSeek-V2.5') {
  const response = await requestChatCompletion({
    model,
    messages: [
      { role: 'user', content: prompt }
    ],
    stream: false
  });

  return extractMessageContent(response);
}

module.exports = {
  rewriteWithSilicon,
  generateStory,
  generateStoryStream,
  translateText
};
