import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(root, "src");
function filesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}
function visit(node, callback) {
  if (!node || typeof node !== "object") return;
  if (node.type) callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => visit(item, callback));
    else if (value && typeof value === "object") visit(value, callback);
  }
}
const parseJs = (text) => parse(text, { sourceType: "module", plugins: ["jsx"] });
const registry = parseJs(readFileSync(path.join(sourceRoot, "components/Icone.jsx"), "utf8"));
const names = new Set(["configuracoes"]);
visit(registry, (node) => {
  if (node.type !== "VariableDeclarator" || !["caminhos", "aliases"].includes(node.id.name)) return;
  for (const prop of node.init.properties) names.add(prop.key.name || prop.key.value);
});

// readdir, em vez de existsSync sozinho, detecta diferenças de caixa no Windows.
function exactPath(file) {
  const absolute = path.resolve(file);
  let parent = path.parse(absolute).root;
  for (const segment of absolute.slice(parent.length).split(path.sep)) {
    if (!existsSync(parent) || !readdirSync(parent).includes(segment)) return false;
    parent = path.join(parent, segment);
  }
  return true;
}
function selectedStrings(node) {
  if (!node) return [];
  if (node.type === "StringLiteral") return [node.value];
  if (node.type === "JSXExpressionContainer") return selectedStrings(node.expression);
  if (node.type === "ConditionalExpression") return [
    ...selectedStrings(node.consequent), ...selectedStrings(node.alternate),
  ];
  if (node.type === "LogicalExpression") return selectedStrings(node.right);
  return [];
}
const sourceFiles = filesIn(sourceRoot);

test("nomes estáticos de ícones pertencem ao registro central", () => {
  const failures = [];
  let checked = 0;
  const check = (value, file) => {
    checked++;
    if (!names.has(value)) failures.push(`${path.relative(root, file)}: ${value}`);
  };
  for (const file of sourceFiles.filter((file) => /\.[jt]sx?$/.test(file))) {
    visit(parseJs(readFileSync(file, "utf8")), (node) => {
      if (node.type === "JSXOpeningElement") {
        for (const attr of node.attributes) {
          const isName = attr.name?.name === "nome" && ["Icone", "IconeImagem", "IlustracaoModulo"].includes(node.name.name);
          if (isName || ["icone", "icon", "startIcon", "endIcon", "leftIcon", "rightIcon"].includes(attr.name?.name))
            selectedStrings(attr.value).forEach((value) => check(value, file));
        }
      }
      if (node.type === "ObjectProperty" && ["icon", "icone"].includes(node.key.name || node.key.value))
        selectedStrings(node.value).forEach((value) => check(value, file));
      // Tuplas [rota, rótulo, ícone] utilizadas na navegação compartilhada.
      if (node.type === "ArrayExpression" && node.elements.length === 3 && node.elements[0]?.type === "StringLiteral" && node.elements[0].value.startsWith("/"))
        selectedStrings(node.elements[2]).forEach((value) => check(value, file));
    });
  }
  assert.ok(checked > 0, "A auditoria precisa encontrar referências de ícones");
  assert.deepEqual(failures, [], "Há nomes não cadastrados; adicione-os ao registro antes do build");
});

test("imports e assets locais existem com a caixa exata para Linux/Vercel", () => {
  const failures = [];
  function check(reference, file, module = false) {
    if (/^(?:https?:|data:|#)/.test(reference)) return;
    const clean = reference.split(/[?#]/)[0];
    const target = clean.startsWith("/")
      ? path.join(root, clean.startsWith("/src/") ? "" : "public", clean.slice(1))
      : path.resolve(path.dirname(file), clean);
    const candidates = module
      ? [target, ...[".js", ".jsx", ".json", "/index.js", "/index.jsx"].map((ext) => target + ext)]
      : [target];
    if (!candidates.some(exactPath)) failures.push(`${path.relative(root, file)} -> ${reference}`);
  }
  for (const file of [...sourceFiles, path.join(root, "index.html"), ...filesIn(path.join(root, "public"))]) {
    if (!/\.(?:jsx?|css|html|svg)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    if (/\.jsx?$/.test(file)) visit(parseJs(text), (node) => {
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source?.value.startsWith("."))
        check(node.source.value, file, true);
      if (node.type === "JSXAttribute" && ["src", "href"].includes(node.name.name))
        selectedStrings(node.value).filter((value) => /\.(?:svg|png|jpe?g|webp|gif|ico)(?:[?#]|$)/.test(value)).forEach((value) => check(value, file));
    });
    if (/\.(?:css|html|svg)$/.test(file)) {
      for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)|(?:src|href)=["']([^"']+)["']/g))
        check(match[1] || match[2], file);
    }
  }
  assert.deepEqual(failures, [], "Caminho inexistente ou caixa incompatível com Linux");
});
