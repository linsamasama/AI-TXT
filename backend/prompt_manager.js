// file: prompt-manager.js
const fs = require('fs');
const path = require('path');

class PromptManager {
  /**
   * 提示词管理器
   * @param {string} configPath - 配置文件路径
   */
  constructor(configPath = 'prompt_config.json') {
    this.configPath = path.resolve(configPath);
    this.config = null;
    this.promptCache = new Map();
    this.fileWatchers = new Map();
    this.loadConfig();
  }

  /**
   * 加载配置文件
   */
  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      this.settings = this.config.settings || {};
      
      // 确保提示词目录存在
      const promptsDir = this.settings.prompts_dir || './prompts';
      if (!fs.existsSync(promptsDir)) {
        fs.mkdirSync(promptsDir, { recursive: true });
      }
    } catch (error) {
      console.error(`无法加载配置文件: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取提示词内容
   * @param {string} promptKey - 提示词键名
   * @param {Object} params - 参数对象
   * @param {string} params.content - 要替换的内容
   * @returns {Promise<string>} 完整的提示词文本
   */
  async getPrompt(promptKey, params = {}) {
    // 如果promptKey不存在，使用默认提示词
    if (!this.config.prompts[promptKey]) {
      promptKey = this.config.default_prompt || Object.keys(this.config.prompts)[0];
    }

    const promptInfo = this.config.prompts[promptKey];
    
    // 检查缓存
    const cacheEnabled = this.settings.cache_prompts !== false;
    if (cacheEnabled && this.promptCache.has(promptKey)) {
      let template = this.promptCache.get(promptKey);
      return this.replaceParams(template, params, promptInfo);
    }

    // 从文件读取
    let filePath = promptInfo.file_path;
    if (!path.isAbsolute(filePath)) {
      const baseDir = path.dirname(this.configPath);
      filePath = path.join(baseDir, filePath);
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`提示词文件不存在: ${filePath}`);
    }

    // 读取文件
    const encoding = this.settings.encoding || 'utf-8';
    let template;
    try {
      template = fs.readFileSync(filePath, encoding);
    } catch (error) {
      throw new Error(`读取提示词文件失败: ${error.message}`);
    }

    // 缓存
    if (cacheEnabled) {
      this.promptCache.set(promptKey, template);
    }

    // 设置文件监听（如果启用自动重载）
    if (this.settings.auto_reload) {
      this.setupFileWatcher(promptKey, filePath);
    }

    // 更新使用计数
    this.updateUsageCount(promptKey);

    return this.replaceParams(template, params, promptInfo);
  }

  /**
   * 替换参数
   * @param {string} template - 模板字符串
   * @param {Object} params - 参数对象
   * @param {Object} promptInfo - 提示词信息
   * @returns {string} 替换后的字符串
   */
  replaceParams(template, params, promptInfo) {
    let result = template;
    
    // 替换所有参数
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{${key}}`;
      if (result.includes(placeholder)) {
        result = result.split(placeholder).join(String(value));
      }
    }
    
    return result;
  }

  /**
   * 更新使用计数
   * @param {string} promptKey - 提示词键名
   */
  updateUsageCount(promptKey) {
    const promptInfo = this.config.prompts[promptKey];
    if (promptInfo) {
      promptInfo.usage_count = (promptInfo.usage_count || 0) + 1;
      promptInfo.last_used = new Date().toISOString();
      
      // 保存配置
      this.saveConfig();
    }
  }

  /**
   * 保存配置文件
   */
  saveConfig() {
    try {
      const configStr = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, configStr, 'utf8');
    } catch (error) {
      console.error(`保存配置文件失败: ${error.message}`);
    }
  }

  /**
   * 设置文件监听
   * @param {string} promptKey - 提示词键名
   * @param {string} filePath - 文件路径
   */
  setupFileWatcher(promptKey, filePath) {
    // 如果已有监听器，先关闭
    if (this.fileWatchers.has(promptKey)) {
      this.fileWatchers.get(promptKey).close();
    }

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        console.log(`提示词文件已更新: ${promptKey}`);
        this.promptCache.delete(promptKey);
        
        // 触发更新事件
        this.emit('promptUpdated', { promptKey, filePath });
      }
    });

    this.fileWatchers.set(promptKey, watcher);
  }

  /**
   * 获取提示词信息
   * @param {string} promptKey - 提示词键名（可选）
   * @returns {Object|Object} 提示词信息
   */
  getPromptInfo(promptKey = null) {
    if (promptKey) {
      return this.config.prompts[promptKey] || null;
    }
    return this.config.prompts;
  }

  /**
   * 获取提示词列表（用于UI显示）
   * @param {string} category - 按类别筛选
   * @returns {Array} 提示词列表
   */
  getPromptList(category = null) {
    const prompts = [];
    const displayOrder = this.config.ui_config?.display_order || [];
    
    // 按显示顺序添加
    for (const key of displayOrder) {
      if (this.config.prompts[key]) {
        const promptInfo = { ...this.config.prompts[key], key };
        
        if (category && promptInfo.category !== category) {
          continue;
        }
        
        prompts.push(promptInfo);
      }
    }
    
    // 添加不在显示顺序中的提示词
    for (const [key, promptInfo] of Object.entries(this.config.prompts)) {
      if (!displayOrder.includes(key)) {
        const info = { ...promptInfo, key };
        
        if (category && info.category !== category) {
          continue;
        }
        
        prompts.push(info);
      }
    }
    
    return prompts;
  }

  /**
   * 添加新的提示词
   * @param {string} key - 提示词键名
   * @param {string} label - 显示名称
   * @param {string} content - 提示词内容
   * @param {Object} options - 选项
   * @returns {boolean} 是否成功
   */
  addPrompt(key, label, content, options = {}) {
    if (this.config.prompts[key]) {
      throw new Error(`提示词已存在: ${key}`);
    }
    
    const fileName = `${key}_${label.replace(/\s+/g, '_').toLowerCase()}.txt`;
    const filePath = `./prompts/${fileName}`;
    const fullPath = path.join(path.dirname(this.configPath), filePath);
    
    try {
      // 创建提示词文件
      fs.writeFileSync(fullPath, content, 'utf8');
      
      // 添加到配置
      this.config.prompts[key] = {
        id: key,
        label,
        description: options.description || '',
        file_path: filePath,
        version: options.version || '1.0',
        created_at: new Date().toISOString().split('T')[0],
        last_modified: new Date().toISOString().split('T')[0],
        tags: options.tags || [],
        category: options.category || 'custom',
        usage_count: 0
      };
      
      this.saveConfig();
      return true;
    } catch (error) {
      console.error(`添加提示词失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.promptCache.clear();
  }

  /**
   * 关闭所有文件监听
   */
  close() {
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();
  }
}

module.exports = PromptManager;