const IntelligentChunkingStrategy = require('./intelligent_chunking');
const RetryStrategy = require('./retry_strategy');
const ProgressCacheManager = require('./progress_cache');
const { requestChatCompletion, extractMessageContent } = require('./llm_client');

/**
 * 统一上下文生成器
 * 实现智能分块生成，解决长文本的上下文连续性问题
 */
class UnifiedContextGenerator {
  constructor() {
    this.chunkingStrategy = new IntelligentChunkingStrategy();
    this.retryStrategy = new RetryStrategy();
    this.progressCache = new ProgressCacheManager();
    
    this.generationConfig = {
      // API配置
      apiTimeout: 4 * 60 * 1000,  // 4分钟，提前于5分钟限制
      maxRetries: 3,
      
      // 分块策略
      enableIntelligentChunking: true,
      chunkSize: 6000,
      
      // 上下文配置
      preserveFullContext: true,
      maxContextLength: 10000,
      
      // 性能配置
      enableProgressCache: true,
      enableRealtimeUpdates: true
    };
  }

  /**
   * 统一生成接口（主要入口）
   * @param {Object} params - 生成参数
   * @param {Object} res - Express响应对象（用于流式响应）
   */
  async* generateUnifiedContext(params, res) {
    const {
      theme,
      instruction,
      targetWordCount,
      model = 'deepseek-ai/DeepSeek-V2.5',
      options = {}
    } = params;

    console.log(`🚀 开始传统模式生成:`, {
      theme: theme?.substring(0, 50),
      targetWordCount,
      model,
      options: Object.keys(options)
    });
    
    try {
      // 发送开始信号
      yield { 
        type: 'start', 
        message: '开始生成小说...'
      };

      // 直接生成完整内容
      const fullContent = await this.executeSimpleGeneration(
        theme,
        instruction,
        targetWordCount,
        model,
        options
      );

      yield { 
        type: 'done', 
        content: fullContent,
        wordCount: fullContent.length
      };

    } catch (error) {
      console.error('❌ 生成失败:', error);
      
      yield { 
        type: 'error', 
        error: error.message,
        canRetry: this.canRetry(error)
      };
    }
  }

  /**
   * 执行分块生成
   * @param {string} cacheId - 缓存ID
   * @param {string} theme - 主题
   * @param {string} instruction - 指令
   * @param {number} targetWordCount - 目标字数
   * @param {string} model - 模型
   * @param {Object} options - 选项
   * @param {Array} existingChunks - 现有块
   * @param {number} startFromChunk - 起始块索引
   * @param {Object} res - Express响应对象（用于检查连接状态）
   * @returns {string} 完整内容
   */
  async executeChunkedGeneration(
    cacheId,
    theme,
    instruction,
    targetWordCount,
    model,
    options,
    existingChunks = [],
    startFromChunk = 0,
    res = null
  ) {
    let allChunks = existingChunks;
    let fullContent = allChunks.map(chunk => chunk.content).join('\n\n');

    // 如果是全新生成，先生成整体大纲
    if (allChunks.length === 0) {
      // 检查连接是否已中断
      if (res && (res.writableEnded || res.destroyed)) {
        console.log('🔌 连接已中断，停止生成');
        throw new Error('连接已中断');
      }
      
      const outline = await this.generateStoryOutline(theme, targetWordCount);
      console.log('📝 生成故事大纲完成');
      
      // 保存大纲到缓存
      await this.progressCache.updateProgress(cacheId, { outline });
    }

    // 确定需要生成的块数量
    const estimatedChunks = this.chunkingStrategy.estimateChunkCount(targetWordCount);
    const chunksToGenerate = Math.max(estimatedChunks - allChunks.length, 1);

    console.log(`📊 分块生成计划: 总共${estimatedChunks}块，已存在${allChunks.length}块，需要生成${chunksToGenerate}块`);

    // 逐块生成
    for (let i = startFromChunk; i < estimatedChunks; i++) {
      // 在每个块生成前检查连接状态
      if (res && (res.writableEnded || res.destroyed)) {
        console.log('🔌 连接已中断，停止生成');
        throw new Error('连接已中断');
      }
      
      try {
        const chunkResult = await this.generateSingleChunk(
          cacheId,
          theme,
          instruction,
          targetWordCount,
          model,
          i,
          allChunks,
          options,
          res
        );

        // 更新块数据
        allChunks[i] = {
          index: i,
          content: chunkResult.content,
          wordCount: chunkResult.content.length,
          status: 'completed',
          completedAt: new Date().toISOString(),
          context: chunkResult.context
        };

        // 保存块进度
        await this.progressCache.saveChunkProgress(cacheId, i, allChunks[i]);
        await this.progressCache.updateProgress(cacheId, { 
          currentChunk: i,
          totalChunks: estimatedChunks 
        });

        // 更新完整内容
        fullContent = allChunks.map(chunk => chunk.content).join('\n\n');

        console.log(`✅ 第${i + 1}/${estimatedChunks}块生成完成，字数: ${chunkResult.content.length}`);

      } catch (error) {
        console.error(`❌ 第${i + 1}块生成失败:`, error.message);
        
        // 如果是连接中断，直接抛出错误
        if (res && (res.writableEnded || res.destroyed)) {
          throw new Error('连接已中断');
        }
        
        // 记录错误但继续尝试下一块（可选策略）
        const shouldContinue = await this.handleChunkGenerationError(cacheId, i, error);
        if (!shouldContinue) {
          throw error;
        }
      }
    }

    return fullContent;
  }

