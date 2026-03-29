// 直接测试previousChaptersContent修复
const axios = require('axios');

async function testFix() {
  try {
    console.log('🔍 开始测试previousChaptersContent修复...');
    
    // 模拟章节生成请求，专门测试previousChaptersContent参数
    const payload = {
      theme: '测试小说主题',
      outline: '这是一个关于测试的故事概述，主要讲述了一个勇敢的主角如何面对挑战。',
      currentChapter: 3,
      allChapters: [
        { index: 1, title: '第一章', summary: '主角介绍', id: 'ch1', wordCount: 500 },
        { index: 2, title: '第二章', summary: '初次挑战', id: 'ch2', wordCount: 600 },
        { index: 3, title: '第三章', summary: '成长历程', id: 'ch3', wordCount: 700 }
      ],
      previousChaptersContent: [
        {
          index: 1,
          title: '第一章',
          content: '这是第一章的内容。\n主角张三是一个普通的程序员。\n他每天都在写代码。\n生活平淡但充实。\n直到有一天，他收到了一个神秘的邮件。',
          status: 'completed'
        },
        {
          index: 2,
          title: '第二章',
          content: '这是第二章的内容。\n张三打开了那封邮件。\n邮件中包含了一个挑战。\n他决定接受这个挑战。\n这是他人生的重要转折点。',
          status: 'completed'
        }
      ],
      model: 'deepseek-ai/deepseek-chat',
      targetWords: 500
    };

    console.log('📤 发送测试请求，包含以下previousChaptersContent:');
    console.log(`  - 章节数量: ${payload.previousChaptersContent.length}`);
    payload.previousChaptersContent.forEach((ch, i) => {
      console.log(`  - 第${ch.index}章《${ch.title}》: ${ch.content.length}字符`);
    });

    const response = await axios.post('http://localhost:3001/story/generate-chapter-stream', payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream'
    });

    console.log('✅ 请求已发送，等待响应...');

    let contextFound = false;
    let completed = false;

    response.data.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'start') {
              console.log('🚀 生成开始:', data.message);
            } else if (data.type === 'content') {
              // 检查是否包含了上下文信息
              if (data.content.includes('前一章') || data.content.includes('近期章节') || data.content.includes('更早章节')) {
                contextFound = true;
                console.log('🔍 检测到上下文信息在生成内容中!');
              }
              console.log('📝 收到内容:', data.content.substring(0, 50) + '...');
            } else if (data.type === 'done') {
              console.log('✅ 生成完成!');
              completed = true;
            } else if (data.type === 'error') {
              console.error('❌ 生成错误:', data.error);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    return new Promise((resolve) => {
      response.data.on('end', () => {
        console.log('🏁 请求结束');
        resolve({
          success: completed,
          contextFound,
          message: contextFound ? '✅ previousChaptersContent修复成功!' : '⚠️ 上下文信息未在生成内容中检测到'
        });
      });

      response.data.on('error', (error) => {
        console.error('💥 请求错误:', error);
        resolve({
          success: false,
          contextFound: false,
          message: `❌ 请求失败: ${error.message}`
        });
      });
    });

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return {
      success: false,
      contextFound: false,
      message: `❌ 测试异常: ${error.message}`
    };
  }
}

if (require.main === module) {
  testFix().then(result => {
    console.log('\n' + '='.repeat(50));
    console.log('🎯 测试结果:', result.message);
    console.log('='.repeat(50));
    process.exit(result.success && result.contextFound ? 0 : 1);
  });
}

module.exports = { testFix };