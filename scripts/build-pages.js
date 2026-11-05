'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs');
const files = ['index.html', 'styles.css', 'questions.js', 'game-core.js', 'timer-core.js', 'app.js'];
const standalone = path.join(root, 'Игра.html');
const offline = path.join(output, 'game-offline.html');

for (const name of files) {
  if (!fs.statSync(path.join(root, name)).isFile()) {
    throw new Error(`Не найден файл игры: ${name}`);
  }
}

fs.mkdirSync(output, { recursive: true });
for (const name of files) fs.copyFileSync(path.join(root, name), path.join(output, name));
fs.writeFileSync(path.join(output, '.nojekyll'), '');

const latestSource = Math.max(...files.map(name => fs.statSync(path.join(root, name)).mtimeMs));
if (fs.existsSync(standalone) && fs.statSync(standalone).mtimeMs >= latestSource) {
  fs.copyFileSync(standalone, offline);
  console.log('Добавлена автономная версия: docs/game-offline.html');
} else {
  if (fs.existsSync(offline)) fs.unlinkSync(offline);
  console.log('Автономная версия пропущена. Для её обновления выполните npm run build.');
}

console.log('Готово: docs/ — статические файлы для GitHub Pages.');
