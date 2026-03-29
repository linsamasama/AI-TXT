const SimpleDatabase = require('./simpleDatabase');

console.log('开始测试数据库...');

const db = new SimpleDatabase();

async function test() {
  try {
    console.log('1. 创建测试小说...');
    const story1 = await db.createStory({
      title: '测试小说1',
      content: '这是第一本测试小说的内容，大约有100个字。这只是一个测试内容，用来验证数据库的基本功能是否正常工作。',
      instruction: '创建一本测试小说',
      model: 'test-model',
      target_word_count: 100
    });
    console.log('✓ 创建成功:', story1.id, story1.title);

    console.log('2. 创建第二本测试小说...');
    const story2 = await db.createStory({
      title: '测试小说2',
      content: '这是第二本测试小说的内容，内容更长一些，大约有200个字。这是用来测试字数筛选功能的。内容包含更多的文字，以确保测试数据的完整性。',
      instruction: '创建第二本测试小说',
      model: 'test-model',
      target_word_count: 200
    });
    console.log('✓ 创建成功:', story2.id, story2.title);

    console.log('3. 查询所有小说...');
    const allStories = await db.getStories();
    console.log('✓ 查询成功，总数:', allStories.length);
    allStories.forEach(story => {
      console.log(`  - ${story.title} (${story.actual_word_count}字, ${story.status})`);
    });

    console.log('4. 测试字数筛选...');
    const filteredStories = await db.getStoriesByWordCountRange(50, 150);
    console.log('✓ 筛选成功，结果:', filteredStories.length, '本');
    
    console.log('5. 测试统计信息...');
    const stats = await db.getStatistics();
    console.log('✓ 统计信息:', {
      总数: stats.total_stories,
      总字数: stats.total_words,
      平均字数: stats.avg_words,
      已完成: stats.completed_stories,
      草稿: stats.draft_stories
    });

    console.log('6. 测试更新小说...');
    await db.updateStory(story1.id, {
      status: 'completed',
      content: story1.content + '\n\n这是新增的结尾内容。'
    });
    console.log('✓ 更新成功');

    console.log('7. 测试单个查询...');
    const updatedStory = await db.getStory(story1.id);
    console.log('✓ 查询成功:', updatedStory.status, updatedStory.actual_word_count, '字');

    console.log('\n🎉 所有数据库测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

test();