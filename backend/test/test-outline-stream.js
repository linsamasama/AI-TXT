const axios = require('axios');

async function testOutlineStream() {
  console.log('Testing /story/generate-outline-stream endpoint...');
  
  try {
    const response = await axios.post('http://localhost:3000/story/generate-outline-stream', {
      theme: '一个关于爱情的温馨故事',
      wordCount: 5000
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    let buffer = '';
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      console.log('Received chunk:', chunk.toString().substring(0, 100) + '...');
    });
    
    response.data.on('end', () => {
      console.log('Stream ended');
      console.log('Total buffer length:', buffer.length);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testOutlineStream();