  /**
   * 生成单个块
   * @param {string} cacheId - 缓存ID
   * @param {string} theme - 主题
   * @param {string} instruction - 指令
   * @param {number} targetWordCount - 目标字数
   * @param {string} model - 模型
   * @param {number} chunkIndex - 块索引
   * @param {Array} allChunks - 所有块
   * @param {Object} options - 选项
   * @param {Object} res - Express响应对象（用于检查连接状态）
   * @returns {Object} 块生成结果
   */
  async generateSingleChunk(
    cacheId,
    theme,
    instruction,
    targetWordCount,
    model,
    chunkIndex,
    allChunks,
    options,
    res = null
  ) {
    const estimatedChunks = this.chunkingStrategy.estimateChunkCount(targetWordCount);
    const targetChunkSize = Math.ceil(targetWordCount / estimatedChunks);
    
    // 构建上下文
    const context = this.buildChunkContext(theme, instruction, allChunks, chunkIndex, targetWordCount);
    
    // 构建提示词
    const prompt = this.buildChunkPrompt(context, targetChunkSize);
    
    console.log(`🔍 生成第${chunkIndex + 1}块，目标字数: ${targetChunkSize}`);

    // 执行生成（带重试）
    return await this.retryStrategy.executeWithRetry(async () => {
      // 在每次重试前检查连接状态
      if (res && (res.writableEnded || res.destroyed)) {
        throw new Error('连接已中断');
      }
      return await this.executeAPIGeneration(prompt, model, targetChunkSize, res);
    }, {
      maxRetries: this.generationConfig.maxRetries,
      operationTimeout: this.generationConfig.apiTimeout
    });
  }

  /**
   * 构建块上下文
   * @param {string} theme - 主题
   * @param {string} instruction - 指令
   * @param {Array} allChunks - 所有块
   * @param {number} chunkIndex - 当前块索引
   * @param {number} targetWordCount - 目标字数
   * @returns {Object} 上下文
   */
  buildChunkContext(theme, instruction, allChunks, chunkIndex, targetWordCount) {
    const context = {
      theme,
      instruction,
      targetWordCount,
      chunkIndex,
      totalChunks: Math.ceil(targetWordCount / this.generationConfig.chunkSize),
      isFirstChunk: chunkIndex === 0,
      isLastChunk: chunkIndex >= Math.ceil(targetWordCount / this.generationConfig.chunkSize) - 1,
      
      // 前文内容
      previousContent: '',
      previousChunks: allChunks.slice(0, chunkIndex),
      
      // 提取的信息
      characters: new Set(),
      plotPoints: [],
      keyEvents: []
    };

    // 添加前文内容（完整保留前一块）
    if (chunkIndex > 0 && allChunks[chunkIndex - 1]) {
      context.previousContent = allChunks[chunkIndex - 1].content;
      
      // 提取人物和情节点
      const previousFullText = allChunks
        .slice(0, chunkIndex)
        .map(chunk => chunk.content)
        .join('\n\n');
        
      context.characters = this.chunkingStrategy.extractCharactersFromText(previousFullText);
      context.plotPoints = this.chunkingStrategy.extractPlotPointsFromText(previousFullText);
    }

    return context;
  }

  /**
   * 构建块生成提示词
   * @param {Object} context - 上下文
   * @param {number} targetChunkSize - 目标块大小
   * @returns {string} 提示词
   */
  buildChunkPrompt(context, targetChunkSize) {
    let prompt = `请继续创作女频小说"${context.theme}"。

创作指令：${context.instruction}

整体目标：${context.targetWordCount}字（当前是第${context.chunkIndex + 1}/${context.totalChunks}部分）
本部分目标：约${targetChunkSize}字
`;

    // 添加前文内容
    if (context.previousContent) {
      prompt += `\n前一部分结尾内容：\n${context.previousContent.substring(-800)}\n`;
    }

    // 添加人物信息
    if (context.characters && context.characters.length > 0) {
      prompt += `\n主要人物：${context.characters.join('、')}\n`;
    }

    // 添加关键情节点
    if (context.plotPoints && context.plotPoints.length > 0) {
      const recentPlotPoints = context.plotPoints.slice(-5).map(p => p.keyword).join('、');
      prompt += `\n重要情节：${recentPlotPoints}\n`;
    }

    // 创作要求
    prompt += `\n创作要求：
1. 直接从当前部分开始创作，不要重复前文内容
2. 确保与前文自然衔接，保持人物性格一致性
3. 符合女频小说风格，情感描写细腻
4. 一句话一换行，便于阅读
5. 控制字数在${targetChunkSize}字左右

请直接输出内容，不要添加章节标题或任何说明。`;

    return prompt;
  }

