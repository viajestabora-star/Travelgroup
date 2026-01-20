const fs = require('fs');
const storage = JSON.parse(fs.readFileSync('node_modules/.vite/deps/_metadata.json', 'utf-8'));
console.log('Checking local storage...');
