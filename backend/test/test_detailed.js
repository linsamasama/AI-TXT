// 详细测试统一生成功能
const axios = require('axios');

async function detailedTest() {
  console.log('🔬 开始详细测试...');
  
  const testParams = {
    theme: '校园青春故事：学霸女孩与体育特长生的纯真友谊',
    instruction: '描写高中校园生活，展现青春期的友情、学业压力和懵懂的情感',
    targetWordCount: 2000,
    model: 'deepseek-ai/DeepSeek-V2.5',
    options: {
      enableIntelligentChunking: true,
      enableProgressCache: true
    }
  };

  try {
    const response = await axios.post(
      'http://localhost:3001/story/generate-unified-context',
      testParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000 // 3分钟超时
      }
    );

    // 解析流式响应
    const lines = response.data.split('\n').filter(line => line.trim());
    let finalContent = '';
    let totalWordCount = 0;
    let cacheId = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          
          switch (data.type) {
            case 'start':
              console.log('🚀 生成开始:', data.message);
              cacheId = data.cacheId;
              console.log('📋 Cache ID:', cacheId);
              console.log('📊 预估块数:', data.estimatedChunks);
              break;
              
            case 'content':
              console.log('📝 内容更新:', {
                progress: data.progress,
                wordCount: data.wordCount
              });
              if (data.fullContent) {
                finalContent = data.fullContent;
              }
              totalWordCount = data.wordCount || totalWordCount;
              break;
              
            case 'done':
              console.log('✅ 生成完成!');
              console.log('📊 最终字数:', data.wordCount);
              console.log('📋 Cache ID:', data.cacheId);
              finalContent = data.content || finalContent;
              totalWordCount = data.wordCount;
              break;
              
            case 'error':
              console.error('❌ 生成错误:', data.error);
              console.log('🔄 可重试:', data.canRetry);
              break;
          }
        } catch (parseError) {
          console.warn('⚠️ 解析事件失败:', parseError.message);
        }
      }
    }

    // 显示生成结果
    if (finalContent) {
      console.log('\n📖 生成的内容:');
      console.log('='.repeat(50));
      console.log(finalContent);
      console.log('='.repeat(50));
      console.log('📏 实际字数:', finalContent.length);
      console.log('🎯 目标字数:', testParams.targetWordCount);
      console.log('📈 完成率:', Math.round((finalContent.length / testParams.targetWordCount) * 100), '%');
    } else {
      console.log('⚠️ 没有收到最终内容');
    }

    // 测试缓存功能
    if (cacheId) {
      console.log('\n📦 测试缓存功能...');
      try {
        const progressResponse = await axios.get(`http://localhost:3001/story/generation-progress/${cacheId}`);
        if (progressResponse.data.success) {
          console.log('✅ 缓存查询成功');
          console.log('📊 进度状态:', progressResponse.data.progress.status);
          console.log('📝 字数统计:', progressResponse.data.progress.wordCount);
        } else {
          console.log('⚠️ 缓存查询失败:', progressResponse.data.error);
        }
      } catch (cacheError) {
        console.log('❌ 缓存查询异常:', cacheError.message);
      }
    }

  } catch (error) {
    console.error('❌ 详细测试失败:');
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  响应:', error.response.data);
    } else {
      console.error('  错误:', error.message);
    }
  }
}

// 运行详细测试
detailedTest().catch(console.error);