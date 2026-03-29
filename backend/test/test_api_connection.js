// 测试基本API连接
const axios = require('axios');
require('../env');

async function testAPIConnection() {
  console.log('🔗 测试API连接...');
  
  const siliconToken = process.env.SILICONFLOW_API_KEY;
  if (!siliconToken) {
    throw new Error('未配置 SILICONFLOW_API_KEY');
  }
  
  try {
    // 测试简单请求
    const response = await axios.post(
      'https://api.siliconflow.cn/v1/chat/completions',
      {
        model: 'deepseek-ai/DeepSeek-V2.5',
        messages: [{ role: "user", content: "请说一句话测试连接" }],
        max_tokens: 50,
        temperature: 0.5
      },
      {
        headers: {
          'Authorization': `Bearer ${siliconToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log('✅ API连接成功');
    console.log('📝 响应内容:', response.data.choices[0]?.message?.content);
    console.log('📊 Token使用:', response.data.usage);
    
  } catch (error) {
    console.error('❌ API连接失败:');
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  错误信息:', error.response.data);
    } else {
      console.error('  网络错误:', error.message);
    }
  }
}

testAPIConnection().catch(console.error);
