// 转义 + 混淆流水线
// 第一步「转义」：按甬哥的格式，用 acorn 解析源码，只在字符串 / 模板 / 正则 / 标识符 / 注释里
//   把敏感词逐字改成 \uXXXX 转义（代码含义一字不变）；import 的模块名保持明文不转义。
// 第二步「混淆」：javascript-obfuscator，参数与 onezun 在用的 v11 定版一致
//   （RC4 字符串数组 + 拆串 + 全局改名）。
// 用法：node scripts/transform.mjs <输入文件> <输出文件>
// 可选：环境变量 ESCAPED_OUT=<路径> 时，额外把只转义未混淆的中间文件写出来备查。
import { readFileSync, writeFileSync } from 'node:fs';
import * as acorn from 'acorn';
import JavaScriptObfuscator from 'javascript-obfuscator';

const input = process.argv[2] || 'abc.js';
const output = process.argv[3] || '_worker.js';
const src = readFileSync(input, 'utf-8');

// ---------------- 第一步：转义 ----------------
const TOKEN_RE_CI = /vless/gi; // 大小写不敏感的词
const TOKEN_RE = /socks|cloudflare|proxyip|encryption|dingyue|8\.8\.8\.8|CONNECT/g;
const COMMENT_TOKEN_RE = /vless|socks|cloudflare|proxyip|encryption|dingyue|8\.8\.8\.8|CONNECT/i;

function escapeMatch(text, regexMode) {
  let out = '';
  for (const ch of text) {
    if (regexMode && !/[A-Za-z0-9]/.test(ch)) { out += ch; continue; } // 正则里非字母数字（如 . ）保持原样，不改语义
    out += '\\u' + ch.codePointAt(0).toString(16).padStart(4, '0');
  }
  return out;
}
function escapeTokens(text, regexMode = false) {
  let t = text.replace(TOKEN_RE_CI, m => escapeMatch(m, regexMode));
  t = t.replace(TOKEN_RE, m => escapeMatch(m, regexMode));
  return t;
}
function escapeLinkChars(text) { // 链接模板里的 : 与 @ 也转义（甬哥格式）
  return text.replace(/:/g, '\\u003a').replace(/@/g, '\\u0040');
}

const comments = [];
const ast = acorn.parse(src, {
  ecmaVersion: 'latest', sourceType: 'module',
  onComment: (isBlock, text, start, end) => comments.push({ text, start, end }),
});
const edits = []; // {start, end, text}
const pushEdit = (start, end, text) => { if (src.slice(start, end) !== text) edits.push({ start, end, text }); };

// 含敏感词的注释整段删掉（留一个空格防粘连）
for (const c of comments) {
  if (COMMENT_TOKEN_RE.test(c.text)) pushEdit(c.start, c.end, ' ');
}

function isModuleSource(parent, key) {
  return parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration') && key === 'source';
}
function walk(node, parent, key) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'Literal' && typeof node.value === 'string' && !isModuleSource(parent, key)) {
    const raw = src.slice(node.start, node.end);
    const q = raw[0];
    if (q === '"' || q === "'") pushEdit(node.start, node.end, q + escapeTokens(raw.slice(1, -1)) + q);
  } else if (node.type === 'Literal' && node.regex) {
    const raw = src.slice(node.start, node.end);
    const lastSlash = raw.lastIndexOf('/');
    pushEdit(node.start, node.end, '/' + escapeTokens(raw.slice(1, lastSlash), true) + raw.slice(lastSlash));
  } else if (node.type === 'TemplateElement') {
    let raw = node.value.raw;
    const cooked = raw; // 链接判断用当前段即可，:// 一般落在同一段
    let next = escapeTokens(raw);
    if (cooked.includes('://') || cooked.includes('@')) next = escapeLinkChars(next);
    pushEdit(node.start, node.end, next);
  } else if (node.type === 'Identifier') {
    pushEdit(node.start, node.end, escapeTokens(node.name));
  }
  for (const k of Object.keys(node)) {
    if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(child => walk(child, node, k));
    else if (v && typeof v.type === 'string') walk(v, node, k);
  }
}
walk(ast, null, null);

edits.sort((a, b) => b.start - a.start);
let escaped = src;
for (const e of edits) escaped = escaped.slice(0, e.start) + e.text + escaped.slice(e.end);

// 转义后必须仍可解析，解析不过直接报错停机，不产出坏文件
acorn.parse(escaped, { ecmaVersion: 'latest', sourceType: 'module' });
console.log(`转义完成：共 ${edits.length} 处编辑`);
if (process.env.ESCAPED_OUT) writeFileSync(process.env.ESCAPED_OUT, escaped, 'utf-8');

// ---------------- 第二步：混淆 ----------------
const result = JavaScriptObfuscator.obfuscate(escaped, {
  compact: true,
  renameGlobals: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1,
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  numbersToExpressions: true,
  simplify: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'browser',
});
const finalCode = result.getObfuscatedCode();
acorn.parse(finalCode, { ecmaVersion: 'latest', sourceType: 'module' });
writeFileSync(output, finalCode, 'utf-8');
console.log(`混淆完成：${input} -> ${output}（${finalCode.length} 字节）`);
