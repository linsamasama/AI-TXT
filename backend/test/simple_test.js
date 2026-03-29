// 简化的章节上下文测试
const axios = require('axios');

async function simpleTest() {
  try {
    console.log('🧪 开始简化测试...');
    
    // 测试1: 有 previousChaptersContent 的情况
    const testPayload1 = {
      theme: '测试小说',
      outline: '这是一个测试故事',
      currentChapter: 2,
      allChapters: [
        { index: 1, title: '第一章', summary: '第一章简介', id: 'ch1' },
        { index: 2, title: '第二章', summary: '第二章简介', id: 'ch2' }
      ],
      previousChaptersContent: [
        {
          index: 1,
          title: '第一章',
          content: '这是第一章的内容。\n包含了故事的开端。\n主角登场。\n重要事件发生。\n为后续埋下伏笔。',
          status: 'completed'
        }
      ],
      model: 'deepseek-ai/deepseek-chat',
      targetWords: 50
    };

    console.log('测试1: 发送包含previousChaptersContent的请求');
    
    const response1 = await axios.post('http://localhost:3001/story/generate-chapter-stream', testPayload1, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream'
    });

    let hasContextInfo = false;
    
    return new Promise((resolve, reject) => {
      response1.data.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'start') {
                console.log('✅ 请求成功:', data.message);
              } else if (data.type === 'content') {
                console.log('📝 收到内容片段:', data.content?.substring(0, 20) + '...');
              } else if (data.type === 'done') {
                console.log('✅ 生成完成');
                hasContextInfo = true;
                resolve(true);
              } else if (data.type === 'error') {
                console.error('❌ 生成错误:', data.error);
                reject(new Error(data.error));
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      response1.data.on('error', reject);
      response1.data.on('end', () => {
        if (!hasContextInfo) {
          console.log('⚠️  流结束但没有完成标记');
          resolve(false);
        }
      });
    });

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
    return false;
  }
}

if (require.main === module) {
  simpleTest().then(success => {
    console.log(success ? '🎉 测试通过!' : '⚠️ 测试未完成');
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('💥 测试异常:', err);
    process.exit(1);
  });
}

module.exports = { simpleTest };