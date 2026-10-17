const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
test('stylesheet and script resolve beside index.html when opened as a file', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/style\.css">/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
});
