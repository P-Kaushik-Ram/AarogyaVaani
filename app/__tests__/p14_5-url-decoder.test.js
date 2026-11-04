const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const query = require('query-string');
const decode = require('decode-uri-component').default;
const {adapt} = require('../scripts/adapt-query-string-decoder.cjs');
// Exercise the real library callers; no URL parser or decoder mock.
const core = require('expo-router/build/react-navigation/core/getStateFromPath');
const incoming = require('expo-router/build/fork/getStateFromPath');
const outgoing = require('expo-router/build/fork/getPathFromState');

test('installed patched decoder and exact caller adaptation are enforced', () => {
  const file = require.resolve('decode-uri-component');
  expect(JSON.parse(fs.readFileSync(path.join(path.dirname(file),'package.json'),'utf8')).version).toBe('0.5.0');
  const caller = fs.readFileSync(require.resolve('query-string'),'utf8');
  expect(adapt(caller)).toBe(caller);
  expect(() => adapt(caller + '\n// unreviewed change')).toThrow('Unreviewed query-string source');
});

test.each([
  ['%', '%'], ['%GG', '%GG'], ['%E0%A4%A', '%E0%A4%A'],
  ['%C0%AF', '%C0%AF'], ['%ED%A0%80', '%ED%A0%80'],
  ['%F4%90%80%80', '%F4%90%80%80'], ['%FF', '%FF'],
  ['%41%FF%42', 'A%FFB'], ['%C2', '\uFFFD'],
  ['%FE%FF', '\uFFFD\uFFFD'], ['%25', '%'],
  ['%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%87', 'नमस्ते'],
  ['%F0%9F%92%8A', '💊'], ['%252F', '%2F'],
])('malformed and Unicode decoding remains safe: %s', (encoded, expected) => {
  expect(decode(encoded)).toBe(expected);
  expect(query.parse(`value=${encoded}`).value).toBe(expected);
});

test('query semantics preserve plus, literal plus, repeats, keys and decode:false', () => {
  expect({...query.parse('medicine=Vitamin+D&literal=%2B&dose=1&dose=2&empty=&flag&%E0%A4%A8=ok')}).toEqual({
    medicine:'Vitamin D', literal:'+', dose:['1','2'], empty:'', flag:null, न:'ok',
  });
  expect({...query.parse('value=a+b%20c',{decode:false})}).toEqual({value:'a+b%20c'});
  const params = {medicine:'Vitamin D + B', note:'नमस्ते 💊', id:'synthetic-42'};
  expect({...query.parse(query.stringify(params))}).toEqual(params);
});

test('large malicious inputs complete in an isolated process with a hard timeout', () => {
  const program = `
    const assert=require('node:assert/strict'),q=require('query-string');
    for(const unit of ['%FF','%C0%AF','%ED%A0%80','%F4%90%80%80']) {
      const value=unit.repeat(20000);
      assert.equal(q.parse('value='+value).value,value);
    }
    assert.equal(q.parse('value='+'%41%FF'.repeat(10000)).value,'A%FF'.repeat(10000));
    assert.equal(q.parse('value='+'%GG%'.repeat(20000)).value,'%GG%'.repeat(20000));
    console.log('malicious-inputs-pass');`;
  expect(execFileSync(process.execPath,['-e',program],{
    cwd:path.resolve(__dirname,'..'), timeout:10000, encoding:'utf8',
  }).trim()).toBe('malicious-inputs-pass');
});

const options = {screens:{Reminder:'reminder/:id', Alert:'alert/:reminderId'}};
test.each([['reminder/42','Reminder','id'], ['alert/42','Alert','reminderId']])(
  'actual Router callers retain reminder/notification identifiers: %s', (url,name,idKey) => {
    for(const parser of [core,incoming]) {
      const state=parser.getStateFromPath('/'+url+'?note=Vitamin+D&repeat=1&repeat=2',options);
      expect(state.routes[0].name).toBe(name);
      expect(state.routes[0].params).toEqual(expect.objectContaining({[idKey]:'42',note:'Vitamin D',repeat:['1','2']}));
      const encoded=outgoing.getPathFromState(state,options);
      expect(encoded).toContain('/'+url);
      expect(query.parse(encoded.split('?')[1]).note).toBe('Vitamin D');
    }
  });

test('actual legacy core routing parser handles hostile query input', () => {
  const value='%FF'.repeat(2000);
  const state=core.getStateFromPath('/reminder/42?note='+value,options);
  expect(state.routes[0].params.note).toBe(value);
  expect(state.routes[0].params.id).toBe('42');
});
