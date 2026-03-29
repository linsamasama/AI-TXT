const axios = require('axios');

const siliconToken = "sk-diwjeywahoqnvyhjjkteqijorwkjvnnirvzisifosbothvbw";

async function testOutlineGeneration() {
  const prompt = `以"未来世界的机器人"为主题，创作一部10000字的温情女频小说。

要求：
1. 先输出100-200字的故事概述
2. 然后输出3个章节的详细大纲
3. 每章约3333字
4. 确保章节间有清晰的剧情推进和情感发展
5. 以第一人称女性视角创作

输出格式：
概述：
[此处写100-200字的故事概述]

章节大纲：
第一章：[章节标题] - [50字以内的章节简介]
第二章：[章节标题] - [50字以内的章节简介]
第三章：[章节标题] - [50字以内的章节简介]

请严格按照格式输出，不要添加额外的解释说明。`;

  try {
    const response = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: 'deepseek-ai/DeepSeek-V3.2-Exp',
      messages: [
        { role: "user", content: prompt }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${siliconToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('API调用成功');
    console.log('响应内容：');
    console.log(response.data.choices[0].message.content);
    console.log('\n\n=== 解析测试 ===');
    
    // 测试解析逻辑
    const content = response.data.choices[0].message.content;
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
        console.log('找到概述开始，currentSection:', currentSection);
      } else if (line.startsWith('章节大纲：')) {
        currentSection = 'chapters';
        console.log('找到章节大纲开始，currentSection:', currentSection);
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
        if (chapterMatch) {
          chapters.push({
            id: `chapter_${chapterMatch[1]}`,
            index: parseInt(chapterMatch[1]),
            title: chapterMatch[2].trim(),
            summary: chapterMatch[3].trim(),
            wordCount: 3333,
            content: '',
            status: 'pending',
            progress: 0
          });
          console.log('添加章节:', chapters[chapters.length - 1]);
        }
      } else if (currentSection === 'overview' && line && !line.startsWith('概述：')) {
        overview += (overview ? ' ' : '') + line;
        console.log('概述追加内容:', line);
      }
    });
    
    console.log('\n=== 解析结果 ===');
    console.log('概述:', overview);
    console.log('章节数量:', chapters.length);
    chapters.forEach(ch => {
      console.log(`第${ch.index}章: ${ch.title} - ${ch.summary}`);
    });
    
  } catch (error) {
    console.error('API调用失败:', error.response?.data || error.message);
  }
}

testOutlineGeneration();