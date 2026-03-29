// 测试统一上下文生成方案
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class UnifiedGeneratorTest {
  constructor() {
    this.baseUrl = 'http://localhost:3001';
    this.testResults = [];
    this.currentTest = null;
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🧪 开始运行统一上下文生成测试套件\n');
    
    try {
      // 测试1：基础生成功能
      await this.testBasicGeneration();
      
      // 测试2：进度缓存功能
      await this.testProgressCache();
      
      // 测试3：中断恢复功能
      await this.testInterruptionResume();
      
      // 测试4：长文本生成
      await this.testLongTextGeneration();
      
      // 测试5：错误处理
      await this.testErrorHandling();
      
      // 测试6：并发处理
      await this.testConcurrentGeneration();
      
      this.printTestSummary();
      
    } catch (error) {
      console.error('❌ 测试套件执行失败:', error);
    }
  }

  /**
   * 测试1：基础生成功能
   */
  async testBasicGeneration() {
    this.currentTest = '基础生成功能';
    console.log('📝 测试1: 基础生成功能');
    
    const testParams = {
      theme: '现代都市爱情故事：一个程序员女孩在咖啡店遇到初恋男友的情感纠葛',
      instruction: '创作一部温暖治愈的现代言情小说，重点描写女主的内心成长和情感变化',
      targetWordCount: 3000,
      model: 'deepseek-ai/DeepSeek-V2.5',
      options: {
        enableIntelligentChunking: true,
        enableProgressCache: true
      }
    };

    try {
      const result = await this.executeGeneration(testParams);
      
      // 验证结果
      const validation = this.validateGenerationResult(result, testParams);
      
      this.recordTestResult({
        test: this.currentTest,
        status: validation.success ? 'PASS' : 'FAIL',
        details: validation,
        duration: result.duration,
        wordCount: result.wordCount,
        cacheId: result.cacheId
      });

    } catch (error) {
      this.recordTestResult({
        test: this.currentTest,
        status: 'ERROR',
        details: { error: error.message },
        duration: 0
      });
    }
  }

  /**
   * 测试2：进度缓存功能
   */
  async testProgressCache() {
    this.currentTest = '进度缓存功能';
    console.log('\n📦 测试2: 进度缓存功能');
    
    const testParams = {
      theme: '校园青春故事：学霸女孩与体育特长生的友情与爱情',
      instruction: '描写高中校园生活，展现友情、学业压力和初恋的甜蜜与苦涩',
      targetWordCount: 2000,
      model: 'deepseek-ai/DeepSeek-V2.5'
    };

    try {
      // 第一次生成
      console.log('第一次生成...');
      const result1 = await this.executeGeneration(testParams);
      
      // 检查缓存
      console.log('检查缓存状态...');
      const cacheStats = await this.getCacheStats(result1.cacheId);
      
      // 第二次生成（应该使用缓存）
      console.log('第二次生成（测试缓存）...');
      const result2 = await this.executeGeneration(testParams);
      
      const validation = this.validateCacheFunction(result1, result2, cacheStats);
      
      this.recordTestResult({
        test: this.currentTest,
        status: validation.success ? 'PASS' : 'FAIL',
        details: validation,
        cacheId: result1.cacheId
      });

    } catch (error) {
      this.recordTestResult({
        test: this.currentTest,
        status: 'ERROR',
        details: { error: error.message }
      });
    }
  }

  /**
   * 测试3：中断恢复功能
   */
  async testInterruptionResume() {
    this.currentTest = '中断恢复功能';
    console.log('\n🔄 测试3: 中断恢复功能');
    
    const testParams = {
      theme: '职场励志故事：应届生在大城市打拼的成长历程',
      instruction: '描写职场新人面临的挑战、挫折和成长，展现都市生活的真实面貌',
      targetWordCount: 5000,
      model: 'deepseek-ai/DeepSeek-V2.5'
    };

    try {
      // 开始生成
      console.log('开始生成...');
      let cacheId;
      let interruptTriggered = false;
      
      await this.executeGenerationWithCallback(testParams, async (data) => {
        if (data.type === 'start' && data.cacheId) {
          cacheId = data.cacheId;
        }
        
        // 在第一个块完成后模拟中断
        if (data.type === 'content' && !interruptTriggered) {
          const progress = await this.getProgress(cacheId);
          if (progress && progress.chunks && progress.chunks.length > 0) {
            console.log('模拟中断，触发恢复机制...');
            interruptTriggered = true;
            return 'interrupt'; // 触发中断
          }
        }
      });
      
      if (cacheId) {
        // 恢复生成
        console.log('恢复中断的生成...');
        const resumeResult = await this.resumeGeneration(cacheId);
        
        const validation = this.validateResumeFunction(testParams, resumeResult);
        
        this.recordTestResult({
          test: this.currentTest,
          status: validation.success ? 'PASS' : 'FAIL',
          details: validation,
          cacheId: cacheId
        });
      }

    } catch (error) {
      this.recordTestResult({
        test: this.currentTest,
        status: 'ERROR',
        details: { error: error.message }
      });
    }
  }

  /**
   * 测试4：长文本生成
   */
  async testLongTextGeneration() {
    this.currentTest = '长文本生成';
    console.log('\n📚 测试4: 长文本生成');
    
    const testParams = {
      theme: '古装宫斗剧：智慧宫女在宫廷中的生存与成长',
      instruction: '创作一部精彩的古装宫斗小说，展现女主角的智慧、勇气和成长历程',
      targetWordCount: 10000, // 1万字长文本
      model: 'deepseek-ai/DeepSeek-V2.5'
    };

    try {
      const startTime = Date.now();
      const result = await this.executeGeneration(testParams);
      const duration = Date.now() - startTime;
      
      // 验证长文本生成的质量
      const validation = this.validateLongTextGeneration(result, testParams);
      
      this.recordTestResult({
        test: this.currentTest,
        status: validation.success ? 'PASS' : 'FAIL',
        details: validation,
        duration,
        wordCount: result.wordCount,
        cacheId: result.cacheId
      });

    } catch (error) {
      this.recordTestResult({
        test: this.currentTest,
        status: 'ERROR',
        details: { error: error.message }
      });
    }
  }

  /**
   * 测试5：错误处理
   */
  async testErrorHandling() {
    this.currentTest = '错误处理';
    console.log('\n⚠️ 测试5: 错误处理');
    
    // 测试无效参数
    const invalidParams = [
      { theme: '', targetWordCount: 1000 },
      { theme: '测试主题', targetWordCount: -1000 },
      { theme: null, targetWordCount: 1000 }
    ];

    let errorHandlingResults = [];

    for (let i = 0; i < invalidParams.length; i++) {
      const params = invalidParams[i];
      console.log(`测试无效参数 ${i + 1}:`, params);
      
      try {
        await this.executeGeneration(params);
        errorHandlingResults.push({
          test: `无效参数${i + 1}`,
          status: 'FAIL',
          reason: '应该失败但成功了'
        });
      } catch (error) {
        const handledCorrectly = error.response?.status === 400;
        errorHandlingResults.push({
          test: `无效参数${i + 1}`,
          status: handledCorrectly ? 'PASS' : 'FAIL',
          reason: handledCorrectly ? '正确处理错误' : error.message
        });
      }
    }

    this.recordTestResult({
      test: this.currentTest,
      status: errorHandlingResults.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
      details: { errorHandlingResults }
    });
  }

  /**
   * 测试6：并发处理
   */
  async testConcurrentGeneration() {
    this.currentTest = '并发处理';
    console.log('\n🔄 测试6: 并发处理');
    
    const concurrentParams = [
      {
        theme: '科幻爱情故事：时空旅行者的情感纠葛',
        instruction: '融合科幻元素与浪漫爱情',
        targetWordCount: 2000
      },
      {
        theme: '悬疑推理故事：侦探破解复杂案件',
        instruction: '制造紧张刺激的悬疑氛围',
        targetWordCount: 2000
      },
      {
        theme: '奇幻冒险故事：魔法世界的探险',
        instruction: '充满想象力的奇幻设定',
        targetWordCount: 2000
      }
    ];

    try {
      const startTime = Date.now();
      
      // 并发执行
      const promises = concurrentParams.map((params, index) => 
        this.executeGeneration({
          ...params,
          options: { concurrentId: index }
        })
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // 验证并发结果
      const validation = this.validateConcurrentGeneration(results, concurrentParams);
      
      this.recordTestResult({
        test: this.currentTest,
        status: validation.success ? 'PASS' : 'FAIL',
        details: validation,
        duration,
        concurrentTasks: results.length
      });

    } catch (error) {
      this.recordTestResult({
        test: this.currentTest,
        status: 'ERROR',
        details: { error: error.message }
      });
    }
  }

  /**
   * 执行生成
   * @param {Object} params - 生成参数
   * @returns {Object} 生成结果
   */
  async executeGeneration(params) {
    const startTime = Date.now();
    let cacheId;
    let finalContent = '';
    let wordCount = 0;

    try {
      const response = await axios.post(
        `${this.baseUrl}/story/generate-unified-context`,
        params,
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'stream'
        }
      );

      const chunks = [];
      response.data.on('data', (chunk) => {
        chunks.push(chunk);
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'start') {
                cacheId = data.cacheId;
                console.log(`🚀 生成开始，Cache ID: ${cacheId}`);
              } else if (data.type === 'content') {
                finalContent = data.fullContent || finalContent;
                wordCount = data.wordCount || wordCount;
              } else if (data.type === 'done') {
                finalContent = data.content || finalContent;
                wordCount = data.wordCount || wordCount;
                console.log(`✅ 生成完成，字数: ${wordCount}`);
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      return new Promise((resolve, reject) => {
        response.data.on('end', () => {
          resolve({
            success: true,
            content: finalContent,
            wordCount,
            cacheId,
            duration: Date.now() - startTime
          });
        });

        response.data.on('error', (error) => {
          reject(error);
        });
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * 执行带回调的生成（用于测试中断）
   * @param {Object} params - 生成参数
   * @param {Function} callback - 回调函数
   * @returns {Object} 生成结果
   */
  async executeGenerationWithCallback(params, callback) {
    const startTime = Date.now();
    let cacheId;
    let finalContent = '';

    try {
      const response = await axios.post(
        `${this.baseUrl}/story/generate-unified-context`,
        params,
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'stream'
        }
      );

      return new Promise((resolve, reject) => {
        response.data.on('data', async (chunk) => {
          const text = chunk.toString();
          const lines = text.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'start') {
                  cacheId = data.cacheId;
                } else if (data.type === 'content') {
                  finalContent = data.fullContent || finalContent;
                } else if (data.type === 'done') {
                  resolve({
                    success: true,
                    content: finalContent,
                    wordCount: data.wordCount,
                    cacheId,
                    duration: Date.now() - startTime
                  });
                  return;
                }
                
                // 执行回调
                const callbackResult = await callback(data);
                if (callbackResult === 'interrupt') {
                  response.data.destroy(); // 中断连接
                  resolve({
                    success: false,
                    interrupted: true,
                    cacheId,
                    duration: Date.now() - startTime
                  });
                  return;
                }
                
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });

        response.data.on('error', (error) => {
          reject(error);
        });
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * 恢复生成
   * @param {string} cacheId - 缓存ID
   * @returns {Object} 恢复结果
   */
  async resumeGeneration(cacheId) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/story/resume-generation`,
        { cacheId },
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'stream'
        }
      );

      const chunks = [];
      let finalContent = '';
      let wordCount = 0;

      response.data.on('data', (chunk) => {
        chunks.push(chunk);
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'content') {
                finalContent = data.fullContent || finalContent;
                wordCount = data.wordCount || wordCount;
              } else if (data.type === 'done') {
                finalContent = data.content || finalContent;
                wordCount = data.wordCount || wordCount;
                console.log(`✅ 恢复完成，字数: ${wordCount}`);
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      return new Promise((resolve, reject) => {
        response.data.on('end', () => {
          resolve({
            success: true,
            content: finalContent,
            wordCount,
            cacheId
          });
        });

        response.data.on('error', (error) => {
          reject(error);
        });
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取缓存统计
   * @param {string} cacheId - 缓存ID
   * @returns {Object} 缓存统计
   */
  async getCacheStats(cacheId) {
    try {
      const response = await axios.get(`${this.baseUrl}/story/cache-stats`);
      return response.data;
    } catch (error) {
      console.warn('获取缓存统计失败:', error.message);
      return null;
    }
  }

  /**
   * 获取生成进度
   * @param {string} cacheId - 缓存ID
   * @returns {Object} 进度信息
   */
  async getProgress(cacheId) {
    try {
      const response = await axios.get(`${this.baseUrl}/story/generation-progress/${cacheId}`);
      return response.data.progress;
    } catch (error) {
      console.warn('获取生成进度失败:', error.message);
      return null;
    }
  }

  /**
   * 验证生成结果
   * @param {Object} result - 生成结果
   * @param {Object} params - 原始参数
   * @returns {Object} 验证结果
   */
  validateGenerationResult(result, params) {
    const validation = { success: true, issues: [] };

    // 检查基本字段
    if (!result.content || result.content.length === 0) {
      validation.success = false;
      validation.issues.push('生成内容为空');
    }

    // 检查字数
    const expectedRange = params.targetWordCount * 0.2; // 允许20%误差
    if (Math.abs(result.wordCount - params.targetWordCount) > expectedRange) {
      validation.issues.push(`字数偏差过大: 期望${params.targetWordCount}, 实际${result.wordCount}`);
    }

    // 检查缓存ID
    if (!result.cacheId) {
      validation.issues.push('缺少缓存ID');
    }

    // 检查内容质量（简单检查）
    if (result.content) {
      const lines = result.content.split('\n').filter(line => line.trim());
      if (lines.length < 10) {
        validation.issues.push('内容行数过少，可能质量不佳');
      }

      // 检查是否包含主题关键词
      const themeWords = params.theme.split(/[，。！？]/);
      const hasThemeWords = themeWords.some(word => 
        word.trim() && result.content.includes(word.trim())
      );
      if (!hasThemeWords) {
        validation.issues.push('内容可能与主题不符');
      }
    }

    if (validation.issues.length > 0) {
      validation.success = false;
    }

    return validation;
  }

  /**
   * 验证缓存功能
   * @param {Object} result1 - 第一次结果
   * @param {Object} result2 - 第二次结果
   * @param {Object} cacheStats - 缓存统计
   * @returns {Object} 验证结果
   */
  validateCacheFunction(result1, result2, cacheStats) {
    const validation = { success: true, issues: [] };

    if (!cacheStats) {
      validation.issues.push('无法获取缓存统计');
    } else if (cacheStats.success && cacheStats.stats) {
      if (cacheStats.stats.totalEntries === 0) {
        validation.issues.push('缓存中没有条目');
      }
    }

    // 检查两次生成是否使用了相同的缓存ID
    if (result1.cacheId === result2.cacheId) {
      validation.issues.push('应该生成不同的缓存ID');
    }

    if (validation.issues.length > 0) {
      validation.success = false;
    }

    return validation;
  }

  /**
   * 验证恢复功能
   * @param {Object} originalParams - 原始参数
   * @param {Object} resumeResult - 恢复结果
   * @returns {Object} 验证结果
   */
  validateResumeFunction(originalParams, resumeResult) {
    const validation = { success: true, issues: [] };

    if (!resumeResult.success) {
      validation.issues.push('恢复生成失败');
    }

    if (resumeResult.wordCount < originalParams.targetWordCount * 0.5) {
      validation.issues.push('恢复后字数过少');
    }

    if (!resumeResult.content || resumeResult.content.length === 0) {
      validation.issues.push('恢复后内容为空');
    }

    if (validation.issues.length > 0) {
      validation.success = false;
    }

    return validation;
  }

  /**
   * 验证长文本生成
   * @param {Object} result - 生成结果
   * @param {Object} params - 原始参数
   * @returns {Object} 验证结果
   */
  validateLongTextGeneration(result, params) {
    const validation = { success: true, issues: [] };

    // 检查是否使用了分块策略
    if (result.wordCount < params.targetWordCount * 0.8) {
      validation.issues.push(`长文本生成字数不足: ${result.wordCount}/${params.targetWordCount}`);
    }

    // 检查生成时间是否合理（长文本应该需要更长时间）
    if (result.duration < 30000) { // 少于30秒
      validation.issues.push('生成时间过短，可能未正确分块处理');
    }

    // 检查内容结构（长文本应该有更好的结构）
    if (result.content) {
      const paragraphs = result.content.split('\n\n').filter(p => p.trim());
      if (paragraphs.length < 5) {
        validation.issues.push('长文本段落过少，结构可能不佳');
      }
    }

    if (validation.issues.length > 0) {
      validation.success = false;
    }

    return validation;
  }

  /**
   * 验证并发生成
   * @param {Array} results - 生成结果数组
   * @param {Array} paramsArray - 参数数组
   * @returns {Object} 验证结果
   */
  validateConcurrentGeneration(results, paramsArray) {
    const validation = { success: true, issues: [] };

    if (results.length !== paramsArray.length) {
      validation.issues.push(`并发结果数量不匹配: ${results.length}/${paramsArray.length}`);
    }

    // 检查每个结果
    results.forEach((result, index) => {
      if (!result.success) {
        validation.issues.push(`任务${index}生成失败`);
      }

      // 检查缓存ID是否唯一
      const sameCacheId = results.filter(r => r.cacheId === result.cacheId).length;
      if (sameCacheId > 1) {
        validation.issues.push(`任务${index}缓存ID重复`);
      }
    });

    if (validation.issues.length > 0) {
      validation.success = false;
    }

    return validation;
  }

  /**
   * 记录测试结果
   * @param {Object} result - 测试结果
   */
  recordTestResult(result) {
    this.testResults.push(result);
    
    const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${status} ${result.test}: ${result.status}`);
    
    if (result.details && result.details.issues && result.details.issues.length > 0) {
      result.details.issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
    }
  }

  /**
   * 打印测试总结
   */
  printTestSummary() {
    console.log('\n📊 测试总结:');
    console.log('='.repeat(50));
    
    const passCount = this.testResults.filter(r => r.status === 'PASS').length;
    const failCount = this.testResults.filter(r => r.status === 'FAIL').length;
    const errorCount = this.testResults.filter(r => r.status === 'ERROR').length;
    
    console.log(`✅ 通过: ${passCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log(`⚠️ 错误: ${errorCount}`);
    console.log(`📈 成功率: ${Math.round((passCount / this.testResults.length) * 100)}%`);
    
    // 保存详细结果
    const reportPath = path.join(__dirname, 'test_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { passCount, failCount, errorCount, successRate: Math.round((passCount / this.testResults.length) * 100) },
      results: this.testResults
    }, null, 2));
    
    console.log(`📄 详细报告已保存到: ${reportPath}`);
    
    if (failCount > 0 || errorCount > 0) {
      console.log('\n⚠️ 请检查失败的测试项目，确保系统稳定性');
    } else {
      console.log('\n🎉 所有测试通过！系统运行正常');
    }
  }
}

// 运行测试
if (require.main === module) {
  const tester = new UnifiedGeneratorTest();
  tester.runAllTests().catch(console.error);
}

module.exports = UnifiedGeneratorTest;