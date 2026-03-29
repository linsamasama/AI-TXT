const fs = require('fs');
const path = require('path');

/**
 * 智能分块策略管理器
 * 用于将长篇小说分割成适合API处理的智能块
 */
class IntelligentChunkingStrategy {
  constructor() {
    this.chunkConfig = {
      // 分块大小配置（字数）
      minChunkSize: 3000,      // 最小块大小
      maxChunkSize: 8000,      // 最大块大小
      targetChunkSize: 6000,   // 目标块大小
      
      // 分段策略
      naturalBreakPatterns: [
        /[。！？]\s*\n\n第[一二三四五六七八九十\d]+章/,  // 章节结束
        /[。！？]\s*\n\n/,                            // 段落结束
        /[。！？]\s*「/,                             // 对话开始
        /[。！？]\s*"/,                              // 引号结束
        /。\s*$/,                                    // 句号结束
      ],
      
      // 上下文保留策略
      contextRetention: {
        previousFullChunk: true,     // 保留前一块完整内容
        summaryChunks: 2,           // 摘要前2块
        keyInfoOnly: 3,             // 仅保留关键信息（3块之前）
      }
    };
  }

  /**
   * 智能分割长文本为chunks
   * @param {string} content - 原始内容
   * @param {number} targetWordCount - 目标字数
   * @returns {Array} 分块后的内容数组
   */
  splitIntoChunks(content, targetWordCount) {
    console.log(`🔪 开始分块处理，目标字数: ${targetWordCount}`);
    
    if (!content || typeof content !== 'string') {
      throw new Error('内容不能为空且必须是字符串');
    }

    // 如果内容较短，不需要分块
    if (content.length <= this.chunkConfig.maxChunkSize) {
      return [{
        index: 1,
        content: content,
        wordCount: content.length,
        context: this.createInitialContext(content, targetWordCount)
      }];
    }

    // 执行智能分块
    const chunks = this.performIntelligentSplitting(content, targetWordCount);
    
    // 为每个chunk创建上下文
    const enrichedChunks = chunks.map((chunk, index) => ({
      ...chunk,
      context: this.createContextForChunk(chunks, index),
      summary: this.createChunkSummary(chunk.content)
    }));

    console.log(`✅ 分块完成，共 ${enrichedChunks.length} 块`);
    return enrichedChunks;
  }

  /**
   * 执行智能分割算法
   * @param {string} content - 原始内容
   * @param {number} targetWordCount - 目标字数
   * @returns {Array} 基础chunks数组
   */
  performIntelligentSplitting(content, targetWordCount) {
    const lines = content.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentWordCount = 0;
    let chunkIndex = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWordCount = line.length;

      // 检查是否需要分块
      if (this.shouldSplitHere(
        currentWordCount, 
        lineWordCount, 
        line, 
        i < lines.length - 1
      )) {
        // 完成当前chunk
        if (currentChunk.length > 0) {
          chunks.push({
            index: chunkIndex++,
            content: currentChunk.join('\n'),
            wordCount: currentWordCount,
            splitReason: this.getSplitReason(currentWordCount, line)
          });
        }

        // 开始新chunk
        currentChunk = [line];
        currentWordCount = lineWordCount;
      } else {
        currentChunk.push(line);
        currentWordCount += lineWordCount;
      }
    }

