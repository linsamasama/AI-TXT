const testLine = "第一章：尘封的温暖 - 我意外启动祖母遗留的旧型机器人小圆，在冰冷高效的新时代，它过时的温情显得格格不入，却悄然触动我心。";

console.log('原始行:', testLine);

// 测试各种正则
const tests = [
  /^第\d+章/,
  /^第\d+章[：:]/,
  /^第(\d+)章[：:]\s*(.+)/,
  /^第(\d+)章[：:]\s*(.+?)\s*[-—–]\s*(.+)$/,
  /^第(\d+)章[：:]\s*(.+?)\s*-\s*(.+)$/,
  /^第(\d+)章[：:]\s*(.+?)\s*—\s*(.+)$/,
];

tests.forEach((regex, index) => {
  console.log(`\n测试${index + 1}:`, regex);
  const match = testLine.match(regex);
  console.log('匹配结果:', match);
  if (match) {
    match.forEach((m, i) => {
      console.log(`  捕获${i}: "${m}"`);
    });
  }
});

// 尝试更直接的方法
console.log('\n=== 直接分割法 ===');
const colonIndex = testLine.indexOf('：');
if (colonIndex > 0) {
  const chapterPart = testLine.substring(0, colonIndex);
  const restPart = testLine.substring(colonIndex + 1);
  console.log('章节部分:', chapterPart);
  console.log('剩余部分:', restPart);
  
  const chapterNumMatch = chapterPart.match(/第(\d+)章/);
  console.log('章节数匹配:', chapterNumMatch);
  
  const dashIndex = restPart.indexOf(' - ');
  if (dashIndex > 0) {
    const title = restPart.substring(0, dashIndex).trim();
    const summary = restPart.substring(dashIndex + 3).trim();
    console.log('标题:', title);
    console.log('简介:', summary);
  }
}