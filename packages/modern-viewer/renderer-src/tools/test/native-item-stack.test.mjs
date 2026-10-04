import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNativeItemStack, nativeNumericValue, NATIVE_ITEM_STACK_LIMITS } from '../../src/native-viewer/native-item-stack.js'

const item = (snbt, name = 'test:item', count = 1) => ({ name, count, snbt })
const components = text => parseNativeItemStack(item(`{id:"test:item",count:1,components:${text}}`)).components

test('actual worn notebook and component-selected Patchouli book retain complete native identity', () => {
  assert.deepEqual(parseNativeItemStack(item('{count:1,id:"ars_nouveau:worn_notebook"}', 'ars_nouveau:worn_notebook')), {
    id: 'ars_nouveau:worn_notebook', count: 1, components: {}
  })
  assert.deepEqual(parseNativeItemStack(item('{components:{"patchouli:book":"touhou_little_maid:memorizable_gensokyo"},count:1,id:"patchouli:guide_book"}', 'patchouli:guide_book')), {
    id: 'patchouli:guide_book', count: 1, components: { 'patchouli:book': 'touhou_little_maid:memorizable_gensokyo' }
  })
})

test('quoted and unquoted keys and strings obey Mojang escaping rather than JSON or evaluation', () => {
  const values = components(`{'one':hello_world,"two":'can\\'t',three:"quote\\\"and\\\\slash","四":"原生书",script:"globalThis.bad=1"}`)
  assert.equal(values.one, 'hello_world'); assert.equal(values.two, "can't")
  assert.equal(values.three, 'quote"and\\slash'); assert.equal(values['四'], '原生书')
  assert.equal(values.script, 'globalThis.bad=1'); assert.equal(globalThis.bad, undefined)
  for (const escaped of ['\\n', '\\u0061', '\\x61', '\\t']) assert.throws(() => components(`{a:"${escaped}"}`), /STRING_ESCAPE/)
  assert.throws(() => components('{a:namespace:value}'), /SYNTAX/)
})

test('byte/short/long/float/double types, booleans and exact long values are preserved', () => {
  const values = components('{b:-128b,s:32767s,i:2147483647,l:9223372036854775807L,f:0.1f,d:1.0D,implicit:1.0,yes:TrUe,no:false,scientific:1.0e2}')
  assert.deepEqual(values.b, { type: 'byte', value: -128 })
  assert.deepEqual(values.s, { type: 'short', value: 32767 })
  assert.equal(values.i, 2147483647)
  assert.deepEqual(values.l, { type: 'long', value: '9223372036854775807' })
  assert.deepEqual(values.f, { type: 'float', value: Math.fround(0.1) })
  assert.deepEqual(values.d, { type: 'double', value: 1 })
  assert.deepEqual(values.implicit, { type: 'double', value: 1 })
  assert.deepEqual(values.yes, { type: 'byte', value: 1 }); assert.deepEqual(values.no, { type: 'byte', value: 0 })
  assert.deepEqual(values.scientific, { type: 'double', value: 100 })
  assert.equal(nativeNumericValue(values.l), null); assert.equal(nativeNumericValue(values.f), Math.fround(0.1))
  assert.equal(nativeNumericValue(values.yes), 1)
  assert.equal(nativeNumericValue(components('{safe:9007199254740991L}').safe), 9007199254740991)
})

test('float decimal midpoint rounding matches direct Java Float.parseFloat without a double-rounded component', () => {
  // Real Java 21 fixtures: Float.floatToRawIntBits(Float.parseFloat(literal)).
  const fixtures = [['1.0000000596046448', 1065353217], ['1.0000000596046447', 1065353216],
    ['-1.0000000596046448', 3212836865], ['1.000000059604644775390625', 1065353216],
    ['1.000000178813934326171875', 1065353218]]
  const view = new DataView(new ArrayBuffer(4))
  for (const [literal, bits] of fixtures) {
    view.setFloat32(0, components(`{value:${literal}f}`).value.value)
    assert.equal(view.getUint32(0), bits, literal)
  }
})

