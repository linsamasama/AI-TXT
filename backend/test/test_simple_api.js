// 测试简化生成API
const axios = require('axios');

async function testSimpleAPI() {
  console.log('🚀 测试简化生成API...');
  
  const testParams = {
    theme: '现代都市爱情故事',
    instruction: '创作一部温馨的都市爱情小说，描写年轻男女在大城市中的相遇和相知',
    targetWordCount: 1500,
    model: 'deepseek-ai/DeepSeek-V2.5'
  };

  try {
    console.log('📤 发送请求到简化API...');
    
    const response = await axios.post(
      'http://localhost:3001/story/generate-simple',
      testParams,
      {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
        timeout: 300000 // 5分钟
      }
    );

    console.log('✅ 收到流式响应');

    let finalContent = '';
    let totalWordCount = 0;
    let events = [];

    response.data.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            events.push(event);
            
            switch (event.type) {
              case 'start':
                console.log('🎬 开始生成:', event.message);
                break;
                
              case 'content':
                console.log('📝 内容更新:', {
                  progress: event.progress,
                  wordCount: event.wordCount
                });
                if (event.fullContent) {
                  finalContent = event.fullContent;
                }
                totalWordCount = event.wordCount || totalWordCount;
                break;
                
              case 'done':
                console.log('🏁 生成完成!');
                console.log('📊 最终字数:', event.wordCount);
                finalContent = event.content || finalContent;
                totalWordCount = event.wordCount;
                break;
                
              case 'error':
                console.error('❌ 生成错误:', event.error);
                break;
            }
          } catch (parseError) {
            console.warn('⚠️ 解析事件失败:', parseError.message);
          }
        }
      }
    });

    return new Promise((resolve, reject) => {
      response.data.on('end', () => {
        console.log('\n📖 最终生成内容:');
        console.log('='.repeat(50));
        console.log(finalContent);
        console.log('='.repeat(50));
        console.log('📏 总字数:', totalWordCount);
        console.log('📊 事件总数:', events.length);
        
        resolve({
          success: true,
          content: finalContent,
          wordCount: totalWordCount,
          events: events
        });
      });

      response.data.on('error', (error) => {
        console.error('❌ 流式响应错误:', error);
        reject(error);
      });
    });

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

testSimpleAPI().catch(console.error);