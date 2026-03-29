// 最简单的参数验证测试
const axios = require('axios');

async function testParameters() {
  try {
    console.log('🧪 测试参数验证...');
    
    // 发送最简单的请求，只包含必需参数
    const minimalPayload = {
      theme: '测试',
      outline: '测试概述',
      currentChapter: 1,
      allChapters: [{ index: 1, title: '第一章', summary: '简介', id: 'ch1' }],
      previousChaptersContent: [],
      model: 'deepseek-ai/deepseek-chat',
      targetWords: 50
    };

    console.log('发送最小参数请求...');

    // 首先测试基本请求是否工作
    try {
      const response = await axios.post('http://localhost:3001/story/generate-chapter-stream', minimalPayload, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream'
      });

      console.log('✅ 请求格式正确，等待响应...');

      response.data.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'start') {
                console.log('✅ 收到开始信号:', data.message);
              } else if (data.type === 'error') {
                console.error('❌ 生成错误:', data.error);
              }
            } catch (e) {
              // 忽略
            }
          }
        }
      });

      return true;
    } catch (error) {
      console.error('❌ 请求失败:', error.message);
      if (error.response) {
        console.error('响应数据:', error.response.data);
      }
      return false;
    }

  } catch (error) {
    console.error('❌ 测试异常:', error);
    return false;
  }
}

if (require.main === module) {
  testParameters().then(success => {
    console.log(success ? '✅ 基本测试通过' : '❌ 基本测试失败');
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testParameters };