  /**
   * 执行API生成
   * @param {string} prompt - 提示词
   * @param {string} model - 模型
   * @param {number} targetLength - 目标长度
   * @param {Object} res - Express响应对象（用于检查连接状态）
   * @returns {Object} 生成结果
   */
  async executeAPIGeneration(prompt, model, targetLength, res = null) {
    try {
      // 在API调用前检查连接状态
      if (res && (res.writableEnded || res.destroyed)) {
        throw new Error('连接已中断');
      }

      const response = await requestChatCompletion({
        model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: targetLength * 2,
        temperature: 0.7,
        stream: false,
        timeout: this.generationConfig.apiTimeout
      });

      // 在API调用后检查连接状态
      if (res && (res.writableEnded || res.destroyed)) {
        throw new Error('连接已中断');
      }

      const content = extractMessageContent(response);
      
      return {
        content: content.trim(),
        wordCount: content.length,
        model: model,
        tokensUsed: response.data.usage?.total_tokens || 0
      };

    } catch (error) {
      console.error('API生成失败:', error.response?.data || error.message);
      throw error;
    }
  }







  /**
   * 初始化生成
   * @param {string} cacheId - 缓存ID
   * @param {Object} params - 参数
   */
  async initializeGeneration(cacheId, params) {
    const progressData = this.progressCache.createProgressStructure({
      cacheId,
      ...params
    });
    
    progressData.status = 'generating';
    progressData.startTime = new Date().toISOString();
    
    await this.progressCache.saveProgress(cacheId, progressData);
  }

  /**
   * 处理块生成错误
   * @param {string} cacheId - 缓存ID
   * @param {number} chunkIndex - 块索引
   * @param {Error} error - 错误
   * @returns {boolean} 是否继续生成
   */
  async handleChunkGenerationError(cacheId, chunkIndex, error) {
    // 记录错误
    await this.progressCache.recordError(cacheId, error);
    
    // 更新块状态
    await this.progressCache.saveChunkProgress(cacheId, chunkIndex, {
      status: 'error',
      error: error.message
    });
    
    // 根据错误类型决定是否继续
    const retryDecision = this.retryStrategy.shouldRetry(error, 0);
    return retryDecision.shouldRetry;
  }

  /**
   * 执行简单生成（传统模式）
   * @param {string} theme - 主题
   * @param {string} instruction - 指令
   * @param {number} targetWordCount - 目标字数
   * @param {string} model - 模型
   * @param {Object} options - 选项
   * @param {Object} res - Express响应对象（用于检查连接状态）
   * @returns {string} 完整内容
   */
  async executeSimpleGeneration(theme, instruction, targetWordCount, model, options, res = null) {
    const prompt = `请根据以下要求创作小说：

主题：${theme}
创作要求：${instruction}
目标字数：${targetWordCount}字

创作要求：
1. 严格按照主题和创作要求
2. 目标字数约${targetWordCount}字（允许±20%的误差）
3. 小说格式规范，一句一换行，不要出现大段文字
4. 情节完整，有开头、发展、高潮和结尾
5. 语言流畅，符合现代小说风格

请直接输出小说内容，不要添加任何解释、说明或标记。`;

    try {
      // 在API调用前检查连接状态
      if (res && (res.writableEnded || res.destroyed)) {
        throw new Error('连接已中断');
      }

      const response = await requestChatCompletion({
        model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: targetWordCount * 2,
        temperature: 0.7,
        stream: false,
        timeout: this.generationConfig.apiTimeout
      });

      // 在API调用后检查连接状态
      if (res && (res.writableEnded || res.destroyed)) {
        throw new Error('连接已中断');
      }

      const content = extractMessageContent(response);
      return content.trim();

    } catch (error) {
      console.error('简单生成失败:', error);
      throw error;
    }
  }

  /**
   * 判断是否可以重试
   * @param {Error} error - 错误
   * @returns {boolean}
   */
  canRetry(error) {
    const retryDecision = this.retryStrategy.shouldRetry(error, 0);
    return retryDecision.shouldRetry;
  }
  

}

module.exports = UnifiedContextGenerator;
