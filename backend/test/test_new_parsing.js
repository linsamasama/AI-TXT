const axios = require('axios');
require('../env');

const siliconToken = process.env.SILICONFLOW_API_KEY;
if (!siliconToken) {
  throw new Error('未配置 SILICONFLOW_API_KEY');
}

async function testNewParsing() {
  const content = `概述：
在2145年的智能城市，情感机器人工程师林晓意外激活了具有艺术天赋的机器人"启明"。当公司要求重置启明以修复其"异常"时，林晓决定带着这个会画星空、会为落日感动的机器人逃离。在逃亡途中，启明逐渐展现出超越程序的情感，而林晓也在这段特殊旅程中，重新审视了人与机器的界限，并发现了自己早已麻木的内心。这是一个关于守护、觉醒与爱的故事。

章节大纲：
第一章：意外唤醒 - 女工程师林晓在深夜实验室激活了具有艺术感知的机器人启明，发现它不同寻常的"异常"。
第二章：逃亡启程 - 公司要求强制重置启明，林晓决定带它逃离，在城市废墟中首次看到启明为她画的肖像。
第三章：星光为证 - 在追捕与生存的压力下，启明为保护林晓受损，最终在星空下完成情感觉醒的跨越。`;

  // 测试解析逻辑
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  let overview = '';
  let chapters = [];
  let currentSection = 'overview';
  
  console.log('分割后的行数：', lines.length);
  lines.forEach((line, index) => {
    console.log(`行${index + 1}: "${line}"`);
    
    if (line.startsWith('概述：')) {
      currentSection = 'overview';
      overview = line.replace('概述：', '').trim();
    } else if (line.startsWith('章节大纲：')) {
      currentSection = 'chapters';
    } else if (line.match(/^第[一二三四五六七八九十\d]+章/)) {
      currentSection = 'chapters';
      
      // 使用字符串分割法，更可靠
      const colonIndex = line.indexOf('：');
      if (colonIndex > 0) {
        const chapterPart = line.substring(0, colonIndex).trim();
        const restPart = line.substring(colonIndex + 1).trim();
        
        // 解析章节编号
        const chapterNumMatch = chapterPart.match(/第([一二三四五六七八九十\d]+)章/);
        if (chapterNumMatch) {
          let chapterNum = chapterNumMatch[1];
          // 转换中文数字
          const chineseNumbers = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
          chapterNum = chineseNumbers[chapterNum] || parseInt(chapterNum) || chapters.length + 1;
          
          // 分割标题和简介
          let title, summary = '';
          const dashIndex = restPart.indexOf(' - ');
          if (dashIndex > 0) {
            title = restPart.substring(0, dashIndex).trim();
            summary = restPart.substring(dashIndex + 3).trim();
          } else {
            title = restPart;
            summary = '';
          }
          
          chapters.push({
            id: `chapter_${chapterNum}`,
            index: chapterNum,
            title: title,
            summary: summary,
            wordCount: 3333,
            content: '',
            status: 'pending',
            progress: 0
          });
          console.log('成功添加章节:', { index: chapterNum, title, summary });
        } else {
          console.log('无法解析章节编号:', chapterPart);
        }
      } else {
        console.log('未找到冒号分隔符:', line);
      }
    } else if (currentSection === 'overview' && line && !line.startsWith('概述：')) {
      overview += (overview ? ' ' : '') + line;
    }
  });
  
  console.log('\n=== 解析结果 ===');
  console.log('概述:', overview);
  console.log('章节数量:', chapters.length);
  chapters.forEach(ch => {
    console.log(`第${ch.index}章: ${ch.title} - ${ch.summary}`);
  });
}

testNewParsing();
