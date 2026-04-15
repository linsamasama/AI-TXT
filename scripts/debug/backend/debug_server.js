const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const backendDir = path.join(projectRoot, 'backend');
const logDir = path.join(projectRoot, 'logs', 'backend');
const logFile = path.join(logDir, 'server_debug_output.log');

fs.mkdirSync(logDir, { recursive: true });

const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const serverProcess = spawn('node', ['index.js'], {
  cwd: backendDir,
  stdio: ['inherit', 'pipe', 'pipe']
});

serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  logStream.write(output);
});

serverProcess.stderr.on('data', (data) => {
  const output = data.toString();
  console.error(output);
  logStream.write(`[STDERR] ${output}`);
});

console.log(`服务器调试模式已启动，日志保存到 ${logFile}`);

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  serverProcess.kill();
  logStream.end();
  process.exit(0);
});
