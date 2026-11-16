import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await mkdir(new URL('dist/',root),{recursive:true});
const files=['index.html','styles.css','app.js','timer-core.js'];
for(const file of files)await copyFile(new URL('src/'+file,root),new URL('dist/'+file,root));
console.log('Built '+files.length+' static assets in '+fileURLToPath(new URL('dist/',root)));
