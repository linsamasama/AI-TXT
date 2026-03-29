// 简化版本的统一生成器（用于测试）
const { requestChatCompletion, extractStreamDelta } = require('./llm_client');

class SimpleUnifiedGenerator {
  /**
   * 简化的统一生成（直接生成，无分块）
   * @param {Object} params - 参数
   * @param {Object} res - Express响应对象
   */
  async* generateSimple(params) {
    const {
      theme,
      instruction,
      targetWordCount = 2000,
      model = 'deepseek-ai/DeepSeek-V2.5'
    } = params;

    console.log(`🚀 开始简化生成: ${theme.substring(0, 30)}...`);

    // 发送开始信号
    yield {
      type: 'start',
      message: '开始简化统一生成...',
      cacheId: this.generateCacheId()
    };

    try {
      // 构建提示词
      const prompt = `请根据以下要求创作一部女频小说：

主题：${theme}
创作指令：${instruction}

要求：
1. 目标字数约${targetWordCount}字
2. 情节完整，有开头、发展、高潮和结尾
3. 语言流畅，符合现代女频小说风格
4. 一句话一换行，便于阅读
5. 人物性格一致，情感描写细腻

请直接输出小说内容，不要添加章节标题或任何说明。`;

      console.log('📝 构建提示词完成，开始API调用...');

      // API调用
      const response = await requestChatCompletion({
        model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: targetWordCount * 2,
        temperature: 0.7,
        stream: true,
        timeout: 300000
      });

      console.log('🌊 开始流式响应处理...');

      let newContent = '';
      let buffer = '';

      // 处理流式响应
      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('✅ 流式生成完成');
              yield {
                type: 'done',
                content: newContent,
                wordCount: newContent.length
              };
              return;
            }

            try {
              const json = JSON.parse(data);
              const delta = extractStreamDelta(json);
              if (delta) {
                newContent += delta;
                const progress = Math.min(100, Math.round((newContent.length / targetWordCount) * 100));
                
                yield {
                  type: 'content',
                  content: delta,
                  fullContent: newContent,
                  progress: progress,
                  wordCount: newContent.length
                };
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      console.log('✅ 生成完成，最终字数:', newContent.length);
      yield {
        type: 'done',
        content: newContent,
        wordCount: newContent.length
      };

    } catch (error) {
      console.error('❌ 简化生成失败:', error.message);
      yield {
        type: 'error',
        error: error.message,
        canRetry: this.canRetry(error)
      };
    }
  }

  /**
   * 生成缓存ID
   * @returns {string}
   */
  generateCacheId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 判断是否可以重试
   * @param {Error} error - 错误
   * @returns {boolean}
   */
  canRetry(error) {
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNABORTED',
      'timeout',
      '5 minutes'
    ];

    const errorMessage = (error.message || '').toLowerCase();
    return retryableErrors.some(retryable => 
      errorMessage.includes(retryable.toLowerCase())
    );
  }
}

// 添加简化API到Express
function addSimpleAPI(app) {
  const simpleGenerator = new SimpleUnifiedGenerator();

  app.post('/story/generate-simple', async (req, res) => {
    const { theme, instruction, targetWordCount = 2000, model } = req.body;

    // 参数验证
    if (!theme || typeof theme !== 'string' || !theme.trim()) {
      return res.status(400).json({ 
        error: '缺少必要参数：theme（主题不能为空）' 
      });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 心跳保活
    const heartbeatInterval = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    res.on('close', () => clearInterval(heartbeatInterval));
    res.on('finish', () => clearInterval(heartbeatInterval));

    try {
      const generator = simpleGenerator.generateSimple({
        theme,
        instruction,
        targetWordCount,
        model
      });

      for await (const chunk of generator) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        if (chunk.type === 'done' || chunk.type === 'error') {
          break;
        }
      }

      res.end();
    } catch (error) {
      console.error('简化生成API错误:', error);
      const errorDetail = error.response?.data?.error?.message || error.message;
      
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: errorDetail 
      })}\n\n`);
      res.end();
    }
  });
}

module.exports = { SimpleUnifiedGenerator, addSimpleAPI };
