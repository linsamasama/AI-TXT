const fs = require('fs');
const path = require('path');

class SimpleDatabase {
  constructor() {
    this.dataFile = path.join(__dirname, 'stories.json');
    this.init();
  }

  init() {
    if (!fs.existsSync(this.dataFile)) {
      fs.writeFileSync(this.dataFile, JSON.stringify({ stories: [], nextId: 1 }));
    }
  }

  _readData() {
    return JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
  }

  _writeData(data) {
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
  }

  async createStory(storyData) {
    const data = this._readData();
    const id = data.nextId++;
    const story = {
      id,
      ...storyData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    data.stories.push(story);
    this._writeData(data);
    return story;
  }

  async updateStory(id, updates) {
    const data = this._readData();
    const storyIndex = data.stories.findIndex(s => s.id === parseInt(id));
    if (storyIndex === -1) {
      throw new Error('Story not found');
    }
    data.stories[storyIndex] = {
      ...data.stories[storyIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this._writeData(data);
    return data.stories[storyIndex];
  }

  async getStory(id) {
    const data = this._readData();
    return data.stories.find(s => s.id === parseInt(id)) || null;
  }

  async getStories(options = {}) {
    const data = this._readData();
    let stories = [...data.stories];

    // 字数筛选
    if (options.minWordCount) {
      stories = stories.filter(s => s.actual_word_count >= parseInt(options.minWordCount));
    }
    if (options.maxWordCount) {
      stories = stories.filter(s => s.actual_word_count <= parseInt(options.maxWordCount));
    }

    // 状态筛选
    if (options.status) {
      stories = stories.filter(s => s.status === options.status);
    }

    // 排序
    const orderBy = options.orderBy || 'created_at';
    const order = options.order || 'DESC';
    stories.sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      if (order === 'DESC') {
        return new Date(bVal) - new Date(aVal);
      } else {
        return new Date(aVal) - new Date(bVal);
      }
    });

    // 分页
    const offset = options.offset || 0;
    const limit = options.limit || stories.length;
    return stories.slice(offset, offset + limit);
  }

  async deleteStory(id) {
    const data = this._readData();
    const initialLength = data.stories.length;
    data.stories = data.stories.filter(s => s.id !== parseInt(id));
    this._writeData(data);
    return { deleted: initialLength - data.stories.length };
  }

  async getStoriesByWordCountRange(minCount, maxCount) {
    const data = this._readData();
    return data.stories
      .filter(s => s.actual_word_count >= parseInt(minCount) && 
                   s.actual_word_count <= parseInt(maxCount) &&
                   s.status === 'completed')
      .sort((a, b) => b.actual_word_count - a.actual_word_count);
  }

  async getStatistics() {
    const data = this._readData();
    const totalStories = data.stories.length;
    const completedStories = data.stories.filter(s => s.status === 'completed').length;
    const draftStories = data.stories.filter(s => s.status === 'draft').length;
    const totalWords = data.stories.reduce((sum, s) => sum + (s.actual_word_count || 0), 0);
    const avgWords = totalStories > 0 ? Math.round(totalWords / totalStories) : 0;

    return {
      total_stories: totalStories,
      completed_stories: completedStories,
      draft_stories: draftStories,
      total_words: totalWords,
      avg_words: avgWords
    };
  }

  async getChaptersByStoryId(storyId) {
    // 简化版本，返回空数组
    return [];
  }

  async createChapter(chapterData) {
    // 简化版本，直接返回
    return chapterData;
  }

  // 检测并更新中断任务
  async checkAndUpdateInterruptedStories() {
    const data = this._readData();
    const now = Date.now();
    let updatedCount = 0;
    
    for (const story of data.stories) {
      let isInterrupted = false;
      let interruptionReason = null;
      
      if (story.status === 'generating') {
        // 检测超时的生成任务（5分钟无更新）
        const lastUpdateTime = story.last_update_time ? new Date(story.last_update_time).getTime() : new Date(story.updated_at).getTime();
        if (now - lastUpdateTime > 300000) { // 5分钟超时
          isInterrupted = true;
          interruptionReason = '生成超时';
        }
      } else if (story.status === 'completed') {
        // 检测字数不足的完成任务
        const targetWords = story.target_word_count || 4000;
        const actualWords = story.actual_word_count || story.content?.length || 0;
        if (actualWords < targetWords * 0.8) {
          isInterrupted = true;
          interruptionReason = '字数未达到目标';
        }
      } else if (story.status === 'error' && story.content && story.content.length > 100) {
        // 检测错误但有部分内容的任务
        isInterrupted = true;
        interruptionReason = '生成错误但已有部分内容';
      }
      
      // 如果检测到中断且当前状态不是interrupted，则更新状态
      if (isInterrupted && story.status !== 'interrupted') {
        const storyIndex = data.stories.findIndex(s => s.id === story.id);
        if (storyIndex !== -1) {
          data.stories[storyIndex] = {
            ...data.stories[storyIndex],
            status: 'interrupted',
            is_interrupted: true,
            interruption_reason: interruptionReason,
            last_update_time: now,
            updated_at: new Date().toISOString()
          };
          updatedCount++;
        }
      }
    }
    
    if (updatedCount > 0) {
      this._writeData(data);
      console.log(`检测到 ${updatedCount} 个中断任务并更新状态`);
    }
    
    return { updatedCount };
  }

  // 获取中断的小说列表
  async getInterruptedStories() {
    const data = this._readData();
    return data.stories.filter(story => 
      story.status === 'interrupted' || story.is_interrupted === true
    );
  }

  // 标记任务为中断状态
  async markStoryAsInterrupted(id, reason = '用户标记中断') {
    const data = this._readData();
    const storyIndex = data.stories.findIndex(s => s.id === parseInt(id));
    if (storyIndex === -1) {
      throw new Error('Story not found');
    }
    
    data.stories[storyIndex] = {
      ...data.stories[storyIndex],
      status: 'interrupted',
      is_interrupted: true,
      interruption_reason: reason,
      last_update_time: Date.now(),
      updated_at: new Date().toISOString()
    };
    
    this._writeData(data);
    return data.stories[storyIndex];
  }

  // 从中断状态恢复
  async resumeInterruptedStory(id) {
    const data = this._readData();
    const storyIndex = data.stories.findIndex(s => s.id === parseInt(id));
    if (storyIndex === -1) {
      throw new Error('Story not found');
    }
    
    data.stories[storyIndex] = {
      ...data.stories[storyIndex],
      status: 'generating',
      is_interrupted: false,
      interruption_reason: null,
      last_update_time: Date.now(),
      updated_at: new Date().toISOString()
    };
    
    this._writeData(data);
    return data.stories[storyIndex];
  }

  // 检测单个任务是否中断
  async checkStoryInterruption(id) {
    const story = await this.getStory(id);
    if (!story) {
      throw new Error('Story not found');
    }
    
    const now = Date.now();
    let isInterrupted = false;
    let interruptionReason = null;
    
    if (story.status === 'generating') {
      const lastUpdateTime = story.last_update_time ? new Date(story.last_update_time).getTime() : new Date(story.updated_at).getTime();
      if (now - lastUpdateTime > 300000) { // 5分钟超时
        isInterrupted = true;
        interruptionReason = '生成超时';
      }
    } else if (story.status === 'completed') {
      const targetWords = story.target_word_count || 4000;
      const actualWords = story.actual_word_count || story.content?.length || 0;
      if (actualWords < targetWords * 0.8) {
        isInterrupted = true;
        interruptionReason = '字数未达到目标';
      }
    } else if (story.status === 'interrupted' || story.is_interrupted === true) {
      isInterrupted = true;
      interruptionReason = story.interruption_reason || '已标记中断';
    }
    
    return {
      storyId: id,
      isInterrupted,
      interruptionReason,
      currentStatus: story.status,
      wordCount: story.actual_word_count || story.content?.length || 0,
      targetWordCount: story.target_word_count || 4000
    };
  }
}

module.exports = SimpleDatabase;