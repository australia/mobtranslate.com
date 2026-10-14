import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const configFile = path.join(root, 'packages/ui/tsconfig.json');
const config = ts.readConfigFile(configFile, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile));
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const source = program.getSourceFile(path.join(root, 'packages/ui/src/index.ts'));
const module = checker.getSymbolAtLocation(source);
if (!module) throw new Error('Missing UI entrypoint symbol.');
const relative = file => path.relative(root, file).replaceAll(path.sep, '/');
const exports = checker.getExportsOfModule(module).map(publicSymbol => {
  const symbol = publicSymbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(publicSymbol) : publicSymbol;
  const declarations = symbol.getDeclarations() ?? [];
  const sites = declarations.map(declaration => ({ file: relative(declaration.getSourceFile().fileName), line: declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line + 1 }));
  const runtime = Boolean(symbol.flags & ts.SymbolFlags.Value);
  const type = runtime && declarations.length ? checker.getTypeOfSymbolAtLocation(symbol, declarations[0]) : null;
  const signatures = type?.getCallSignatures() ?? [];
  const component = runtime && /^[A-Z]/.test(publicSymbol.name) && signatures.length > 0;
  const first = component ? signatures[0]?.getParameters()[0] : null;
  const propsType = first ? checker.getTypeOfSymbolAtLocation(first, first.valueDeclaration ?? declarations[0]) : null;
  const props = propsType?.getProperties().map(property => {
    const declarations = property.getDeclarations() ?? [];
    const site = declarations[0];
    return { name: property.name, optional: Boolean(property.flags & ts.SymbolFlags.Optional),
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(property, site ?? source), undefined, ts.TypeFormatFlags.NoTruncation),
      declarations: declarations.map(declaration => ({ file: relative(declaration.getSourceFile().fileName), line: declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line + 1 })),
      locallyDeclared: declarations.some(declaration => relative(declaration.getSourceFile().fileName).startsWith('packages/ui/src/')) };
  }) ?? [];
  return { name: publicSymbol.name, runtime, kind: component ? 'callable component' : runtime ? 'runtime value/function' : 'type', sites,
    signatures: signatures.map(signature => checker.signatureToString(signature, undefined, ts.TypeFormatFlags.NoTruncation)), props };
}).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const report = {
  source: 'packages/ui/src/index.ts', created: new Date().toISOString(),
  scope: 'Compiler-resolved public symbols, signatures and component props. Does not prove rendered documentation, native semantics or runtime correctness.',
  exports,
};
const destination = process.env.STYLEGUIDE_API_REPORT;
if (!destination) throw new Error('Set STYLEGUIDE_API_REPORT to a mounted output path.');
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${exports.length} public exports; ${exports.filter(entry => entry.kind === 'callable component').length} callable components; ${exports.filter(entry => entry.runtime).length} runtime exports. Compiler inventory written.`);
