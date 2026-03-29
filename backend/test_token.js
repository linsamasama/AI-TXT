// 测试SiliconFlow API token有效性
const axios = require('axios');

const siliconToken = "sk-diwjeywahoqnvyhjjkteqijorwkjvnnirvzisifosbothvbw";

async function testToken() {
  try {
    console.log('🔍 测试SiliconFlow API token...');
    
    // 使用最简单的请求测试token
    // 尝试一些常见的模型名称
    const models = [
      'Qwen/Qwen2.5-7B-Instruct',
      'meta-llama/Llama-3.2-3B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'THUDM/glm-4'
    ];

    for (const model of models) {
      try {
        console.log(`🧪 测试模型: ${model}`);
        const response = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        }, {
          headers: {
            'Authorization': 'Bearer ' + siliconToken,
            'Content-Type': 'application/json'
          }
        });
        console.log(`✅ 模型 ${model} 可用!`);
        console.log('响应数据:', response.data);
        return; // 找到可用模型就退出
      } catch (error) {
        console.log(`❌ 模型 ${model} 失败:`, error.response?.data?.message);
      }
    }
      headers: {
        'Authorization': `Bearer ${siliconToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Token有效!');
    console.log('响应状态:', response.status);
    console.log('响应数据:', response.data);

  } catch (error) {
    console.error('❌ Token无效或API调用失败:');
    console.error('状态码:', error.response?.status);
    console.error('状态文本:', error.response?.statusText);
    console.error('错误数据:', error.response?.data);
  }
}

if (require.main === module) {
  testToken();
}

module.exports = { testToken };