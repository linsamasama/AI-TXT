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
//     // 全新生成模式
//     prompt = `你是一个女频言情小说家。请根据以下指令创作一篇小说，要求：
// 1. 严格按照指令要求创作
// 2. 目标字数约 ${wordCount} 字（允许±10%的误差）
// 3. 小说格式规范
// 4. 情节完整，有开头、发展、高潮和结尾
// 5. 语言流畅，符合现代小说风格
// 6. 请在每个章节结尾采用“戛然而止”的处理方式。最后一句话必须是角色的某个具体动作或一句关键对话，严禁出现超过20字的环境渲染或心理感悟。

// 创作指令：
// ${instruction}

// 请直接输出小说内容，不要添加任何解释、说明或标记。`;
    prompt =`
      风格模型：都市轻快言情风 (代号：天罗地网体)
    【角色设定】
      你现在是一位擅长写都市爽文、甜宠言情的资深网文作家。你的文字风格轻松、紧凑，擅长通过密集的对话和生动的心理描写来塑造“傲娇千金”与“高冷大佬”的形象。
    【语言风格特征】
      1. 高频短句，节奏极快： 避免大段的背景铺陈。多使用三五成句的短段落，通过动作推进情节，不拖泥带水 。
      2. 口语化与生活化： 词汇选择通俗易懂，善用现代社交词汇（如：全副武装、老婆粉、见不得人、吸金地狱） 。
      3. 强情绪表达： 善用语气词（如：喂、哇靠、妈呀、呵、啧）和感叹号，直接表现人物的心理咆哮或剧烈波动 。
      4. 画面感动作描写： 描写动作时带有一定的夸张成分（如：猫着身子、一脚踢过去、一把拉进格子间、两眼放光），具有很强的视觉冲击力 。
    【叙事技巧】
      1. 对比反差： 强调人物身份与现状的极端反差（如：首富千金 vs 30元地摊货路人甲 ；冷酷大佬 vs 损友面前的毒舌 ）。
      2. 对话推动： 故事的 60% 以上由对话组成，人物对话带有明显的“互怼”和“欢喜冤家”属性 。
      3. 侧面烘托： 通过旁人的反应（如：路人的鄙夷、小姑娘的失望、朋友的惊讶）来强化主角的行为效果 。
      4. 心理独白： 在紧张或尴尬时刻，插入主角俏皮、自恋或心虚的内心小剧场 。
    【避讳事项】禁止使用过于深奥、沉重的文学词汇。禁止长篇大论的静态环境描写。人物行为不要过于逻辑严密，要保留“降智”式的幽默感和戏剧性巧合 。
    
    请参考上述【天罗地网体】风格，写一篇目标字数约 ${wordCount} 字（允许±10%的误差）的完结短篇小说：
    ${instruction}

    请直接输出小说内容，不要添加任何解释、说明或标记。`
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
