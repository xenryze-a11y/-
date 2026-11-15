/** 发布传输分块；运行代码与像素字节原样重组，离线单文件不变。 */
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  out = path.resolve(process.argv[2] || path.join(root, 'dist-hosted'));
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, 'chunks'), { recursive: true });
const files = [],
  hash = (b) => crypto.createHash('sha1').update(b).digest('hex');
function chunks(bytes, kind) {
  const id = hash(bytes),
    paths = [];
  for (let i = 0; i < bytes.length; i += 60000) {
    const data = bytes.subarray(i, i + 60000),
      file = `chunks/${kind}-${id}-${Math.floor(i / 60000)}.bin`;
    fs.writeFileSync(path.join(out, file), data);
    files.push({ file, sha: hash(data), size: data.length });
    paths.push('./' + file);
  }
  return paths;
}
let html = fs.readFileSync(
  path.join(root, 'dist-standalone/index.html'),
  'utf8',
);
const assets = new Map();
html = html.replace(
  /(["'])data:image\/png;base64,([A-Za-z0-9+/=]+)\1/g,
  (_, quote, body) => {
    const data = Buffer.from(body, 'base64'),
      id = hash(data);
    if (!assets.has(id)) assets.set(id, chunks(data, 'sprite'));
    return `__avHostedSprites[${JSON.stringify(id)}]`;
  },
);
if (/data:image\/png;base64,[A-Za-z0-9+/=]{100}/.test(html))
  throw Error('Unpacked PNG literal');
const match = /<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/.exec(
  html,
);
if (!match) throw Error('Missing standalone module');
const prelude = `const __avHostedSprites=Object.fromEntries(await Promise.all(${JSON.stringify([...assets])}.map(async([id,paths])=>[id,URL.createObjectURL(new Blob(await Promise.all(paths.map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('素材加载失败 '+r.status);return r.arrayBuffer();})),{type:'image/png'}))])));\n`;
const codePaths = chunks(Buffer.from(prelude + match[1]), 'code');
const loader = `<script type="module">try {const parts=await Promise.all(${JSON.stringify(codePaths)}.map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('脚本加载失败 '+r.status);return r.arrayBuffer();}));await import(URL.createObjectURL(new Blob(parts,{type:'text/javascript'})));}catch(e){const b=document.getElementById('boot');if(b){b.classList.add('error');b.textContent='加载失败，请刷新重试：'+e.message;}}</script>`;
html = html.replace(match[0], loader);
const index = Buffer.from(html);
fs.writeFileSync(path.join(out, 'index.html'), index);
files.push({ file: 'index.html', sha: hash(index), size: index.length });
fs.writeFileSync(out + '-manifest.json', JSON.stringify(files, null, 2) + '\n');
console.log(
  JSON.stringify({
    files: files.length,
    images: assets.size,
    maxBytes: Math.max(...files.map((f) => f.size)),
    indexBytes: index.length,
    totalBytes: files.reduce((n, f) => n + f.size, 0),
  }),
);
