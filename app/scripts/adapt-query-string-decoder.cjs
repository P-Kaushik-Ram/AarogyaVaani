// GHSA-vcc3-ghjq-m6fr: use upstream's patched decoder, with one CJS/ESM boundary fix.
// Deliberately fail closed if query-string or the decoder changes. See P14_5 report.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const originalHash = 'caa3f2c8b45dfe1e91db22ae10743af68de8d96f26515132bb52485ec0f037fa';
const before = "const decodeComponent = require('decode-uri-component');";
const after = "const decodeComponent = require('decode-uri-component').default;";
function adapt(source) {
  // Repeated installs must be idempotent, but must still verify the entire caller.
  const original = source.includes(after) ? source.replace(after, before) : source;
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), originalHash,
    'Unreviewed query-string source; review the security adapter before installing');
  assert.equal(original.split(before).length, 2, 'Expected one decoder import');
  return original.replace(before, after);
}
function main() {
  const caller = require.resolve('query-string');
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(caller),'package.json'),'utf8')).version, '7.1.3');
  const decoder = require.resolve('decode-uri-component', {paths:[path.dirname(caller)]});
  const metadata = JSON.parse(fs.readFileSync(path.join(path.dirname(decoder),'package.json'),'utf8'));
  assert.equal(metadata.version, '0.5.0');
  assert.equal(metadata.type, 'module');
  const source = fs.readFileSync(caller, 'utf8');
  const adapted = adapt(source);
  if (source !== adapted) fs.writeFileSync(caller, adapted);
  console.log('Verified query-string 7.1.3 -> decode-uri-component 0.5.0 ESM default adapter');
}
if (require.main === module) main();
module.exports = {adapt};
