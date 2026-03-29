const fetch = require('node-fetch');

const testMultiThemeGeneration = async () => {
  try {
    console.log('🧪 测试多主题生成功能...');
    
    // 模拟多主题输入
    const multiThemeInput = `科幻冒险故事
悬疑探案故事
浪漫爱情故事`;
    
    const basicInstruction = '请写一个精彩的故事';
    
    console.log('📝 发送多主题生成请求:', { basicInstruction, themes: multiThemeInput.split('\n').length });
    
    const response = await fetch('http://192.168.31.61:3001/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        basicInstruction,
        theme: multiThemeInput,
        modelType: 'story',
        model: 'Qwen/Qwen3-14B' // 使用较小的模型进行测试
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.content) {
      console.log('✅ 多主题生成成功!');
      console.log('📄 生成内容长度:', data.content.length);
      console.log('🔍 内容预览:', data.content.substring(0, 200) + '...');
      
      // 检查是否包含多个主题的内容
      const content = data.content.toLowerCase();
      const hasSciFi = content.includes('科幻') || content.includes('未来') || content.includes('太空');
      const hasMystery = content.includes('悬疑') || content.includes('探案') || content.includes('神秘');
      const hasRomance = content.includes('爱情') || content.includes('浪漫') || content.includes('恋爱');
      
      console.log('🎭 主题分析:');
      console.log('  - 科幻元素:', hasSciFi ? '✅' : '❌');
      console.log('  - 悬疑元素:', hasMystery ? '✅' : '❌');
      console.log('  - 爱情元素:', hasRomance ? '✅' : '❌');
      
      return true;
    } else {
      console.error('❌ 生成内容为空');
      return false;
    }
    
  } catch (error) {
      console.error('❌ 多主题生成测试失败:', error.message);
    return false;
  }
}

// 运行测试
testMultiThemeGeneration().then(success => {
  if (success) {
    console.log('🎉 多主题生成功能测试通过!');
  } else {
    console.log('💥 多主题生成功能测试失败!');
  }
  process.exit(success ? 0 : 1);
});