test('oversized float midpoint literals never request arbitrary BigInt powers or silently round; the original token remains available', () => {
  const literal = '1.0000000596046448' + '0'.repeat(4000) + 'f'
  const value = components(`{value:${literal}}`).value
  assert.equal(value.type, 'float'); assert.equal(value.value, null)
  assert.equal(value.literal, literal); assert.equal(value.unavailableReason, 'NATIVE_ITEM_STACK_FLOAT_LITERAL_UNVERIFIED')
  assert.equal(nativeNumericValue(value), null)
  assert.deepEqual(components('{value:1e999999999999999999f}').value, { type: 'float', value: 'Infinity' })
})

test('Mojang out-of-range integers and nonnumeric tokens remain strings; floating overflow remains a typed unavailable value', () => {
  // Independently invoked uz.parseTag in the locked official client JAR:
  // 1e3→StringTag, 1.0e3→DoubleTag, 128b→StringTag, 1e50f→Infinity FloatTag.
  const values = components('{b:128b,s:-32769s,i:2147483648,l:9223372036854775808L,zero:01,exponent:1e3,overflow:1e50f,doubleOverflow:1e500d}')
  for (const [key, value] of Object.entries({ b: '128b', s: '-32769s', i: '2147483648', l: '9223372036854775808L', zero: '01', exponent: '1e3' })) assert.equal(values[key], value)
  assert.deepEqual(values.overflow, { type: 'float', value: 'Infinity' })
  assert.deepEqual(values.doubleOverflow, { type: 'double', value: 'Infinity' })
  assert.equal(nativeNumericValue(values.overflow), null)
  assert.equal(Object.is(components('{intZero:-0}').intZero, -0), false)
})

test('typed arrays and homogeneous nested lists retain NBT types and reject mixed types', () => {
  const values = components('{bytes:[B;-128b,0b,127b],ints:[I;-2147483648,2147483647],longs:[L;-9223372036854775808L,9223372036854775807L],list:[{x:[1,2]},{x:[]}],empty:[B;]}')
  assert.deepEqual(values.bytes, { type: 'byteArray', value: [-128, 0, 127] })
  assert.deepEqual(values.ints, { type: 'intArray', value: [-2147483648, 2147483647] })
  assert.deepEqual(values.longs, { type: 'longArray', value: ['-9223372036854775808', '9223372036854775807'] })
  assert.deepEqual(values.list, [{ x: [1, 2] }, { x: [] }]); assert.deepEqual(values.empty, { type: 'byteArray', value: [] })
  for (const invalid of ['[B;1]', '[I;1b]', '[L;1]', '[X;1]', '[1,1b]', '[{},[]]', '[1,"two"]'])
    assert.throws(() => components(`{v:${invalid}}`), /ARRAY_TYPE/)
})

test('full Ars spell compound survives and no component or removal marker is stripped', () => {
  const value = components('{"ars_nouveau:spell_caster":{max_slots:10,spells:{0:{color:{b:180,g:25,id:"ars_nouveau:constant",r:255},name:"Smoke Heal",particleTimeline:{},recipe:["ars_nouveau:glyph_self","ars_nouveau:glyph_heal"],sound:{}}}},"minecraft:base_color":3,"!minecraft:custom_name":{},"other:unknown":{nested:[I;1,2]}}')
  assert.equal(value['ars_nouveau:spell_caster'].spells['0'].name, 'Smoke Heal')
  assert.deepEqual(value['ars_nouveau:spell_caster'].spells['0'].recipe, ['ars_nouveau:glyph_self', 'ars_nouveau:glyph_heal'])
  assert.equal(value['minecraft:base_color'], 3); assert.deepEqual(value['!minecraft:custom_name'], {})
  assert.deepEqual(value['other:unknown'].nested, { type: 'intArray', value: [1, 2] })
})

test('duplicate keys, prototype keys and tag-looking compounds cannot pollute or bypass type checks', () => {
  for (const invalid of ['{id:"test:item",count:1,count:2}', '{id:"test:item",count:1,components:{a:1,"a":2}}'])
    assert.throws(() => parseNativeItemStack(item(invalid)), /DUPLICATE_KEY/)
  const values = components('{"__proto__":{polluted:1},constructor:{prototype:{alsoBad:1}},fake:{type:"byte",value:1}}')
  assert.equal(Object.getPrototypeOf(values), Object.prototype); assert.equal(Object.hasOwn(values, '__proto__'), true)
  assert.equal(values.__proto__.polluted, 1); assert.equal({}.polluted, undefined); assert.equal({}.alsoBad, undefined)
  assert.equal(nativeNumericValue(values.fake), null)
})

