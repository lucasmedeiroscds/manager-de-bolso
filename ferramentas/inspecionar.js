// Mostra cabeçalho e algumas linhas de um .csv.gz (só leitura)
// Uso: node ferramentas/inspecionar.js caminho/arquivo.csv.gz [linhas]
import fs from 'node:fs';
import zlib from 'node:zlib';
const [file, n = '4'] = process.argv.slice(2);
const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
const lines = text.split(/\r?\n/);
console.log(`${file}: ${lines.length - 1} linhas`);
console.log(lines.slice(0, Number(n) + 1).join('\n'));
