const fs = require('fs');
const path = require('path');

// 简化的JSON文件存储实现（避免SQLite依赖问题）
const storiesPath = path.join(__dirname, 'stories.json');
const chaptersPath = path.join(__dirname, 'story_chapters.json');

class Database {
  constructor() {
    this.stories = this.loadStories();
    this.chapters = this.loadChapters();
    this.init();
  }

  init() {
    // 确保数据文件存在
    if (!fs.existsSync(storiesPath)) {
      this.saveStories();
    }
    if (!fs.existsSync(chaptersPath)) {
      this.saveChapters();
    }
  }

  loadStories() {
    try {
      if (fs.existsSync(storiesPath)) {
        return JSON.parse(fs.readFileSync(storiesPath, 'utf-8'));
      }
    } catch (error) {
      console.error('加载stories.json失败:', error);
    }
    return [];
  }

  loadChapters() {
    try {
      if (fs.existsSync(chaptersPath)) {
        return JSON.parse(fs.readFileSync(chaptersPath, 'utf-8'));
      }
    } catch (error) {
      console.error('加载story_chapters.json失败:', error);
    }
    return [];
  }

  saveStories() {
    try {
      fs.writeFileSync(storiesPath, JSON.stringify(this.stories, null, 2));
    } catch (error) {
      console.error('保存stories.json失败:', error);
    }
  }

  saveChapters() {
    try {
      fs.writeFileSync(chaptersPath, JSON.stringify(this.chapters, null, 2));
    } catch (error) {
      console.error('保存story_chapters.json失败:', error);
    }
  }

  // 小说相关操作
  async createStory(storyData) {
    return new Promise((resolve) => {
      const { title, content, outline, instruction, model, target_word_count } = storyData;
      const wordCount = content ? content.length : 0;
      const now = new Date().toISOString();
      
      const newStory = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        title,
        content: content || '',
        outline: outline || '',
        instruction: instruction || '',
        model: model || '',
        target_word_count: target_word_count || 1000,
        actual_word_count: wordCount,
        status: 'draft',
        created_at: now,
        updated_at: now
      };
      
      this.stories.push(newStory);
      this.saveStories();
      
      resolve(newStory);
    });
  }

  async updateStory(id, updates) {
    return new Promise((resolve, reject) => {
      const index = this.stories.findIndex(story => story.id === id);
      if (index === -1) {
        reject(new Error('Story not found'));
        return;
      }
      
      // 计算字数
      if (updates.content) {
        updates.actual_word_count = updates.content.length;
      }
      
      this.stories[index] = {
        ...this.stories[index],
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      this.saveStories();
      resolve(this.stories[index]);
    });
  }

  async getStory(id) {
    return new Promise((resolve) => {
      const story = this.stories.find(s => s.id === id);
      resolve(story || null);
    });
  }

  async getStories(options = {}) {
    return new Promise((resolve) => {
      let filteredStories = [...this.stories];

      // 字数筛选
      if (options.minWordCount) {
        filteredStories = filteredStories.filter(s => s.actual_word_count >= options.minWordCount);
      }
      if (options.maxWordCount) {
        filteredStories = filteredStories.filter(s => s.actual_word_count <= options.maxWordCount);
      }

      // 状态筛选
      if (options.status) {
        filteredStories = filteredStories.filter(s => s.status === options.status);
      }

      // 关键词搜索
      if (options.keyword) {
        const keyword = options.keyword.toLowerCase();
        filteredStories = filteredStories.filter(s => 
          s.title.toLowerCase().includes(keyword) ||
          (s.content && s.content.toLowerCase().includes(keyword))
        );
      }

      // 排序
      const orderBy = options.orderBy || 'created_at';
      const order = options.order || 'DESC';
      
      filteredStories.sort((a, b) => {
        const aVal = a[orderBy];
        const bVal = b[orderBy];
        
        if (order === 'DESC') {
          return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });

      // 分页
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const paginatedStories = filteredStories.slice(offset, offset + limit);

      resolve(paginatedStories);
    });
  }

  async deleteStory(id) {
    return new Promise((resolve, reject) => {
      const index = this.stories.findIndex(story => story.id === id);
      if (index === -1) {
        reject(new Error('Story not found'));
        return;
      }
      
      this.stories.splice(index, 1);
      
      // 删除相关章节
      this.chapters = this.chapters.filter(chapter => chapter.story_id !== id);
      
      this.saveStories();
      this.saveChapters();
      
      resolve({ deleted: 1 });
    });
  }

  async getStoriesByWordCountRange(minCount, maxCount) {
    return new Promise((resolve) => {
      const filteredStories = this.stories
        .filter(story => 
          story.status === 'completed' &&
          story.actual_word_count >= minCount &&
          story.actual_word_count <= maxCount
        )
        .sort((a, b) => b.actual_word_count - a.actual_word_count);
      
      resolve(filteredStories);
    });
  }

  // 章节相关操作
  async createChapter(chapterData) {
    return new Promise((resolve) => {
      const { story_id, chapter_number, title, content } = chapterData;
      const wordCount = content ? content.length : 0;
      
      const newChapter = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        story_id,
        chapter_number,
        title: title || '',
        content: content || '',
        word_count: wordCount,
        created_at: new Date().toISOString()
      };
      
      this.chapters.push(newChapter);
      this.saveChapters();
      
      resolve(newChapter);
    });
  }

  async getChaptersByStoryId(storyId) {
    return new Promise((resolve) => {
      const chapters = this.chapters
        .filter(chapter => chapter.story_id === storyId)
        .sort((a, b) => a.chapter_number - b.chapter_number);
      
      resolve(chapters);
    });
  }

  // 统计信息
  async getStatistics() {
    return new Promise((resolve) => {
      const totalStories = this.stories.length;
      const totalWords = this.stories.reduce((sum, story) => sum + (story.actual_word_count || 0), 0);
      const avgWords = totalStories > 0 ? Math.round(totalWords / totalStories) : 0;
      const completedStories = this.stories.filter(s => s.status === 'completed').length;
      const draftStories = this.stories.filter(s => s.status === 'draft').length;

      resolve({
        total_stories: totalStories,
        total_words: totalWords,
        avg_words: avgWords,
        completed_stories: completedStories,
        draft_stories: draftStories
      });
    });
  }

  close() {
    // JSON文件存储不需要关闭连接
  }
}

module.exports = Database;