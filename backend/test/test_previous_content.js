// 测试previousChaptersContent具体问题
const axios = require('axios');

async function testPreviousContent() {
  console.log('🔍 测试previousChaptersContent处理...');
  
  // 测试1: 空的previousChaptersContent
  console.log('\n测试1: 空的previousChaptersContent');
  try {
    await sendRequest([]);
    console.log('✅ 空数组测试通过');
  } catch (error) {
    console.error('❌ 空数组测试失败:', error.message);
    return false;
  }

  // 测试2: 包含一个章节的previousChaptersContent
  console.log('\n测试2: 包含1个章节的previousChaptersContent');
  try {
    const singleChapter = [{
      index: 1,
      title: '第一章',
      content: '这是第一章内容。',
      status: 'completed'
    }];
    await sendRequest(singleChapter);
    console.log('✅ 单章节测试通过');
  } catch (error) {
    console.error('❌ 单章节测试失败:', error.message);
    return false;
  }

  // 测试3: 包含多个章节的previousChaptersContent
  console.log('\n测试3: 包含多个章节的previousChaptersContent');
  try {
    const multipleChapters = [
      {
        index: 1,
        title: '第一章',
        content: '第一章的内容。\n故事开始了。',
        status: 'completed'
      },
      {
        index: 2,
        title: '第二章',
        content: '第二章的内容。\n主角继续冒险。',
        status: 'completed'
      }
    ];
    await sendRequest(multipleChapters);
    console.log('✅ 多章节测试通过');
  } catch (error) {
    console.error('❌ 多章节测试失败:', error.message);
    return false;
  }

  return true;
}

async function sendRequest(previousChaptersContent) {
    const payload = {
      theme: '测试主题',
      outline: {
        overview: '这是一个测试故事的概述，主要讲述了主角的冒险经历。',
        chapters: [
          ...previousChaptersContent.map((ch, i) => ({
            index: ch.index,
            title: ch.title,
            summary: `第${ch.index}章简介`,
            id: `ch${ch.index}`
          })),
          {
            index: previousChaptersContent.length + 1,
            title: `第${previousChaptersContent.length + 1}章`,
            summary: `第${previousChaptersContent.length + 1}章简介`,
            id: `ch${previousChaptersContent.length + 1}`
          }
        ]
      },
      currentChapter: previousChaptersContent.length + 1,
      allChapters: [
        ...previousChaptersContent.map((ch, i) => ({
          index: ch.index,
          title: ch.title,
          summary: `第${ch.index}章简介`,
          id: `ch${ch.index}`
        })),
        {
          index: previousChaptersContent.length + 1,
          title: `第${previousChaptersContent.length + 1}章`,
          summary: `第${previousChaptersContent.length + 1}章简介`,
          id: `ch${previousChaptersContent.length + 1}`
        }
      ],
      previousChaptersContent,
      model: 'deepseek-ai/DeepSeek-V2.5',
      targetWords: 100
    };

  console.log(`发送请求，previousChaptersContent包含 ${previousChaptersContent.length} 个章节`);

  return new Promise((resolve, reject) => {
    axios.post('http://localhost:3001/story/generate-chapter-stream', payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream'
    }).then(response => {
      let hasStarted = false;
      
      response.data.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'start') {
                hasStarted = true;
                console.log(`  ✅ 收到开始: ${data.message}`);
              } else if (data.type === 'content') {
                console.log(`  📝 收到内容: ${data.content.substring(0, 30)}...`);
                // 检查是否使用了previousChaptersContent
                if (previousChaptersContent.length > 0 && 
                    (data.content.includes('前一章') || data.content.includes('上一章') || 
                     data.content.includes('第一') || data.content.includes('故事'))) {
                  console.log(`  🔍 检测到上下文信息在生成中!`);
                }
              } else if (data.type === 'done') {
                console.log(`  ✅ 生成完成`);
                resolve(true);
                return;
              } else if (data.type === 'error') {
                console.error(`  ❌ 生成错误: ${data.error}`);
                console.error(`  🔍 详细错误信息:`, data);
                reject(new Error(data.error));
                return;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      response.data.on('error', reject);
      response.data.on('end', () => {
        if (hasStarted) {
          resolve(true);
        } else {
          reject(new Error('请求结束但没有收到开始信号'));
        }
      });
    }).catch(error => {
      if (error.response) {
        console.error('❌ 请求错误详情:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else {
        console.error('❌ 请求错误:', error.message);
      }
      reject(error);
    });
  });
}

if (require.main === module) {
  testPreviousContent().then(success => {
    console.log('\n' + '='.repeat(50));
    console.log(success ? '🎉 所有测试通过! previousChaptersContent工作正常' : '❌ 测试失败');
    console.log('='.repeat(50));
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testPreviousContent };