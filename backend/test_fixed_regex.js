const testLines = [
  "第一章：尘封的温暖 - 我意外启动祖母遗留的旧型机器人小圆，在冰冷高效的新时代，它过时的温情显得格格不入，却悄然触动我心。",
  "第一章：樱花与铁锈 - 我在垃圾场遇见即将报废的机器人小和，它破损的外壳下却有最温柔的早安问候"
];

// 修复后的正则
const fixedRegex = /^第(\d+)章[：:]\s*(.+?)\s*[-—–]\s*(.+)$/;

testLines.forEach(line => {
  console.log(`测试行: "${line}"`);
  const match = line.match(fixedRegex);
  console.log('修复后正则匹配:', match);
  if (match) {
    console.log('章节号:', match[1]);
    console.log('标题:', match[2]);
    console.log('简介:', match[3]);
  }
  console.log('---');
});