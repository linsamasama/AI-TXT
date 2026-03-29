const axios = require('axios');

/**
 * 智能重试策略管理器
 * 提供多种重试策略和错误处理机制
 */
class RetryStrategy {
  constructor() {
    this.config = {
      // 基础配置
      maxRetries: 3,
      baseDelay: 1000,        // 基础延迟1秒
      maxDelay: 30000,        // 最大延迟30秒
      
      // 退避策略
      backoffStrategy: 'exponential', // 'linear' | 'exponential' | 'adaptive'
      
      // 错误分类
      retryableErrors: [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNABORTED',
        'timeout',
        'network error',
        'connection refused'
      ],
      
      // API特定错误
      apiRetryableErrors: [
        '5 minutes',
        'connection timeout',
        'rate limit',
        'service unavailable',
        'internal server error'
      ],
      
      // 非重试错误
      nonRetryableErrors: [
        'invalid_request_error',
        'insufficient_quota',
        'model_not_found',
        'invalid_api_key',
        'permission denied'
      ]
    };
  }

  /**
   * 判断是否应该重试
   * @param {Error} error - 错误对象
   * @param {number} retryCount - 当前重试次数
   * @returns {Object} 重试决策
   */
  shouldRetry(error, retryCount) {
    // 检查重试次数
    if (retryCount >= this.config.maxRetries) {
      return { 
        shouldRetry: false, 
        reason: 'Max retries exceeded',
        finalError: error 
      };
    }

    // 检查错误类型
    const errorInfo = this.classifyError(error);
    
    if (!errorInfo.retryable) {
      return { 
        shouldRetry: false, 
        reason: `Non-retryable error: ${errorInfo.type}`,
        finalError: error 
      };
    }

    // 计算延迟时间
    const delay = this.calculateDelay(retryCount, errorInfo.severity);
    
    return {
      shouldRetry: true,
      delay,
      reason: errorInfo.reason,
      severity: errorInfo.severity,
      retryCount: retryCount + 1
    };
  }

  /**
   * 分类错误类型
   * @param {Error} error - 错误对象
   * @returns {Object} 错误分类信息
   */
  classifyError(error) {
    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = error.code || '';
    
    // 检查非重试错误
    for (const nonRetryable of this.config.nonRetryableErrors) {
      if (errorMessage.includes(nonRetryable)) {
        return {
          retryable: false,
          type: 'non-retryable',
          severity: 'high',
          reason: `Non-retryable error: ${nonRetryable}`
        };
      }
    }

    // 检查网络错误
    for (const retryable of this.config.retryableErrors) {
      if (errorCode === retryable || errorMessage.includes(retryable)) {
        return {
          retryable: true,
          type: 'network',
          severity: retryable === 'timeout' ? 'medium' : 'low',
          reason: `Network error: ${retryable}`
        };
      }
    }

    // 检查API错误
    for (const apiError of this.config.apiRetryableErrors) {
      if (errorMessage.includes(apiError)) {
        return {
          retryable: true,
          type: 'api-timeout',
          severity: 'high', // API超时通常严重
          reason: `API error: ${apiError}`
        };
      }
    }

    // 未知错误，默认可重试
    return {
      retryable: true,
      type: 'unknown',
      severity: 'medium',
      reason: 'Unknown error, treating as retryable'
    };
  }

  /**
   * 计算重试延迟
   * @param {number} retryCount - 重试次数
   * @param {string} severity - 错误严重程度
   * @returns {number} 延迟时间（毫秒）
   */
  calculateDelay(retryCount, severity) {
    let delay;
    
    switch (this.config.backoffStrategy) {
      case 'linear':
        delay = this.config.baseDelay * (retryCount + 1);
        break;
        
      case 'exponential':
        delay = this.config.baseDelay * Math.pow(2, retryCount);
        break;
        
      case 'adaptive':
        // 根据错误严重程度调整延迟
        const severityMultiplier = {
          low: 1,
          medium: 2,
          high: 4
        };
        delay = this.config.baseDelay * Math.pow(2, retryCount) * 
                (severityMultiplier[severity] || 2);
        break;
        
      default:
        delay = this.config.baseDelay * (retryCount + 1);
    }

    // 添加随机抖动，避免雷群效应
    const jitter = Math.random() * 0.3 * delay; // 30%抖动
    delay = delay + jitter;

    // 限制最大延迟
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * 执行带重试的操作
   * @param {Function} operation - 要执行的操作
   * @param {Object} options - 选项配置
   * @returns {Promise} 操作结果
   */
  async executeWithRetry(operation, options = {}) {
    const config = { ...this.config, ...options };
    let lastError;
    let retryCount = 0;
    
    console.log(`🔄 开始执行操作，最大重试次数: ${config.maxRetries}`);

    while (retryCount <= config.maxRetries) {
      try {
        console.log(`📝 执行尝试 ${retryCount + 1}/${config.maxRetries + 1}`);
        
        const result = await this.executeWithTimeout(operation, config.operationTimeout);
        
        if (retryCount > 0) {
          console.log(`✅ 操作成功，经过 ${retryCount} 次重试`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        const retryDecision = this.shouldRetry(error, retryCount);
        
        if (!retryDecision.shouldRetry) {
          console.error(`❌ 操作失败，不可重试: ${retryDecision.reason}`);
          throw lastError;
        }
        
        console.log(`⚠️ 操作失败，${retryDecision.delay}ms 后重试 (原因: ${retryDecision.reason})`);
        
        await this.delay(retryDecision.delay);
        retryCount = retryDecision.retryCount;
      }
    }
    
    console.error(`❌ 操作最终失败，已重试 ${config.maxRetries} 次`);
    throw lastError;
  }

  /**
   * 执行带超时的操作
   * @param {Function} operation - 要执行的操作
   * @param {number} timeout - 超时时间
   * @returns {Promise} 操作结果
   */
  async executeWithTimeout(operation, timeout = 300000) { // 默认5分钟
    if (!timeout) {
      return await operation();
    }

    return new Promise(async (resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await operation({ signal: controller.signal });
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          reject(new Error('Operation timeout'));
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 重置配置为默认值
   */
  resetToDefaults() {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffStrategy: 'exponential',
      retryableErrors: [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNABORTED',
        'timeout',
        'network error',
        'connection refused'
      ],
      apiRetryableErrors: [
        '5 minutes',
        'connection timeout',
        'rate limit',
        'service unavailable',
        'internal server error'
      ],
      nonRetryableErrors: [
        'invalid_request_error',
        'insufficient_quota',
        'model_not_found',
        'invalid_api_key',
        'permission denied'
      ]
    };
  }
}

module.exports = RetryStrategy;