    // 处理最后一个chunk
    if (currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex,
        content: currentChunk.join('\n'),
        wordCount: currentWordCount,
        splitReason: 'final_chunk'
      });
    }

    return chunks;
  }

  /**
   * 判断是否应该在此处分块
   * @param {number} currentWordCount - 当前chunk字数
   * @param {number} lineWordCount - 当前行字数
   * @param {string} line - 当前行内容
   * @param {boolean} hasMoreLines - 是否还有更多行
   * @returns {boolean} 是否应该分块
   */
  shouldSplitHere(currentWordCount, lineWordCount, line, hasMoreLines) {
    const totalAfterAdd = currentWordCount + lineWordCount;

    // 如果超过最大块大小，必须分块
    if (totalAfterAdd > this.chunkConfig.maxChunkSize) {
      // 如果当前chunk太小，强制加入此行
      if (currentWordCount < this.chunkConfig.minChunkSize) {
        return false;
      }
      return true;
    }

    // 如果达到目标大小且是自然分割点，可以分块
    if (totalAfterAdd >= this.chunkConfig.targetChunkSize) {
      return this.isNaturalSplitPoint(line);
    }

    // 如果块已经较大且遇到好的分割点
    if (currentWordCount >= this.chunkConfig.targetChunkSize * 0.8) {
      return this.isGoodSplitPoint(line);
    }

    return false;
  }

  /**
   * 判断是否为自然分割点
   * @param {string} line - 当前行
   * @returns {boolean}
   */
  isNaturalSplitPoint(line) {
    return this.chunkConfig.naturalBreakPatterns.some(pattern => 
      pattern.test(line)
    );
  }

  /**
   * 判断是否为好的分割点
   * @param {string} line - 当前行
   * @returns {boolean}
   */
  isGoodSplitPoint(line) {
    // 句号、感叹号、问号等强分割点
    return /[。！？]\s*$/.test(line) || 
           line.includes('章') || 
           line.includes('节') ||
           line.trim() === '';
  }

  /**
   * 获取分割原因
   * @param {number} currentWordCount - 当前字数
   * @param {string} line - 当前行
   * @returns {string}
   */
  getSplitReason(currentWordCount, line) {
    if (currentWordCount >= this.chunkConfig.maxChunkSize) {
      return 'max_size_reached';
    }
    if (this.isNaturalSplitPoint(line)) {
      return 'natural_break';
    }
    if (this.isGoodSplitPoint(line)) {
      return 'good_split_point';
    }
    return 'forced_split';
  }

  /**
   * 为chunk创建上下文
   * @param {Array} allChunks - 所有chunks
   * @param {number} currentIndex - 当前chunk索引
   * @returns {Object} 上下文对象
   */
  createContextForChunk(allChunks, currentIndex) {
    const context = {
      currentIndex,
      totalChunks: allChunks.length,
      isLastChunk: currentIndex === allChunks.length - 1,
      isFirstChunk: currentIndex === 0
    };

    // 前一块完整内容（如果不是第一块）
    if (currentIndex > 0) {
      context.previousFullChunk = allChunks[currentIndex - 1].content;
    }

    // 前几块的摘要
    if (currentIndex > 1) {
      const previousChunks = allChunks.slice(0, currentIndex);
      context.earlierSummaries = previousChunks.map(chunk => chunk.summary);
    }

    // 人物信息提取
    context.characters = this.extractCharacters(allChunks.slice(0, currentIndex));

    // 关键情节点
    context.plotPoints = this.extractPlotPoints(allChunks.slice(0, currentIndex));

    return context;
  }

  /**
   * 创建初始上下文
   * @param {string} content - 内容
   * @param {number} targetWordCount - 目标字数
   * @returns {Object}
   */
  createInitialContext(content, targetWordCount) {
    return {
      currentIndex: 0,
      totalChunks: 1,
      isLastChunk: true,
      isFirstChunk: true,
      targetWordCount,
      characters: this.extractCharactersFromText(content),
      plotPoints: this.extractPlotPointsFromText(content)
    };
  }

  /**
   * 创建chunk摘要
   * @param {string} content - chunk内容
   * @returns {string}
   */
  createChunkSummary(content) {
    const lines = content.split('\n').filter(line => line.trim());
    const summaryLength = Math.min(5, lines.length);
    const summaryLines = lines.slice(0, summaryLength);
    
    return summaryLines.join(' ').substring(0, 150) + 
           (summaryLines.join(' ').length > 150 ? '...' : '');
  }

  /**
   * 从chunks中提取人物信息
   * @param {Array} chunks - chunks数组
   * @returns {Array} 人物列表
   */
  extractCharacters(chunks) {
    const allContent = chunks.map(chunk => chunk.content).join('\n');
    return this.extractCharactersFromText(allContent);
  }

  /**
   * 从文本中提取人物信息
   * @param {string} text - 文本内容
   * @returns {Array} 人物列表
   */
  extractCharactersFromText(text) {
    const characters = new Set();
    
    // 简单的人物名提取（中文和英文）
    const namePatterns = [
      /[A-Z][a-z]+/g,                           // 英文名
      /[\u4e00-\u9fa5]{2,4}(?=[说说道想看听])/g,  // 中文人物名+动作
      /"([^"]+)"/g,                             // 引号中的人名
    ];

    namePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.replace(/["']/g, '').trim();
          if (cleanMatch.length >= 2 && cleanMatch.length <= 4) {
            characters.add(cleanMatch);
          }
        });
      }
    });

    return Array.from(characters).slice(0, 10); // 最多返回10个人物
  }

  /**
   * 从chunks中提取关键情节点
   * @param {Array} chunks - chunks数组
   * @returns {Array} 情节点数组
   */
  extractPlotPoints(chunks) {
    const allContent = chunks.map(chunk => chunk.content).join('\n');
    return this.extractPlotPointsFromText(allContent);
  }

  /**
   * 从文本中提取关键情节点
   * @param {string} text - 文本内容
   * @returns {Array} 情节点数组
   */
  extractPlotPointsFromText(text) {
    const plotPoints = [];
    
    // 关键词匹配
    const keywords = [
      '突然', '忽然', '瞬间', '终于', '结果', '原来', '没想到', '竟然',
      '决定', '离开', '回来', '相遇', '分手', '结婚', '死亡', '出生'
    ];

    const lines = text.split('\n');
    lines.forEach((line, index) => {
      keywords.forEach(keyword => {
        if (line.includes(keyword)) {
          plotPoints.push({
            keyword,
            line: line.substring(0, 50),
            lineNumber: index + 1
          });
        }
      });
    });

    return plotPoints.slice(0, 10); // 最多返回10个情节点
  }

  /**
   * 估算生成块数
   * @param {number} targetWordCount - 目标字数
   * @returns {number} 估算的块数
   */
  estimateChunkCount(targetWordCount) {
    return Math.ceil(targetWordCount / this.chunkConfig.targetChunkSize);
  }

  /**
   * 生成上下文提示词
   * @param {Object} context - 上下文对象
   * @param {string} currentChunk - 当前chunk内容
   * @returns {string} 增强的提示词
   */
  generateContextPrompt(context, currentChunk) {
    let prompt = '';

    // 基础信息
    prompt += `创作小说（第${context.currentIndex + 1}/${context.totalChunks}部分）\n\n`;

    // 前一块完整内容
    if (context.previousFullChunk) {
      prompt += `前一部分结尾内容：\n${context.previousFullChunk.substring(-500)}\n\n`;
    }

    // 更早内容的摘要
    if (context.earlierSummaries && context.earlierSummaries.length > 0) {
      prompt += `之前内容摘要：\n${context.earlierSummaries.join('\n')}\n\n`;
    }

    // 人物信息
    if (context.characters && context.characters.length > 0) {
      prompt += `主要人物：${context.characters.join('、')}\n\n`;
    }

    // 关键情节
    if (context.plotPoints && context.plotPoints.length > 0) {
      prompt += `关键情节：${context.plotPoints.map(p => p.keyword).join('、')}\n\n`;
    }

    // 生成要求
    prompt += `请继续创作，确保与前面内容自然衔接，保持人物性格一致性。\n\n`;

    return prompt;
  }
}

module.exports = IntelligentChunkingStrategy;