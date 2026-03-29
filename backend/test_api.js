const axios = require('axios');

const BASE = 'http://localhost:3001';

async function testOutlineAPI() {
  try {
    console.log('测试大纲生成API...');
    const response = await axios.post(`${BASE}/story/generate-outline`, {
      theme: '未来世界的人工智能助手',
      wordCount: 1000
    });
    
    console.log('API调用成功！');
    console.log('响应数据:', response.data);
    
    if (response.data.success) {
      const outline = response.data.outline;
      console.log('\n=== 大纲内容 ===');
      console.log('概述:', outline.overview);
      console.log('章节数量:', outline.chapters.length);
      outline.chapters.forEach((ch, i) => {
        console.log(`章节${i + 1} - 索引${ch.index}: ${ch.title} - ${ch.summary}`);
      });
    }
  } catch (error) {
    console.error('API调用失败:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
  }
}

testOutlineAPI();