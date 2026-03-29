// 调试统一生成器的具体问题
const UnifiedContextGenerator = require('./unified_generator');

async function debugGenerator() {
  console.log('🔍 调试统一生成器...');
  
  const generator = new UnifiedContextGenerator();
  
  const testParams = {
    theme: '测试故事',
    instruction: '测试指令',
    targetWordCount: 1000,
    model: 'deepseek-ai/DeepSeek-V2.5'
  };

  try {
    // 直接调用生成器的内部方法
    console.log('1. 测试智能分块...');
    const chunks = generator.chunkingStrategy.splitIntoChunks('测试内容', 1000);
    console.log('分块结果:', chunks.length, '个块');

    console.log('2. 测试大纲生成...');
    const outline = await generator.generateStoryOutline('测试主题', 1000);
    console.log('大纲结果:', outline);

    console.log('3. 测试单块生成...');
    const singleChunkResult = await generator.generateSingleChunk(
      'test_cache',
      testParams.theme,
      testParams.instruction,
      testParams.targetWordCount,
      testParams.model,
      0,
      [],
      {}
    );
    console.log('单块生成结果:', singleChunkResult);

  } catch (error) {
    console.error('调试过程中出错:', error);
    console.error('错误堆栈:', error.stack);
  }
}

debugGenerator().catch(console.error);