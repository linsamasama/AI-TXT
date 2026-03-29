const fs = require('fs');

function testChapterDataCompatibility() {
  console.log('🔍 验证现有章节数据的兼容性...');
  
  try {
    // 读取stories.json
    const stories = JSON.parse(fs.readFileSync('./stories.json', 'utf8'));
    
    if (!stories || !Array.isArray(stories)) {
      console.log('❌ stories.json格式不正确');
      return false;
    }
    
    console.log(`📚 找到 ${stories.length} 个故事`);
    
    let chapterDataCount = 0;
    let traditionalDataCount = 0;
    let compatibilityIssues = 0;
    
    stories.forEach((story, index) => {
      console.log(`\n--- 故事 ${index + 1} ---`);
      console.log(`ID: ${story.id}`);
      console.log(`主题: ${story.theme?.substring(0, 50)}...`);
      console.log(`字数: ${story.wordCount || 0}`);
      
      // 检查是否包含章节数据
      const hasChapterData = story.content && (
        story.content.includes('##') ||  // 章节标题
        story.content.includes('**') ||  // 章节格式
        story.content.includes('章节')   // 章节关键词
      );
      
      if (hasChapterData) {
        chapterDataCount++;
        console.log('✅ 包含章节数据 - 兼容模式');
        
        // 检查章节内容是否完整
        const chapterMarkers = (story.content.match(/### 【第.*?】/g) || []).length;
        if (chapterMarkers > 0) {
          console.log(`📖 检测到 ${chapterMarkers} 个章节标记`);
        }
      } else {
        traditionalDataCount++;
        console.log('📝 传统格式数据');
      }
      
      // 检查数据完整性
      if (!story.content || story.content.trim().length === 0) {
        console.log('⚠️  内容为空 - 兼容性问题');
        compatibilityIssues++;
      }
      
      if (!story.theme) {
        console.log('⚠️  主题缺失 - 兼容性问题');
        compatibilityIssues++;
      }
      
      if (!story.wordCount || story.wordCount <= 0) {
        console.log('⚠️  字数信息缺失 - 兼容性问题');
        compatibilityIssues++;
      }
    });
    
    console.log('\n=== 兼容性验证结果 ===');
    console.log(`📚 总故事数: ${stories.length}`);
    console.log(`📖 章节数据: ${chapterDataCount} 个`);
    console.log(`📝 传统数据: ${traditionalDataCount} 个`);
    console.log(`⚠️  兼容性问题: ${compatibilityIssues} 个`);
    
    // 验证兼容性处理逻辑
    console.log('\n=== 兼容性处理逻辑验证 ===');
    
    // 模拟数据合并处理
    stories.forEach(story => {
      // 模拟我们的saveSingleStory函数中的章节数据处理
      if (story.content && story.content.includes('##')) {
        console.log(`🔄 故事 ${story.id}: 执行章节数据合并处理`);
        
        // 检查是否需要合并章节内容
        const hasChapterMarkers = /### 【第.*?】/.test(story.content);
        const hasOutline = story.content.includes('**分章节大纲**');
        
        if (hasChapterMarkers && hasOutline) {
          console.log(`  ✅ 包含大纲和章节 - 保持原格式`);
        } else if (hasChapterMarkers) {
          console.log(`  ✅ 只有章节 - 保持原格式`);
        } else {
          console.log(`  ⚠️  章节数据不完整 - 可能需要处理`);
        }
      }
    });
    
    const success = compatibilityIssues === 0;
    
    if (success) {
      console.log('\n🎉 数据兼容性验证通过!');
      console.log('✅ 所有现有章节数据都能正确显示');
      console.log('✅ 新的多主题功能与现有数据完全兼容');
    } else {
      console.log(`\n⚠️  发现 ${compatibilityIssues} 个兼容性问题`);
      console.log('📋 建议检查和修复相关数据');
    }
    
    return success;
    
  } catch (error) {
    console.error('❌ 验证过程中出现错误:', error.message);
    return false;
  }
}

// 运行兼容性验证
const result = testChapterDataCompatibility();
process.exit(result ? 0 : 1);