// 启动服务器并保存调试输出
const { spawn } = require('child_process');
const fs = require('fs');

// 创建日志流
const logStream = fs.createWriteStream('server_debug_output.log', { flags: 'a' });

// 启动服务器
const serverProcess = spawn('node', ['index.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe']
});

// 将输出重定向到文件和控制台
serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  logStream.write(output);
});

serverProcess.stderr.on('data', (data) => {
  const output = data.toString();
  console.error(output);
  logStream.write('[STDERR] ' + output);
});

console.log('服务器调试模式已启动，日志保存到 server_debug_output.log');

// 处理退出
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  serverProcess.kill();
  logStream.end();
  process.exit(0);
});