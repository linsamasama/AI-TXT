const testLine = "第一章：尘封的温暖 - 我意外启动祖母遗留的旧型机器人小圆，在冰冷高效的新时代，它过时的温情显得格格不入，却悄然触动我心。";

console.log('原始行:', testLine);
console.log('第一个字符:', testLine[0], testLine.charCodeAt(0));
console.log('第二个字符:', testLine[1], testLine.charCodeAt(1));
console.log('第三个字符:', testLine[2], testLine.charCodeAt(2));
console.log('第四个字符:', testLine[3], testLine.charCodeAt(3));

// 手动构建正则
const manualRegex = /^第一章/;
console.log('手动正则匹配:', testLine.match(manualRegex));

const numberRegex = /^第\d+章/;
console.log('数字正则匹配:', testLine.match(numberRegex));

// 测试是否是编码问题
const unicodeRegex = /^\u7b2c\d+\u7ae0/;
console.log('Unicode正则匹配:', testLine.match(unicodeRegex));

// 直接检查每个字符
for (let i = 0; i < 4; i++) {
  const char = testLine[i];
  const code = char.charCodeAt(0);
  console.log(`位置${i}: "${char}" (${code}) = ${code.toString(16)}`);
}