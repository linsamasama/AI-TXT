const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 进度缓存管理器
 * 负责管理生成过程中的进度缓存和断点恢复
 */
class ProgressCacheManager {
  constructor() {
    this.cacheDir = path.join(__dirname, 'progress_cache');
    this.maxCacheSize = 50; // 最大缓存条目数
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24小时过期
    this.memoryCache = new Map(); // 内存缓存
    
    this.initializeCacheDir();
    this.loadExistingCache();
  }

  /**
   * 初始化缓存目录
   */
  async initializeCacheDir() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        await fs.promises.mkdir(this.cacheDir, { recursive: true });
        console.log('📁 创建进度缓存目录:', this.cacheDir);
      }
    } catch (error) {
      console.error('❌ 创建缓存目录失败:', error);
    }
  }

  /**
   * 加载现有缓存到内存
   */
  async loadExistingCache() {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const cachePath = path.join(this.cacheDir, file);
          const stats = await fs.promises.stat(cachePath);
          
          // 检查是否过期
          if (Date.now() - stats.mtime.getTime() > this.cacheExpiry) {
            await fs.promises.unlink(cachePath);
            continue;
          }
          
          try {
            const data = await fs.promises.readFile(cachePath, 'utf8');
            const cacheEntry = JSON.parse(data);
            const cacheId = file.replace('.json', '');
            
            this.memoryCache.set(cacheId, cacheEntry);
          } catch (parseError) {
            console.warn(`⚠️ 解析缓存文件失败 ${file}:`, parseError.message);
          }
        }
      }
      
      console.log(`📦 加载了 ${this.memoryCache.size} 个缓存条目`);
    } catch (error) {
      console.error('❌ 加载缓存失败:', error);
    }
  }

  /**
   * 生成缓存ID
   * @param {string} theme - 小说主题
   * @param {number} targetWordCount - 目标字数
   * @param {string} model - 模型名称
   * @returns {string} 缓存ID
   */
  generateCacheId(theme, targetWordCount, model) {
    const hashInput = `${theme}_${targetWordCount}_${model}_${new Date().toISOString().split('T')[0]}`;
    return crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 16);
  }

  /**
   * 保存进度
   * @param {string} cacheId - 缓存ID
   * @param {Object} progressData - 进度数据
   */
  async saveProgress(cacheId, progressData) {
    try {
      const cacheEntry = {
        id: cacheId,
        ...progressData,
        timestamp: Date.now(),
        updatedAt: new Date().toISOString()
      };

      // 保存到内存缓存
      this.memoryCache.set(cacheId, cacheEntry);

      // 保存到文件
      const cachePath = path.join(this.cacheDir, `${cacheId}.json`);
      await fs.promises.writeFile(
        cachePath, 
        JSON.stringify(cacheEntry, null, 2)
      );

      // 清理过期缓存
      await this.cleanupExpiredCache();

      console.log(`💾 保存进度缓存: ${cacheId}`);
    } catch (error) {
      console.error('❌ 保存进度缓存失败:', error);
    }
  }

  /**
   * 加载进度
   * @param {string} cacheId - 缓存ID
   * @returns {Object|null} 缓存数据
   */
  async loadProgress(cacheId) {
    try {
      // 先从内存缓存查找
      if (this.memoryCache.has(cacheId)) {
        const cacheEntry = this.memoryCache.get(cacheId);
        
        // 检查是否过期
        if (Date.now() - cacheEntry.timestamp < this.cacheExpiry) {
          console.log(`📖 从内存加载进度: ${cacheId}`);
          return cacheEntry;
        } else {
          // 过期则删除
          this.memoryCache.delete(cacheId);
          await this.deleteCacheFile(cacheId);
        }
      }

      // 从文件系统查找
      const cachePath = path.join(this.cacheDir, `${cacheId}.json`);
      if (fs.existsSync(cachePath)) {
        const data = await fs.promises.readFile(cachePath, 'utf8');
        const cacheEntry = JSON.parse(data);
        
        // 检查是否过期
        if (Date.now() - cacheEntry.timestamp < this.cacheExpiry) {
          this.memoryCache.set(cacheId, cacheEntry);
          console.log(`📖 从文件加载进度: ${cacheId}`);
          return cacheEntry;
        } else {
          // 过期则删除
          await fs.promises.unlink(cachePath);
        }
      }

      console.log(`❌ 未找到进度缓存: ${cacheId}`);
      return null;
    } catch (error) {
      console.error('❌ 加载进度缓存失败:', error);
      return null;
    }
  }

  /**
   * 更新进度
   * @param {string} cacheId - 缓存ID
   * @param {Object} updateData - 更新数据
   */
  async updateProgress(cacheId, updateData) {
    try {
      const existingData = await this.loadProgress(cacheId);
      if (existingData) {
        const updatedData = {
          ...existingData,
          ...updateData,
          updatedAt: new Date().toISOString()
        };
        await this.saveProgress(cacheId, updatedData);
        console.log(`🔄 更新进度缓存: ${cacheId}`);
      }
    } catch (error) {
      console.error('❌ 更新进度缓存失败:', error);
    }
  }

  /**
   * 删除缓存
   * @param {string} cacheId - 缓存ID
   */
  async deleteCache(cacheId) {
    try {
      this.memoryCache.delete(cacheId);
      await this.deleteCacheFile(cacheId);
      console.log(`🗑️ 删除进度缓存: ${cacheId}`);
    } catch (error) {
      console.error('❌ 删除进度缓存失败:', error);
    }
  }

  /**
   * 删除缓存文件
   * @param {string} cacheId - 缓存ID
   */
  async deleteCacheFile(cacheId) {
    try {
      const cachePath = path.join(this.cacheDir, `${cacheId}.json`);
      if (fs.existsSync(cachePath)) {
        await fs.promises.unlink(cachePath);
      }
    } catch (error) {
      console.error('❌ 删除缓存文件失败:', error);
    }
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpiredCache() {
    try {
      const now = Date.now();
      const expiredCacheIds = [];

      for (const [cacheId, cacheEntry] of this.memoryCache) {
        if (now - cacheEntry.timestamp > this.cacheExpiry) {
          expiredCacheIds.push(cacheId);
        }
      }

      for (const cacheId of expiredCacheIds) {
        this.memoryCache.delete(cacheId);
        await this.deleteCacheFile(cacheId);
      }

      if (expiredCacheIds.length > 0) {
        console.log(`🧹 清理了 ${expiredCacheIds.length} 个过期缓存`);
      }

      // 如果缓存条目过多，删除最旧的
      if (this.memoryCache.size > this.maxCacheSize) {
        await this.cleanupOldestCache();
      }
    } catch (error) {
      console.error('❌ 清理过期缓存失败:', error);
    }
  }

  /**
   * 清理最旧的缓存
   */
  async cleanupOldestCache() {
    try {
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toDelete = entries.slice(0, this.memoryCache.size - this.maxCacheSize);
      
      for (const [cacheId] of toDelete) {
        this.memoryCache.delete(cacheId);
        await this.deleteCacheFile(cacheId);
      }

      if (toDelete.length > 0) {
        console.log(`🗑️ 清理了 ${toDelete.length} 个最旧缓存`);
      }
    } catch (error) {
      console.error('❌ 清理最旧缓存失败:', error);
    }
  }

  /**
   * 获取缓存统计
   * @returns {Object} 统计信息
   */
  getCacheStats() {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;
    let totalSize = 0;

    for (const [cacheId, cacheEntry] of this.memoryCache) {
      if (now - cacheEntry.timestamp < this.cacheExpiry) {
        validCount++;
      } else {
        expiredCount++;
      }
      
      totalSize += JSON.stringify(cacheEntry).length;
    }

    return {
      totalEntries: this.memoryCache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      totalSizeBytes: totalSize,
      averageSizeBytes: validCount > 0 ? Math.round(totalSize / validCount) : 0
    };
  }

  /**
   * 列出所有缓存
   * @returns {Array} 缓存列表
   */
  listAllCache() {
    const now = Date.now();
    const cacheList = [];

    for (const [cacheId, cacheEntry] of this.memoryCache) {
      const isValid = now - cacheEntry.timestamp < this.cacheExpiry;
      
      cacheList.push({
        id: cacheId,
        isValid,
        createdAt: cacheEntry.createdAt,
        updatedAt: cacheEntry.updatedAt,
        timestamp: cacheEntry.timestamp,
        wordCount: cacheEntry.wordCount,
        targetWordCount: cacheEntry.targetWordCount,
        progress: cacheEntry.progress,
        status: cacheEntry.status
      });
    }

    return cacheList.sort((a, b) => b.timestamp - a.timestamp);
  }

/**
   * 检查是否存在有效缓存
   * @param {string} cacheId - 缓存ID
   * @returns {boolean}
   */
  async hasValidCache(cacheId) {
    const cacheData = await this.loadProgress(cacheId);
    return cacheData !== null;
  }
  
  /**
   * 检查缓存是否存在（不过期检查）
   * @param {string} cacheId - 缓存ID
   * @returns {boolean}
   */
  async cacheExists(cacheId) {
    try {
      const cachePath = path.join(this.cacheDir, `${cacheId}.json`);
      return require('fs').existsSync(cachePath);
    } catch (error) {
      console.error(`检查缓存存在性失败: ${cacheId}`, error);
      return false;
    }
  }
  

}

module.exports = ProgressCacheManager;