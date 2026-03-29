const express = require('express');
const cors = require('cors');
const SimpleDatabase = require('./simpleDatabase');

const app = express();
const db = new SimpleDatabase();

// 中间件
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));

// 小说管理API
app.post('/stories', async (req, res) => {
  try {
    const { title, content, outline, instruction, model, target_word_count } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    
    const story = await db.createStory({
      title,
      content,
      outline,
      instruction,
      model,
      target_word_count: target_word_count || 1000
    });
    
    res.json({ success: true, story });
  } catch (err) {
    console.error('创建小说失败:', err);
    res.status(500).json({ error: '创建小说失败', detail: err.message });
  }
});

app.get('/stories', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      minWordCount,
      maxWordCount,
      status,
      orderBy = 'created_at',
      order = 'DESC',
      keyword
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const stories = await db.getStories({
      minWordCount: minWordCount ? parseInt(minWordCount) : undefined,
      maxWordCount: maxWordCount ? parseInt(maxWordCount) : undefined,
      status,
      orderBy,
      order,
      limit: parseInt(limit),
      offset,
      keyword
    });
    
    // 获取总数用于分页
    const allStories = await db.getStories({
      minWordCount: minWordCount ? parseInt(minWordCount) : undefined,
      maxWordCount: maxWordCount ? parseInt(maxWordCount) : undefined,
      status,
      keyword
    });
    
    res.json({
      stories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: allStories.length,
        totalPages: Math.ceil(allStories.length / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('获取小说列表失败:', err);
    res.status(500).json({ error: '获取小说列表失败', detail: err.message });
  }
});

app.get('/stories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const story = await db.getStory(id);
    
    if (!story) {
      return res.status(404).json({ error: '小说不存在' });
    }
    
    // 获取章节信息
    const chapters = await db.getChaptersByStoryId(id);
    
    res.json({ story, chapters });
  } catch (err) {
    console.error('获取小说详情失败:', err);
    res.status(500).json({ error: '获取小说详情失败', detail: err.message });
  }
});

app.put('/stories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const result = await db.updateStory(id, updates);
    res.json({ success: true, story: result });
  } catch (err) {
    console.error('更新小说失败:', err);
    res.status(500).json({ error: '更新小说失败', detail: err.message });
  }
});

app.delete('/stories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.deleteStory(id);
    
    if (result.deleted === 0) {
      return res.status(404).json({ error: '小说不存在' });
    }
    
    res.json({ success: true, deleted: result.deleted });
  } catch (err) {
    console.error('删除小说失败:', err);
    res.status(500).json({ error: '删除小说失败', detail: err.message });
  }
});

app.get('/stories/by-word-count', async (req, res) => {
  try {
    const { minCount, maxCount } = req.query;
    if (!minCount || !maxCount) {
      return res.status(400).json({ error: '需要提供最小和最大字数' });
    }
    
    const stories = await db.getStoriesByWordCountRange(
      parseInt(minCount),
      parseInt(maxCount)
    );
    
    res.json({ stories });
  } catch (err) {
    console.error('按字数筛选小说失败:', err);
    res.status(500).json({ error: '按字数筛选小说失败', detail: err.message });
  }
});

app.get('/stories/stats', async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json(stats);
  } catch (err) {
    console.error('获取统计信息失败:', err);
    res.status(500).json({ error: '获取统计信息失败', detail: err.message });
  }
});

// 启动服务器
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`服务器启动成功，监听端口 ${PORT}`);
  console.log('小说管理API已就绪');
});