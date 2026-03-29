/**
 * AbortController 管理器
 * 用于管理多个并发生成任务的 AbortController 实例
 */

class AbortControllerManager {
  constructor() {
    this.controllers = new Map(); // taskId -> AbortController
    this.cleanupTimers = new Map(); // taskId -> timer
  }

  /**
   * 创建新的 AbortController
   * @param {string} taskId - 任务ID
   * @param {number} cleanupDelay - 清理延迟时间（毫秒），默认5000ms
   * @returns {AbortController} AbortController 实例
   */
  createController(taskId, cleanupDelay = 5000) {
    // 如果已存在，先清理旧的
    if (this.controllers.has(taskId)) {
      this.cleanup(taskId);
    }

    const controller = new AbortController();
    this.controllers.set(taskId, controller);

    // 设置自动清理定时器
    const timer = setTimeout(() => {
      this.cleanup(taskId);
    }, cleanupDelay);
    
    this.cleanupTimers.set(taskId, timer);

    return controller;
  }

  /**
   * 获取指定任务的 AbortController
   * @param {string} taskId - 任务ID
   * @returns {AbortController|undefined}
   */
  getController(taskId) {
    return this.controllers.get(taskId);
  }

  /**
   * 中断指定任务
   * @param {string} taskId - 任务ID
   * @returns {boolean} 是否成功中断
   */
  abort(taskId) {
    const controller = this.controllers.get(taskId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
      console.log(`🛑 中断任务: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * 获取任务的信号
   * @param {string} taskId - 任务ID
   * @returns {AbortSignal|undefined}
   */
  getSignal(taskId) {
    const controller = this.controllers.get(taskId);
    return controller ? controller.signal : undefined;
  }

  /**
   * 清理指定任务的资源
   * @param {string} taskId - 任务ID
   */
  cleanup(taskId) {
    const controller = this.controllers.get(taskId);
    const timer = this.cleanupTimers.get(taskId);

    if (controller) {
      this.controllers.delete(taskId);
    }

    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(taskId);
    }
  }

  /**
   * 清理所有资源
   */
  cleanupAll() {
    // 中断所有进行中的任务
    for (const [taskId, controller] of this.controllers) {
      if (!controller.signal.aborted) {
        controller.abort();
        console.log(`🛑 强制中断所有任务: ${taskId}`);
      }
    }

    // 清理定时器
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }

    this.controllers.clear();
    this.cleanupTimers.clear();
    console.log('🧹 清理所有 AbortController 资源');
  }

  /**
   * 获取活跃任务列表
   * @returns {string[]} 活跃任务ID列表
   */
  getActiveTasks() {
    const activeTasks = [];
    for (const [taskId, controller] of this.controllers) {
      if (!controller.signal.aborted) {
        activeTasks.push(taskId);
      }
    }
    return activeTasks;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const total = this.controllers.size;
    const aborted = Array.from(this.controllers.values()).filter(c => c.signal.aborted).length;
    const active = total - aborted;

    return {
      total,
      active,
      aborted
    };
  }
}

// 创建全局单例实例
const abortManager = new AbortControllerManager();

// 页面卸载时清理所有资源
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    abortManager.cleanupAll();
  });
}

export default abortManager;