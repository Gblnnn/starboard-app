import fs from 'fs';
import path from 'path';

const passportsPath = path.join(process.cwd(), 'src', 'pages', 'passports.tsx');
let content = fs.readFileSync(passportsPath, 'utf8');
content = content.replace(/user\?\.uid/g, 'user?.id');
fs.writeFileSync(passportsPath, content);
console.log("passports.tsx fixed");
