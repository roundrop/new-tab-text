import fs from 'fs';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--watch');

// manifest.jsonを読み込み
const manifestPath = path.resolve('public/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 開発版の場合は名前を変更
if (isDev) {
  manifest.name = 'New Tab Text (Dev)';
  manifest.version = '1.0.0-dev';
}

// distディレクトリにmanifest.jsonを出力
const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.writeFileSync(
  path.resolve(distDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log(`Manifest generated for ${isDev ? 'development' : 'production'} mode`);
