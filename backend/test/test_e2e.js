// 创建一个完整的端到端测试
const UnifiedContextGenerator = require('./unified_generator');

async function endToEndTest() {
  console.log('🔄 开始端到端测试...');
  
  const generator = new UnifiedContextGenerator();
  
  const testParams = {
    theme: '办公室恋情故事',
    instruction: '描写现代职场中的爱情故事，展现都市白领的情感生活',
    targetWordCount: 2000,
    model: 'deepseek-ai/DeepSeek-V2.5',
    options: {
      enableIntelligentChunking: true,
      enableProgressCache: true
    }
  };

  try {
    console.log('1. 初始化生成...');
    const cacheId = generator.progressCache.generateCacheId(
      testParams.theme,
      testParams.targetWordCount,
      testParams.model
    );
    
    await generator.initializeGeneration(cacheId, {
      ...testParams,
      cacheId
    });
    
    console.log('📋 缓存ID:', cacheId);

    console.log('2. 执行分块生成...');
    const fullContent = await generator.executeChunkedGeneration(
      cacheId,
      testParams.theme,
      testParams.instruction,
      testParams.targetWordCount,
      testParams.model,
      testParams.options,
      [],
      0
    );

    console.log('3. 生成完成!');
    console.log('📊 最终字数:', fullContent.length);
    console.log('📖 内容预览:');
    console.log(fullContent.substring(0, 200) + (fullContent.length > 200 ? '...' : ''));

    // 标记完成
    await generator.progressCache.markGenerationCompleted(cacheId, fullContent);
    
    console.log('4. 保存完成状态');
    
    // 验证缓存
    const progress = await generator.progressCache.loadProgress(cacheId);
    console.log('📦 缓存验证:', {
      status: progress.status,
      wordCount: progress.wordCount,
      finalContentLength: progress.finalContent?.length || 0
    });

  } catch (error) {
    console.error('❌ 端到端测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

endToEndTest().catch(console.error);