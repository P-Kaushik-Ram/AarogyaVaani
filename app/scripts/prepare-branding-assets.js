const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

// Packaging only: copy the official source pixels unchanged into a padded layer.
// A 40%-wide square fits entirely inside Android's 66/108 circular safe zone.
const directory = path.join(__dirname, '../assets/branding');
const source = PNG.sync.read(fs.readFileSync(path.join(directory, 'aarogyavaani_app_icon.png')));
assert.equal(source.width, source.height, 'The official icon must be square');
const size = source.width * 2.5;
const inset = (size - source.width) / 2;
assert(Number.isInteger(size) && Number.isInteger(inset), 'Padding must align to whole pixels');
const output = new PNG({ width:size, height:size });
output.data.fill(0);
PNG.bitblt(source, output, 0, 0, source.width, source.height, inset, inset);
fs.writeFileSync(path.join(directory, 'aarogyavaani_adaptive_foreground.png'), PNG.sync.write(output));
console.log(`Official adaptive foreground: ${size}x${size}; original ${source.width}x${source.height} pixels unchanged; centered inset ${inset}px.`);
