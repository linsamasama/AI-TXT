console.log('启动小说管理系统...');

const express = require('express');
const cors = require('cors');
const path = require('path');

// 导入原始server的所有功能
const server = require('./index.js');

console.log('小说管理系统已启动');
console.log('请访问 http://localhost:3001 查看');
console.log('前端页面请访问 http://localhost:3000');

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n服务器已关闭');
  process.exit(0);
});