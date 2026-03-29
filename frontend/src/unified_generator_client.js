// 前端统一上下文生成管理器
class UnifiedStoryGenerator {
  constructor(baseUrl = 'http://192.168.31.61:3001') {
    this.baseUrl = baseUrl;
    this.activeGenerations = new Map();
    this.eventSources = new Map();
  }

  /**
   * 统一生成小说
   * @param {Object} params - 生成参数
   * @param {Function} onProgress - 进度回调
   * @param {Function} onComplete - 完成回调
   * @param {Function} onError - 错误回调
   * @returns {string} 生成ID
   */
  generateStory(params, onProgress, onComplete, onError) {
    const generationId = this.generateId();
    
    console.log('🚀 开始统一上下文生成:', params.theme);
    
    // 构建API URL
    const url = `${this.baseUrl}/story/generate-unified-context`;
    
    // 创建EventSource连接
    const eventSource = new EventSource();
    eventSource.connect(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    // 处理事件
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'start':
            console.log('✅ 生成开始:', data);
            this.activeGenerations.set(generationId, {
              status: 'generating',
              cacheId: data.cacheId,
              startTime: Date.now(),
              params
            });
            onProgress && onProgress({
              type: 'start',
              message: data.message,
              cacheId: data.cacheId,
              estimatedChunks: data.estimatedChunks
            });
            break;
            
          case 'content':
            console.log('📝 生成内容更新:', {
              progress: data.progress,
              wordCount: data.wordCount
            });
            onProgress && onProgress({
              type: 'progress',
              progress: data.progress,
              wordCount: data.wordCount,
              content: data.fullContent || data.content
            });
            break;
            
          case 'done':
            console.log('🎉 生成完成:', {
              wordCount: data.wordCount,
              cacheId: data.cacheId
            });
            this.activeGenerations.set(generationId, {
              ...this.activeGenerations.get(generationId),
              status: 'completed',
              endTime: Date.now(),
              finalContent: data.content,
              wordCount: data.wordCount
            });
            onComplete && onComplete({
              success: true,
              content: data.content,
              wordCount: data.wordCount,
              cacheId: data.cacheId,
              duration: Date.now() - this.activeGenerations.get(generationId).startTime
            });
            eventSource.close();
            this.eventSources.delete(generationId);
            break;
            
          case 'error':
            console.error('❌ 生成错误:', data.error);
            this.activeGenerations.set(generationId, {
              ...this.activeGenerations.get(generationId),
              status: 'error',
              error: data.error
            });
            onError && onError({
              success: false,
              error: data.error,
              canRetry: data.canRetry,
              cacheId: data.cacheId
            });
            eventSource.close();
            this.eventSources.delete(generationId);
            break;
        }
      } catch (parseError) {
        console.error('解析响应数据失败:', parseError);
      }
    });

    // 处理连接错误
    eventSource.addEventListener('error', (error) => {
      console.error('EventSource连接错误:', error);
      onError && onError({
        success: false,
        error: 'Connection error',
        canRetry: true
      });
      eventSource.close();
      this.eventSources.delete(generationId);
    });

    this.eventSources.set(generationId, eventSource);
    return generationId;
  }

  /**
   * 恢复中断的生成
   * @param {string} cacheId - 缓存ID
   * @param {Function} onProgress - 进度回调
   * @param {Function} onComplete - 完成回调
   * @param {Function} onError - 错误回调
   * @returns {string} 恢复ID
   */
  resumeGeneration(cacheId, onProgress, onComplete, onError) {
    const resumeId = this.generateId();
    
    console.log('🔄 恢复生成:', cacheId);
    
    const url = `${this.baseUrl}/story/resume-generation`;
    const eventSource = new EventSource();
    
    // 使用POST请求恢复
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ cacheId })
    }).then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const readStream = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            console.log('恢复生成完成');
            return;
          }
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                switch (data.type) {
                  case 'content':
                    onProgress && onProgress({
                      type: 'progress',
                      progress: data.progress,
                      wordCount: data.wordCount,
                      content: data.fullContent || data.content
                    });
                    break;
                    
                  case 'done':
                    onComplete && onComplete({
                      success: true,
                      content: data.content,
                      wordCount: data.wordCount,
                      cacheId: data.cacheId
                    });
                    break;
                    
                  case 'error':
                    onError && onError({
                      success: false,
                      error: data.error
                    });
                    break;
                }
              } catch (parseError) {
                console.error('解析恢复数据失败:', parseError);
              }
            }
          }
          
          readStream();
        }).catch(error => {
          console.error('读取流数据失败:', error);
          onError && onError({
            success: false,
            error: 'Stream read error'
          });
        });
      };
      
      readStream();
    }).catch(error => {
      console.error('恢复生成请求失败:', error);
      onError && onError({
        success: false,
        error: 'Resume request failed'
      });
    });
    
    return resumeId;
  }

  /**
   * 获取生成进度
   * @param {string} cacheId - 缓存ID
   * @returns {Promise<Object>} 进度信息
   */
  async getProgress(cacheId) {
    try {
      const response = await fetch(`${this.baseUrl}/story/generation-progress/${cacheId}`);
      const data = await response.json();
      
      if (data.success) {
        return data.progress;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('获取进度失败:', error);
      throw error;
    }
  }

  /**
   * 停止生成
   * @param {string} generationId - 生成ID
   */
  stopGeneration(generationId) {
    const eventSource = this.eventSources.get(generationId);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(generationId);
      this.activeGenerations.delete(generationId);
      console.log('⏹️ 生成已停止:', generationId);
    }
  }

  /**
   * 获取缓存统计
   * @returns {Promise<Object>} 缓存统计信息
   */
  async getCacheStats() {
    try {
      const response = await fetch(`${this.baseUrl}/story/cache-stats`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('获取缓存统计失败:', error);
      throw error;
    }
  }

  /**
   * 清理缓存
   * @param {string} cacheId - 缓存ID
   * @returns {Promise<Object>} 清理结果
   */
  async clearCache(cacheId) {
    try {
      const response = await fetch(`${this.baseUrl}/story/cache/${cacheId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('清理缓存失败:', error);
      throw error;
    }
  }

  /**
   * 获取活跃生成状态
   * @returns {Array} 活跃生成列表
   */
  getActiveGenerations() {
    return Array.from(this.activeGenerations.entries()).map(([id, generation]) => ({
      id,
      ...generation
    }));
  }

  /**
   * 生成唯一ID
   * @returns {string}
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 清理所有资源
   */
  cleanup() {
    // 关闭所有EventSource连接
    for (const [id, eventSource] of this.eventSources) {
      eventSource.close();
    }
    this.eventSources.clear();
    this.activeGenerations.clear();
  }
}

// 使用示例
if (typeof window !== 'undefined') {
  // 浏览器环境
  window.UnifiedStoryGenerator = UnifiedStoryGenerator;
  
  // 示例使用
  const generator = new UnifiedStoryGenerator();
  
  // 生成一个示例故事
  function testGeneration() {
    const params = {
      theme: '现代都市爱情：程序员女孩在咖啡店遇见初恋男友的情感故事',
      instruction: '创作一部温暖治愈的现代言情小说，重点描写女主的内心成长和情感变化',
      targetWordCount: 5000,
      model: 'deepseek-ai/DeepSeek-V2.5',
      options: {
        enableIntelligentChunking: true,
        enableProgressCache: true
      }
    };
    
    generator.generateStory(
      params,
      (progress) => {
        console.log('进度更新:', progress);
        // 更新UI进度条
        if (progress.type === 'progress') {
          updateProgressBar(progress.progress);
          updateWordCount(progress.wordCount);
          updateContentPreview(progress.content);
        }
      },
      (result) => {
        console.log('生成完成:', result);
        // 显示最终结果
        showFinalResult(result.content);
        hideProgressBar();
      },
      (error) => {
        console.error('生成失败:', error);
        // 显示错误信息
        showError(error.error);
        if (error.canRetry) {
          showRetryButton(error.cacheId);
        }
      }
    );
  }
  
  // 辅助函数
  function updateProgressBar(progress) {
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.textContent = `${progress}%`;
    }
  }
  
  function updateWordCount(wordCount) {
    const wordCountElement = document.getElementById('word-count');
    if (wordCountElement) {
      wordCountElement.textContent = `${wordCount} 字`;
    }
  }
  
  function updateContentPreview(content) {
    const preview = document.getElementById('content-preview');
    if (preview && content) {
      preview.value = content;
      preview.scrollTop = preview.scrollHeight; // 自动滚动到底部
    }
  }
  
  function showFinalResult(content) {
    const resultElement = document.getElementById('final-result');
    if (resultElement) {
      resultElement.value = content;
      resultElement.style.display = 'block';
    }
  }
  
  function hideProgressBar() {
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
  }
  
  function showError(error) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
      errorElement.textContent = `错误: ${error}`;
      errorElement.style.display = 'block';
    }
  }
  
  function showRetryButton(cacheId) {
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
      retryButton.style.display = 'block';
      retryButton.onclick = () => {
        generator.resumeGeneration(cacheId, 
          (progress) => updateProgressBar(progress.progress),
          (result) => showFinalResult(result.content),
          (error) => showError(error.error)
        );
      };
    }
  }
  
  // 页面加载完成后运行测试
  document.addEventListener('DOMContentLoaded', testGeneration);
}

// Node.js环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedStoryGenerator;
}