test('missing original data, mismatched identity, extra envelope fields and truncated/trailing data fail closed', () => {
  for (const invalid of [{ name: 'test:item', count: 1 }, { name: 'test:item', count: 1, components: null }])
    assert.throws(() => parseNativeItemStack(invalid), /UNKNOWN/)
  for (const invalid of ['{id:"other:item",count:1}', '{id:"test:item",count:2}', '{id:"test:item",count:1b}', '{id:"test:item"}'])
    assert.throws(() => parseNativeItemStack(item(invalid)), /IDENTITY/)
  assert.throws(() => parseNativeItemStack(item('{id:"test:item",count:1,tag:{}}')), /ENVELOPE/)
  assert.throws(() => parseNativeItemStack(item('{id:"test:item",count:1,components:[]}')), /COMPONENTS/)
  for (const invalid of ['{id:"test:item",count:1}x', '{id:"test:item",count:1} {}']) assert.throws(() => parseNativeItemStack(item(invalid)), /TRAILING_DATA/)
  for (const invalid of ['{id:"test:item",count:1', '{id:"test:item",count:1,components:{a:"unterminated}}', '{id:"test:item",count:1,,}'])
    assert.throws(() => parseNativeItemStack(item(invalid)), /SYNTAX/)
})

test('a second structured components source cannot silently override or be ignored beside the complete SNBT', () => {
  const source = item('{id:"patchouli:guide_book",count:1,components:{"patchouli:book":"touhou_little_maid:memorizable_gensokyo"}}', 'patchouli:guide_book')
  for (const second of [{}, { 'patchouli:book': 'different:book' }, { 'patchouli:book': 'touhou_little_maid:memorizable_gensokyo' }])
    assert.throws(() => parseNativeItemStack({ ...source, components: second }), /COMPONENT_SOURCE_CONFLICT/)
  assert.equal(parseNativeItemStack({ ...source, components: null }).components['patchouli:book'], 'touhou_little_maid:memorizable_gensokyo')
  assert.throws(() => parseNativeItemStack({ name: source.name, count: 1, components: {} }), /COMPONENT_SOURCE_CONFLICT/)
})

test('64 KiB UTF-8, depth 16 and 4096 node budgets bound parsing before dangerous allocation', () => {
  assert.deepEqual(NATIVE_ITEM_STACK_LIMITS, { bytes: 65536, depth: 16, nodes: 4096 })
  assert.throws(() => components(`{a:"${'界'.repeat(23000)}"}`), /BYTE_LIMIT/)
  assert.throws(() => components(`{a:"${'x'.repeat(65537)}"}`), /BYTE_LIMIT/)
  assert.throws(() => components(`{a:${'['.repeat(16)}0${']'.repeat(16)}}`), /DEPTH_LIMIT/)
  assert.doesNotThrow(() => components(`{a:${'['.repeat(13)}0${']'.repeat(13)}}`))
  assert.throws(() => components(`{a:${'['.repeat(14)}0${']'.repeat(14)}}`), /DEPTH_LIMIT/)
  assert.throws(() => components(`{a:[${Array(4096).fill(0).join(',')}]}`), /NODE_LIMIT/)
  assert.equal(components(`{a:[${Array(4091).fill(0).join(',')}]}`).a.length, 4091)
  assert.throws(() => components(`{a:[${Array(4092).fill(0).join(',')}]}`), /NODE_LIMIT/)
  const prefix = '{id:"test:item",count:1,components:{a:"', suffix = '"}}'
  const exact = prefix + 'x'.repeat(65536 - prefix.length - suffix.length) + suffix
  assert.equal(new TextEncoder().encode(exact).byteLength, 65536)
  assert.equal(parseNativeItemStack(item(exact)).components.a.length, 65536 - prefix.length - suffix.length)
})

test('ordinary SNBT whitespace and allowed trailing separators parse without mutating the supplied item', () => {
  const source = item(' { id : "test:item" , count : 1 , components : { a : [1,2,] , } , } ')
  const before = JSON.stringify(source)
  assert.deepEqual(parseNativeItemStack(source), { id: 'test:item', count: 1, components: { a: [1, 2] } })
  assert.equal(JSON.stringify(source), before)
})
