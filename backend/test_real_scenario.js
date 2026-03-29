const axios = require('axios');

async function testRealScenario() {
  console.log('🔍 测试真实场景中的previousChaptersContent...');
  
  try {
    // 第一步：生成第一章
    console.log('\n第1步: 生成第一章');
    const chapter1Response = await generateChapter([]);
    
    // 等待一下模拟真实情况
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 第二步：生成第二章（第一章应该作为上下文）
    console.log('\n第2步: 生成第二章（应该包含第一章上下文）');
    const chapter1Content = {
      index: 1,
      title: '第一章：初遇',
      content: chapter1Response.content,
      status: 'completed'
    };
    
    const chapter2Response = await generateChapter([chapter1Content]);
    
    console.log('\n✅ 真实场景测试完成!');
    console.log(`第一章内容长度: ${chapter1Content.content.length} 字符`);
    console.log(`第二章内容长度: ${chapter2Response.content.length} 字符`);
    console.log(`第二章是否包含上下文引用: ${chapter2Response.content.includes('前一章') || chapter2Response.content.includes('之前') || chapter2Response.content.includes('回忆')}`);
    
    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return false;
  }
}

async function generateChapter(previousChaptersContent) {
  const payload = {
    theme: '都市爱情故事',
    outline: {
      overview: '一个关于现代都市男女相遇相爱的温情故事。',
      chapters: [
        { index: 1, title: '第一章：初遇', summary: '偶然的相遇改变了两个人的命运', id: 'ch1' },
        { index: 2, title: '第二章：了解', summary: '通过交流加深了对彼此的了解', id: 'ch2' }
      ]
    },
    currentChapter: previousChaptersContent.length + 1,
    allChapters: [
      { index: 1, title: '第一章：初遇', summary: '偶然的相遇改变了两个人的命运', id: 'ch1' },
      { index: 2, title: '第二章：了解', summary: '通过交流加深了对彼此的了解', id: 'ch2' }
    ],
    previousChaptersContent,
    model: 'deepseek-ai/DeepSeek-V2.5',
    targetWords: 300
  };

  return new Promise((resolve, reject) => {
    let fullContent = '';
    
    axios.post('http://localhost:3001/story/generate-chapter-stream', payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream'
    }).then(response => {
      
      response.data.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content') {
                fullContent += data.content;
              } else if (data.type === 'done') {
                resolve({ content: fullContent });
                return;
              } else if (data.type === 'error') {
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
        if (fullContent) {
          resolve({ content: fullContent });
        } else {
          reject(new Error('请求结束但没有收到内容'));
        }
      });
    }).catch(reject);
  });
}

if (require.main === module) {
  testRealScenario().then(success => {
    console.log('\n' + '='.repeat(50));
    console.log(success ? '🎉 previousChaptersContent修复验证成功!' : '❌ 修复验证失败');
    console.log('='.repeat(50));
    process.exit(success ? 0 : 1);
  });
}