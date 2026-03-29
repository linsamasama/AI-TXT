const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envFiles = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '.env.local'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.local')
];

envFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
});

module.exports = {
  envFiles
};
