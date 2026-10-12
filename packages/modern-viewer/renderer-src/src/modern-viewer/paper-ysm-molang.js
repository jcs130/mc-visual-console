// Bounded Molang interpreter for public YSM animations. Model text is data:
// never eval/Function/JavaScript, no property traversal or host function calls.
// Unknown native queries/functions remain explicit errors, not guessed inputs.
const functions = Object.freeze({
  'math.sin': x => Math.sin(x * Math.PI / 180), 'math.cos': x => Math.cos(x * Math.PI / 180),
  'math.abs': Math.abs, 'math.floor': Math.floor, 'math.ceil': Math.ceil, 'math.round': Math.round,
  'math.trunc': Math.trunc, 'math.sqrt': Math.sqrt, 'math.exp': Math.exp, 'math.ln': Math.log,
  'math.pow': Math.pow, 'math.min': Math.min, 'math.max': Math.max, 'math.mod': (a, b) => a % b,
  'math.clamp': (x, a, b) => Math.max(a, Math.min(b, x)), 'math.lerp': (a, b, t) => a + (b - a) * t,
  'math.hermite_blend': x => x * x * (3 - 2 * x)
});
const cache = new Map();
const canonical = name => name.replace(/^v\./, 'variable.').replace(/^q\./, 'query.').replace(/^t\./, 'temp.');
// Roaming structs are stored as bounded, flat keys. Never traverse JS objects.
const validVariable = name => /^(?:variable|temp)\.[a-z_][a-z_\d]*(?:\.[a-z_][a-z_\d]*){0,7}$/.test(name) && !name.split('.').some(part => ['__proto__','prototype','constructor'].includes(part));
const fail = () => { throw Error('YSM_MOLANG_UNSUPPORTED'); };
const truth = x => x !== 0;
const finite = x => { if (!Number.isFinite(x) || Math.abs(x) > 1e12) throw Error('YSM_MOLANG_VALUE_INVALID'); return x; };

export function compilePaperMolang(source) {
  if (Number.isFinite(source)) return () => source;
  if (typeof source !== 'string' || source.length > 4096) return fail();
  if (cache.has(source)) return cache.get(source);
  // Comments and strings are not needed by this bounded expression profile.
  const tokens = source.toLowerCase().match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z_][a-z_\d]*(?:\.[a-z_][a-z_\d]*)*|==|!=|<=|>=|&&|\|\||[+\-*/%<>=!?:(),;]/g) ?? [];
  if (tokens.length > 1024 || tokens.join('') !== source.toLowerCase().replace(/\s/g, '')) return fail();
  let at = 0, depth = 0;
  const peek = () => tokens[at], take = () => tokens[at++];
  const expect = token => { if (take() !== token) fail(); };
  const precedence = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function primary() {
    if (++depth > 64) fail();
    let node; const token = take();
    if (['!', '-', '+'].includes(token)) node = { kind: 'unary', op: token, value: primary() };
    else if (token === '(') { node = expression(); expect(')'); }
    else if (token && /^(?:\d|\.\d)/.test(token)) node = { kind: 'number', value: finite(Number(token)) };
    else if (token && /^[a-z_]/.test(token)) {
      const name = canonical(token);
      if (peek() === '(') {
        if (!Object.hasOwn(functions, name) && !['math.random', 'math.random_integer'].includes(name)) fail();
        take(); const args = []; if (peek() !== ')') do { args.push(expression()); if (peek() !== ',') break; take(); } while (args.length < 9);
        expect(')'); node = { kind: 'call', name, args };
      } else {
        if (!validVariable(name) && !/^(?:query|ysm|tlm)\.[a-z_][a-z_\d]*$/.test(name) && !['true', 'false', 'math.pi', 'math.e'].includes(name)) fail();
        node = { kind: 'read', name };
      }
    } else fail();
    depth--; return node;
  }
  function binary(min = 1) {
    let left = primary();
    while ((precedence[peek()] ?? 0) >= min) { const op = take(), right = binary(precedence[op] + 1); left = { kind: 'binary', op, left, right }; }
    return left;
  }
  function expression() {
    let node = binary();
    if (peek() === '?') { take(); const yes = expression(); let no = { kind: 'number', value: 0 }; if (peek() === ':') { take(); no = expression(); } node = { kind: 'conditional', condition: node, yes, no }; }
    if (peek() === '=') { if (node.kind !== 'read' || !validVariable(node.name)) fail(); take(); node = { kind: 'assign', name: node.name, value: expression() }; }
    return node;
  }
  const statements = [];
  while (at < tokens.length) { if (peek() === ';') { take(); continue; } statements.push(expression()); if (at < tokens.length) expect(';'); }
  function run(node, context) {
    if (node.kind === 'number') return node.value;
    if (node.kind === 'read') {
      if (validVariable(node.name)) return finite(context.variables[node.name] ?? 0); // Molang uninitialized variables are zero.
      const constants = { true: 1, false: 0, 'math.pi': Math.PI, 'math.e': Math.E };
      if (Object.hasOwn(constants, node.name)) return constants[node.name];
      if (!Object.hasOwn(context.queries, node.name)) throw Error('YSM_MOLANG_INPUT_UNAVAILABLE:' + node.name);
      return finite(Number(context.queries[node.name]));
    }
    if (node.kind === 'assign') return context.variables[node.name] = finite(run(node.value, context));
    if (node.kind === 'conditional') return run(truth(run(node.condition, context)) ? node.yes : node.no, context);
    if (node.kind === 'unary') { const v = run(node.value, context); return node.op === '!' ? Number(!truth(v)) : node.op === '-' ? -v : v; }
    if (node.kind === 'call') {
      const args = node.args.map(n => run(n, context));
      if (node.name === 'math.random' || node.name === 'math.random_integer') {
        if (args.length !== 2) fail(); const random = (context.random ?? Math.random)();
        return node.name === 'math.random' ? args[0] + random * (args[1] - args[0]) : Math.floor(args[0] + random * (args[1] - args[0] + 1));
      }
      return finite(functions[node.name](...args));
    }
    const a = run(node.left, context);
    if (node.op === '&&' && !truth(a)) return 0; if (node.op === '||' && truth(a)) return 1;
    const b = run(node.right, context);
    switch (node.op) {
      case '+': return finite(a + b); case '-': return finite(a - b); case '*': return finite(a * b);
      case '/': return finite(a / b); case '%': return finite(a % b);
      case '<': return Number(a < b); case '>': return Number(a > b); case '<=': return Number(a <= b); case '>=': return Number(a >= b);
      case '==': return Number(a === b); case '!=': return Number(a !== b); case '&&': return Number(truth(b)); case '||': return Number(truth(b));
      default: return fail();
    }
  }
  const compiled = (context = {}) => {
    context.variables ??= Object.create(null); context.queries ??= Object.create(null);
    let value = 0; for (const statement of statements) value = run(statement, context); return finite(value);
  };
  if (cache.size >= 4096) cache.delete(cache.keys().next().value); cache.set(source, compiled);
  return compiled;
}
