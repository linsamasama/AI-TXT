const fs = require('fs');
const path = require('path');
const Database = require('./database');

class Migrator {
  constructor() {
    this.db = new Database();
  }

  // 迁移tasks.json数据到SQLite
  async migrateTasksToStories() {
    try {
      console.log('开始迁移tasks.json数据到SQLite数据库...');
      
      // 读取tasks.json
      const tasksPath = path.join(__dirname, 'tasks.json');
      if (!fs.existsSync(tasksPath)) {
        console.log('tasks.json不存在，跳过迁移');
        return;
      }

      const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
      console.log(`找到 ${tasksData.length} 个任务需要迁移`);

      let migratedCount = 0;
      let errorCount = 0;

      for (const task of tasksData) {
        try {
          // 判断是否为小说生成任务（通过内容特征）
          const isStoryTask = this.isStoryTask(task);
          
          if (isStoryTask && task.originalContent) {
            // 创建小说记录
            const storyData = {
              title: this.generateStoryTitle(task),
              content: task.originalContent || '',
              outline: this.extractOutline(task),
              instruction: this.extractInstruction(task),
              model: task.model || '',
              target_word_count: this.estimateWordCount(task.originalContent),
              actual_word_count: (task.originalContent || '').length,
              status: this.mapTaskStatus(task.status)
            };

            await this.db.createStory(storyData);
            migratedCount++;
            console.log(`✓ 迁移任务: ${task.fileName}`);
          }
        } catch (error) {
          console.error(`✗ 迁移任务失败: ${task.fileName}`, error.message);
          errorCount++;
        }
      }

      console.log(`\n迁移完成！`);
      console.log(`成功迁移: ${migratedCount} 个任务`);
      console.log(`失败: ${errorCount} 个任务`);
      
      // 备份原始tasks.json
      const backupPath = path.join(__dirname, `tasks.backup.${Date.now()}.json`);
      fs.copyFileSync(tasksPath, backupPath);
      console.log(`已备份原始文件到: ${backupPath}`);

    } catch (error) {
      console.error('迁移过程中发生错误:', error);
      throw error;
    }
  }

  // 判断是否为小说任务
  isStoryTask(task) {
    const content = (task.originalContent || '').toLowerCase();
    const storyKeywords = [
      '小说', '故事', '主角', '章节', '情节', '人物', 
      '开头', '发展', '高潮', '结局', '对话', '叙述'
    ];
    
    // 检查内容中是否包含小说相关关键词
    const hasStoryKeywords = storyKeywords.some(keyword => content.includes(keyword));
    
    // 检查文件名是否包含小说相关词汇
    const fileName = (task.fileName || '').toLowerCase();
    const hasStoryInFileName = fileName.includes('小说') || fileName.includes('故事');
    
    // 检查字数（小说通常较长）
    const isLongContent = content.length > 500;
    
    return hasStoryKeywords || hasStoryInFileName || (isLongContent && task.status === 1);
  }

  // 生成小说标题
  generateStoryTitle(task) {
    if (task.fileName && task.fileName !== 'undefined') {
      // 移除文件扩展名
      let title = task.fileName.replace(/\.[^/.]+$/, '');
      // 清理特殊字符
      title = title.replace(/[\\/:*?"<>|]/g, '_');
      return title;
    }
    
    // 从内容中提取标题（取第一句话的前20个字符）
    if (task.originalContent) {
      const firstSentence = task.originalContent.split(/[。！？]/)[0];
      if (firstSentence && firstSentence.length > 0) {
        return firstSentence.substring(0, 20) + (firstSentence.length > 20 ? '...' : '');
      }
    }
    
    // 默认标题
    return `未命名小说 - ${new Date(task.endTime || Date.now()).toLocaleDateString()}`;
  }

  // 提取大纲内容
  extractOutline(task) {
    // 如果任务内容包含大纲特征，尝试提取
    const content = task.originalContent || '';
    
    // 查找大纲模式：数字编号、章节标题等
    const outlineMatch = content.match(/^(第[一二三四五六七八九十\d]+[章节篇部].*?)[\r\n]/m);
    if (outlineMatch) {
      return outlineMatch[1];
    }
    
    // 如果内容很短，可能就是大纲
    if (content.length < 1000 && content.includes('章节')) {
      return content;
    }
    
    return '';
  }

  // 提取生成指令
  extractInstruction(task) {
    // 尝试从prompt内容中提取指令
    if (task.promptContent) {
      return task.promptContent;
    }
    
    if (task.promptKey) {
      return `使用预设模板: ${task.promptKey}`;
    }
    
    return '文本改写任务';
  }

  // 估算目标字数
  estimateWordCount(content) {
    const contentLength = (content || '').length;
    
    // 根据实际字数估算目标字数
    if (contentLength < 1000) return 1000;
    if (contentLength < 5000) return 5000;
    if (contentLength < 10000) return 10000;
    if (contentLength < 20000) return 20000;
    return 50000;
  }

  // 映射任务状态
  mapTaskStatus(status) {
    switch (status) {
      case 0: return 'draft';     // 未开始
      case 1: return 'completed'; // 完成
      case 2: return 'generating'; // 处理中
      case 3: return 'error';     // 失败
      default: return 'draft';
    }
  }

  // 创建数据库备份
  async backupDatabase() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(__dirname, `stories.backup.${timestamp}.db`);
      
      // 这里可以添加数据库备份逻辑
      console.log(`数据库备份功能待实现，建议手动备份 stories.db`);
      return backupPath;
    } catch (error) {
      console.error('数据库备份失败:', error);
    }
  }

  // 清理重复数据
  async cleanDuplicates() {
    try {
      console.log('检查重复数据...');
      
      // 获取所有小说
      const stories = await this.db.getStories();
      const titleMap = new Map();
      
      stories.forEach(story => {
        const title = story.title.toLowerCase();
        if (titleMap.has(title)) {
          titleMap.get(title).push(story);
        } else {
          titleMap.set(title, [story]);
        }
      });
      
      let duplicateCount = 0;
      for (const [title, duplicates] of titleMap) {
        if (duplicates.length > 1) {
          console.log(`发现重复标题: ${title} (${duplicates.length} 个)`);
          duplicateCount += duplicates.length - 1;
          
          // 保留最新的一个，删除其他重复项
          duplicates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const toDelete = duplicates.slice(1);
          
          for (const story of toDelete) {
            await this.db.deleteStory(story.id);
            console.log(`  删除重复项: ID ${story.id}`);
          }
        }
      }
      
      if (duplicateCount > 0) {
        console.log(`清理了 ${duplicateCount} 个重复项`);
      } else {
        console.log('未发现重复数据');
      }
      
    } catch (error) {
      console.error('清理重复数据失败:', error);
    }
  }

  // 执行完整迁移
  async runFullMigration() {
    console.log('=== 数据迁移开始 ===');
    console.log(`时间: ${new Date().toLocaleString()}`);
    
    try {
      // 1. 备份数据库
      await this.backupDatabase();
      
      // 2. 迁移tasks.json数据
      await this.migrateTasksToStories();
      
      // 3. 清理重复数据
      await this.cleanDuplicates();
      
      console.log('\n=== 数据迁移完成 ===');
      console.log('建议验证迁移结果并测试应用功能');
      
    } catch (error) {
      console.error('\n=== 数据迁移失败 ===');
      console.error('请检查错误信息并手动修复');
      throw error;
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const migrator = new Migrator();
  
  migrator.runFullMigration()
    .then(() => {
      console.log('迁移脚本执行完毕');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = Migrator;