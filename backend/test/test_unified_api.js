// 测试统一上下文生成API的完整功能
const axios = require('axios');

async function testUnifiedAPI() {
  console.log('🚀 测试统一上下文生成API...');
  
  const testParams = {
    theme: '现代校园爱情故事',
    instruction: '创作一部温馨的校园爱情短篇小说，描写大学生活中的美好时光',
    targetWordCount: 1500,
    model: 'deepseek-ai/DeepSeek-V2.5',
    options: {
      enableIntelligentChunking: true,
      enableProgressCache: true
    }
  };

  try {
    console.log('📤 发送请求...');
    
    const response = await axios.post(
      'http://localhost:3001/story/generate-unified-context',
      testParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000 // 3分钟
      }
    );

    console.log('✅ 收到响应，长度:', response.data.length);
    
    // 解析响应内容
    const lines = response.data.split('\n').filter(line => line.trim());
    let events = [];
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          events.push(event);
          
          switch (event.type) {
            case 'start':
              console.log('🎬 开始事件:', event.message);
              break;
            case 'content':
              console.log('📝 内容事件:', {
                progress: event.progress,
                wordCount: event.wordCount
              });
              break;
            case 'done':
              console.log('🏁 完成事件:', {
                wordCount: event.wordCount,
                cacheId: event.cacheId
              });
              break;
            case 'error':
              console.error('❌ 错误事件:', event.error);
              break;
          }
        } catch (parseError) {
          console.warn('⚠️ 解析事件失败:', parseError.message);
        }
      }
    }
    
    console.log('📊 总计事件:', events.length);
    
    // 显示最后的内容
    const lastEvent = events[events.length - 1];
    if (lastEvent && (lastEvent.type === 'done' || lastEvent.content)) {
      console.log('\n📖 生成的最终内容:');
      console.log('='.repeat(50));
      console.log(lastEvent.content || '无内容');
      console.log('='.repeat(50));
      console.log('📏 最终字数:', lastEvent.content?.length || 0);
    } else {
      console.log('⚠️ 未收到完成事件');
    }

  } catch (error) {
    console.error('❌ 测试失败:');
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  响应:', error.response.data);
    } else {
      console.error('  错误:', error.message);
    }
  }
}

testUnifiedAPI().catch(console.error);