// Gera css/icons.css com os ícones Lucide (lucide-static, licença ISC) usados no site.
// Uso: npm run icons — procura classes "ico-<nome>" nos .html e em js/*.js e embute só esses
// ícones, como máscara CSS (a cor vem de currentColor). "<nome>-fill" é a versão preenchida.
// Na marcação: <i class="ico ico-star" aria-hidden="true"></i>
import { readFileSync, readdirSync, writeFileSync } from "fs";

const ICONS = "node_modules/lucide-static/icons/";
const sources = readdirSync(".").filter((f) => f.endsWith(".html"))
  .concat(readdirSync("js").filter((f) => f.endsWith(".js") && !f.endsWith(".min.js")).map((f) => "js/" + f));

const names = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bico-([a-z0-9]+(?:-[a-z0-9]+)*)\b/g)) names.add(m[1]);
}

const toDataUri = (svg) => "data:image/svg+xml," + svg
  .replace(/<!--[\s\S]*?-->/g, "").replace(/\s*\n\s*/g, " ").replace(/\s+class="[^"]*"/, "").trim()
  .replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E");

const rules = [];
const missing = [];
for (const name of Array.from(names).sort()) {
  const fill = name.endsWith("-fill");
  const base = fill ? name.slice(0, -5) : name;
  let svg;
  try { svg = readFileSync(ICONS + base + ".svg", "utf8"); } catch (e) { missing.push(name); continue; }
  if (fill) svg = svg.replace('fill="none"', 'fill="black"');
  rules.push(".ico-" + name + "{--ico:url(\"" + toDataUri(svg) + "\")}");
}

const css = `/* Gerado por build-icons.mjs (npm run icons) — não editar à mão.
   Ícones: Lucide (https://lucide.dev), licença ISC. */
.ico{display:inline-block;width:1em;height:1em;flex-shrink:0;vertical-align:-0.125em;background-color:currentColor;-webkit-mask:var(--ico) center/contain no-repeat;mask:var(--ico) center/contain no-repeat}
@media (forced-colors:active){.ico{background-color:CanvasText;forced-color-adjust:none}}
${rules.join("\n")}
`;
writeFileSync("css/icons.css", css);
console.log("css/icons.css:", rules.length, "ícones,", css.length, "bytes");
if (missing.length) { console.error("Ícones inexistentes no Lucide:", missing.join(", ")); process.exitCode = 1; }
