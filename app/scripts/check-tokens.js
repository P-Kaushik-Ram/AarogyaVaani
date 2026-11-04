const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const colors = require('../src/design/tokens/colors.json');
const type = require('../src/design/tokens/typography.json');
const metrics = require('../src/design/tokens/metrics.json');
const required = ['bg','surface1','surface2','borderSoft','borderStrong','textPrimary','textSecondary','textMuted','accent','onAccent','accentPressed','success','danger','care','scrim','disabled','glass','glassElevated','amber','ambient','sheen','transparent','shadow'];
for (const theme of ['dark','hc']) for(const key of required) assert.equal(typeof colors[theme][key], 'string', `${theme}.${key}`);
assert.equal(colors.dark.bg,'#071A2B');assert.equal(colors.dark.textPrimary,'#FFF8EC');assert.equal(colors.dark.accent,'#FF9F1C');
for(const name of ['TimeDisplay','H1','H2','Title','BodyLarge','Body','Caption','Button']) {
 assert(type[name].fontSize>=(name==='Caption'?12:15),name);assert(type[name].lineHeight>type[name].fontSize,name);
}
assert(type.Nav.fontSize>=11);assert(type.Nav.lineHeight>type.Nav.fontSize);
assert(metrics.size.touch>=48);assert(metrics.size.button>=48);
for(const group of ['space','radius','motion','size','a11y']) assert(metrics[group], group);
const errors=[];
const dimension=/^(fontSize|lineHeight|letterSpacing|padding.*|margin.*|gap|rowGap|columnGap|border.*Width|border.*Radius|width|height|minWidth|minHeight|maxWidth|maxHeight|top|bottom|left|right|inset)$/;
function walk(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=[...walk('src'),...walk('app')].filter(f=>/\.[jt]sx?$/.test(f)&&!f.replaceAll('\\','/').startsWith('src/design/'));
for(const file of files){
 const source=fs.readFileSync(file,'utf8');
 if(/#[\da-f]{3,8}\b/i.test(source)||/\b(?:rgba?|hsla?)\(\s*\d/.test(source)) errors.push(`${file}: hard-coded colour`);
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node){
  if(ts.isPropertyAssignment(node)&&dimension.test(node.name.getText(tree).replace(/['"]/g,''))){
   if(ts.isNumericLiteral(node.initializer)||(ts.isStringLiteral(node.initializer)&&/^\d/.test(node.initializer.text))) errors.push(`${file}: hard-coded ${node.name.getText(tree)}`);
  }
  if(ts.isJsxText(node)&&node.text.trim())errors.push(`${file}: literal UI text ${node.text.trim()}`);
  if(ts.isJsxAttribute(node)&&/^(label|title|placeholder|accessibilityLabel|accessibilityHint)$/.test(node.name.text)&&node.initializer&&ts.isStringLiteral(node.initializer)) errors.push(`${file}: literal ${node.name.text}`);
  ts.forEachChild(node,visit);
 }
 visit(tree);
}
assert.deepEqual(errors,[]);
console.log(`Design tokens PASS: ${required.length} colours per theme; typography, spacing, radii, motion, accessibility. Scanned ${files.length} source files for literal colours, dimensions and UI text.`);
