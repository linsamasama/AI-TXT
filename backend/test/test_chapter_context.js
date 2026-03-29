// 测试章节上下文修复效果
const axios = require('axios');

async function testChapterContext() {
  try {
    console.log('🧪 测试章节生成上下文功能...');
    
    // 模拟一个章节生成请求，包含 previousChaptersContent
    const testPayload = {
      theme: '测试小说主题',
      outline: '这是一个测试故事概述',
      currentChapter: 2,
      allChapters: [
        { index: 1, title: '第一章', summary: '第一章简介', id: 'ch1' },
        { index: 2, title: '第二章', summary: '第二章简介', id: 'ch2' }
      ],
      previousChaptersContent: [
        {
          index: 1,
          title: '第一章',
          content: '这是第一章的内容。\n这是第二行。\n这是第三行。\n这是第四行。\n这是第五行。',
          status: 'completed'
        }
      ],
      model: 'deepseek-ai/deepseek-chat',
      targetWords: 1000
    };

    console.log('📤 发送测试请求...', {
      previousChaptersCount: testPayload.previousChaptersContent.length,
      firstChapterContentLength: testPayload.previousChaptersContent[0]?.content?.length
    });

    const response = await axios.post('http://localhost:3001/story/generate-chapter-stream', testPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    console.log('✅ 请求发送成功，等待响应...');

    // 处理流式响应
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
              console.log('🚀 开始生成:', data.message);
            } else if (data.type === 'content') {
              console.log('📝 收到内容:', {
                progress: data.progress,
                wordCount: data.wordCount,
                contentPreview: data.content?.substring(0, 50) + '...'
              });
            } else if (data.type === 'done') {
              console.log('✅ 生成完成:', {
                finalWordCount: data.wordCount
              });
              return;
            } else if (data.type === 'error') {
              console.error('❌ 生成错误:', data.error);
              return;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    response.data.on('end', () => {
      console.log('🏁 流响应结束');
    });

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
if (require.main === module) {
  testChapterContext();
}

module.exports = { testChapterContext };