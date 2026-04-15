const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const dataDir = path.join(backendDir, 'data');
const storageDir = path.join(backendDir, 'storage');
const uploadTargetDir = path.join(storageDir, 'uploads');

const fileMappings = [
  ['tasks.json', path.join(dataDir, 'tasks.json')],
  ['projects.json', path.join(dataDir, 'projects.json')],
  ['prompts.json', path.join(dataDir, 'prompts.json')],
  ['stories.json', path.join(dataDir, 'stories.json')]
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function movePath(oldPath, newPath) {
  const oldExists = fs.existsSync(oldPath);
  const newExists = fs.existsSync(newPath);

  if (!oldExists && newExists) {
    console.log(`[skip] 已迁移: ${path.relative(rootDir, newPath)}`);
    return;
  }

  if (!oldExists && !newExists) {
    console.log(`[skip] 不存在: ${path.relative(rootDir, oldPath)}`);
    return;
  }

  if (oldExists && newExists) {
    throw new Error(
      `迁移冲突：源和目标同时存在 -> ${path.relative(rootDir, oldPath)} / ${path.relative(rootDir, newPath)}`
    );
  }

  ensureDir(path.dirname(newPath));
  fs.renameSync(oldPath, newPath);
  console.log(`[move] ${path.relative(rootDir, oldPath)} -> ${path.relative(rootDir, newPath)}`);
}

function main() {
  ensureDir(dataDir);
  ensureDir(storageDir);

  fileMappings.forEach(([sourceFileName, targetPath]) => {
    movePath(path.join(backendDir, sourceFileName), targetPath);
  });

  movePath(path.join(backendDir, 'uploads'), uploadTargetDir);

  console.log('数据目录迁移检查完成。');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
