// 简单测试统一上下文生成功能
const axios = require('axios');

async function simpleTest() {
  console.log('🚀 开始简单测试...');
  
  // 测试基本连接
  try {
    console.log('1. 测试服务器连接...');
    const response = await axios.get('http://localhost:3001/models', { timeout: 5000 });
    console.log('✅ 服务器连接正常:', response.data.models?.length || 0, '个模型');
  } catch (error) {
    console.error('❌ 服务器连接失败:', error.message);
    return;
  }

  // 测试统一生成API
  try {
    console.log('2. 测试统一生成API...');
    
    const testParams = {
      theme: '现代都市爱情故事：程序员女孩在咖啡店的邂逅',
      instruction: '创作一部温馨浪漫的短篇小说，重点描写男女主角的初遇和情感发展',
      targetWordCount: 1500,
      model: 'deepseek-ai/DeepSeek-V2.5'
    };

    console.log('📤 发送参数:', {
      theme: testParams.theme.substring(0, 30) + '...',
      targetWordCount: testParams.targetWordCount,
      model: testParams.model
    });

    // 使用POST请求测试
    const response = await axios.post(
      'http://localhost:3001/story/generate-unified-context',
      testParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000 // 2分钟超时
      }
    );

    console.log('✅ API响应状态:', response.status);
    console.log('📝 响应数据类型:', typeof response.data);
    
    if (typeof response.data === 'string') {
      console.log('📄 收到流式响应，长度:', response.data.length);
      const lines = response.data.split('\n').filter(line => line.trim());
      console.log('📊 响应行数:', lines.length);
      
      // 分析响应内容
      const startEvents = lines.filter(line => line.includes('"start"')).length;
      const contentEvents = lines.filter(line => line.includes('"content"')).length;
      const doneEvents = lines.filter(line => line.includes('"done"')).length;
      const errorEvents = lines.filter(line => line.includes('"error"')).length;
      
      console.log('📈 事件统计:');
      console.log('  - start 事件:', startEvents);
      console.log('  - content 事件:', contentEvents);
      console.log('  - done 事件:', doneEvents);
      console.log('  - error 事件:', errorEvents);
      
      if (errorEvents > 0) {
        console.log('⚠️ 发现错误事件，检查错误详情...');
        const errorLines = lines.filter(line => line.includes('"error"'));
        errorLines.forEach((line, index) => {
          try {
            const errorData = JSON.parse(line.replace('data: ', ''));
            console.log(`  错误 ${index + 1}:`, errorData.error);
          } catch (e) {
            console.log(`  错误 ${index + 1}: [解析失败] ${line.substring(0, 100)}`);
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ 统一生成API测试失败:');
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  响应数据:', error.response.data);
    } else if (error.code === 'ECONNRESET') {
      console.error('  连接重置 - 可能是服务器超时或关闭');
    } else {
      console.error('  错误信息:', error.message);
    }
  }
}

// 运行测试
simpleTest().catch(console.error);