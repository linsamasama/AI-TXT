// 简单的模型测试
const axios = require('axios');
require('../env');

const siliconToken = process.env.SILICONFLOW_API_KEY;
if (!siliconToken) {
  throw new Error('未配置 SILICONFLOW_API_KEY');
}

async function testModels() {
  const models = [
    'Qwen/Qwen2.5-7B-Instruct',
    'meta-llama/Llama-3.2-3B-Instruct', 
    'deepseek-ai/DeepSeek-V3',
    'THUDM/glm-4'
  ];

  for (const model of models) {
    try {
      console.log('测试模型:', model);
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
      console.log('✅ 模型可用:', model);
      console.log('响应:', JSON.stringify(response.data, null, 2));
      return model;
    } catch (error) {
      console.log('❌ 模型失败:', model, error.response?.data?.message);
    }
  }
}

if (require.main === module) {
  testModels();
}

module.exports = { testModels };
