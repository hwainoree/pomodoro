import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
test('build emits the four static assets without external dependencies',()=>{
 assert.ok(existsSync('scripts/build.mjs'),'build script must exist');
 const r=spawnSync(process.execPath,['scripts/build.mjs'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 for(const f of ['index.html','styles.css','app.js','timer-core.js'])assert.ok(readFileSync('dist/'+f).length>0);
});
