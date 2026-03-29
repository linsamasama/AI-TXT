const testLines = [
  "第一章：尘封的温暖 - 我意外启动祖母遗留的旧型机器人小圆，在冰冷高效的新时代，它过时的温情显得格格不入，却悄然触动我心。",
  "第一章：樱花与铁锈 - 我在垃圾场遇见即将报废的机器人小和，它破损的外壳下却有最温柔的早安问候"
];

testLines.forEach(line => {
  console.log(`测试行: "${line}"`);
  
  // 原来的正则
  const oldMatch = line.match(/^第(\d+)章：(.+?)\s*-\s*(.+)$/);
  console.log('原正则匹配:', oldMatch);
  
  // 新的正则
  const newMatch = line.match(/^第(\d+)章[：:]\s*(.+?)[\s\-—–]\s*(.+)$/);
  console.log('新正则匹配:', newMatch);
  
  // 检查每个字符
  console.log('字符分解:');
  for (let i = 0; i < line.length; i++) {
    console.log(`位置${i}: "${line[i]}" (Unicode: ${line.charCodeAt(i)})`);
  }
  console.log('---');
});