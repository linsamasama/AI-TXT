// 环境配置
const getBaseURL = () => {
  // 开发环境
  if (process.env.NODE_ENV === 'development') {
    // 检测是否在本地开发
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    // 局域网访问，使用当前主机的IP
    return `http://${hostname}:3001`;
  }
  
  // 生产环境 - 使用相对路径或配置的生产URL
  return process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
};

export const BASE_URL = getBaseURL();