#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { absolutize, normalize, parsePath, serialize } from "path-data-parser";
import { buildLucideIconMap, type IconFingerprint } from "./lucide-icon-map.js";

type Options = {
  write: boolean;
  json: boolean;
  paths: string[];
};

type UnmappedEntry = {
  file: string;
  line: number;
  fingerprint: IconFingerprint;
};

type FileResult = {
  file: string;
  replacements: number;
  unmapped: UnmappedEntry[];
  changed: boolean;
  written: boolean;
  outputText: string;
};

type TextEdit = {
  start: number;
  end: number;
  text: string;
};

const TARGET_EXT = new Set([".tsx", ".jsx"]);
const SKIP_DIR = new Set([".git", ".next", ".turbo", "node_modules", "dist", "build", "out"]);
const SIGNATURE_TAGS = new Set([
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "g",
]);
const SIGNATURE_REQUIRED: Record<string, string[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  g: [],
};
const SIGNATURE_ATTRS = new Set([
  "d",
  "points",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "rx",
  "ry",
  "width",
  "height",
  "fillRule",
  "clipRule",
]);
const MANUAL_ICON_MAP: Record<IconFingerprint, string> = {
  "0 0 24 24::path(d=M9 5l7 7-7 7)": "ChevronRight",
  "0 0 24 24::path(d=M6 18L18 6M6 6l12 12)": "X",
  "0 0 24 24::path(d=M19 9l-7 7-7-7)": "ChevronDown",
  "0 0 24 24::path(d=M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z)": "FileText",
  "0 0 24 24::path(d=M12 4v16m8-8H4)": "Plus",
  "0 0 24 24::path(d=M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16)": "Trash2",
  "0 0 24 24::path(d=M5 13l4 4L19 7)": "Check",
  "0 0 24 24::path(d=M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15)": "RefreshCw",
  "0 0 24 24::circle(cx=12,cy=12,r=10)|path(d=M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z)": "PieChart",
  "0 0 24 24::path(d=M13 10V3L4 14h7v7l9-11h-7z)": "Zap",
  "0 0 24 24::path(d=M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z)": "Folder",
  "0 0 24 24::path(d=M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z)": "SquarePen",
  "0 0 24 24::path(d=M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z)": "Columns2",
  "0 0 24 24::path(d=M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z)": "TriangleAlert",
  "0 0 24 24::path(d=M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z)": "Clock",
  "0 0 24 24::path(d=M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z)": "Search",
  "0 0 24 24::path(d=M8.25 4.5l7.5 7.5-7.5 7.5)": "ChevronRight",
  "0 0 24 24::path(d=M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4)": "Download",
  "0 0 24 24::path(d=M10 19l-7-7m0 0l7-7m-7 7h18)": "ArrowLeft",
  "0 0 24 24::path(d=M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z)": "CircleCheck",
  "0 0 24 24::path(d=M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z)": "LayoutGrid",
  "0 0 24 24::path(d=M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25)": "SquareArrowOutUpRight",
  "0 0 24 24::path(d=M4.5 12.75l6 6 9-13.5)": "Check",
  "0 0 24 24::path(d=M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z)": "Settings",
  "0 0 24 24::path(d=M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 1115 0)": "CircleUser",
  "0 0 24 24::path(d=M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5)": "CodeXml",
  "0 0 24 24::path(d=M 0 0 L 7 7 L 0 14)": "ChevronRight",
  "0 0 24 24::path(d=M 0 0 L 12 -12 M 0 0 L 12 12)": "X",
  "0 0 24 24::path(d=M 0 0 L -7 7 L -14 0)": "ChevronDown",
  "0 0 24 24::path(d=M 0 0 L 0 16 M 0 0 L -16 0)": "Plus",
  "0 0 24 24::path(d=M 0 0 L 4 4 L 14 -6)": "Check",
  "0 0 24 24::path(d=M 0 0 L 0 -7 L -9 4 L -2 4 L -2 11 L 7 0 L 0 0 Z)": "Zap",
  "0 0 24 24::path(d=M 0 0 L 0 15 M 0 0 L 0 15 M 0 0 L 15.75 0 C 16.371 0, 16.875 -0.5040000000000013, 16.875 -1.125 L 16.875 -13.875 C 16.875 -14.496, 16.371 -15, 15.75 -15 L 0 -15 C -0.621 -15, -1.125 -14.496, -1.125 -13.875 L -1.125 -1.125 C -1.125 -0.5040000000000013, -0.621 0, 0 0 Z)": "Columns2",
  "0 0 24 24::path(d=M 0 0 L 0 2 M 0 0 L 0.009999999999999787 0 M 0 0 L 13.856000000000002 0 C 15.396 0, 16.358 -1.6670000000000016, 15.588000000000001 -3 L 8.66 -15 C 7.89 -16.333, 5.966 -16.333, 5.195999999999999 -15 L -1.7320000000000002 -3 C -2.5020000000000002 -1.6670000000000016, -1.54 0, 0 0 Z)": "TriangleAlert",
  "0 0 24 24::path(d=M 0 0 L 7.5 7.5 L 0 15)": "ChevronRight",
  "0 0 24 24::path(d=M 0 0 L -7 -7 M 0 0 L 7 -7 M 0 0 L 18 0)": "ArrowLeft",
  "0 0 24 24::path(d=M 0 0 L -7.5 -7.5 L 0 -15)": "ChevronLeft",
  "0 0 24 24::path(d=M 0 0 L 6 6 L 15 -7.5)": "Check",
  "0 0 24 24::path(d=M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z)|path(d=M15 12a3 3 0 11-6 0 3 3 0 016 0z)": "Settings",
  "0 0 24 24::path(d=M 0 0 L 14 0 M 0 0 L -4 -4 M 0 0 L -4 4)": "ArrowRight",
};

function parseArgs(argv: string[]): Options {
  const result: Options = {
    write: false,
    json: false,
    paths: [],
  };

  for (const item of argv) {
    if (item === "--write") {
      result.write = true;
      continue;
    }
    if (item === "--json") {
      result.json = true;
      continue;
    }
    if (item === "--help" || item === "-h") {
      console.log(`Usage:
node --import tsx tools/codemods/replace-inline-svg-with-lucide.ts [--write] [--json] [paths...]

Options:
  --write  write files; default is dry-run.
  --json   output json summary.
  --help   show help.

Default path is ./src.`);
      process.exit(0);
    }
    if (item.startsWith("-")) {
      throw new Error(`Unknown option: ${item}`);
    }
    result.paths.push(item);
  }

  if (result.paths.length === 0) {
    result.paths = ["src"];
  }
  return result;
}

function normalizeString(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toCanonicalPath(value: string): string {
  try {
    const absolute = absolutize(parsePath(value));
    const normalized = normalize(absolute);
    let originX = 0;
    let originY = 0;

    const shifted = normalized.map((segment) => {
      if (segment.key === "M") {
        const [x, y] = segment.data;
        originX = x;
        originY = y;
        return { ...segment, data: [0, 0] };
      }
      if (segment.key === "Z") return segment;
      if (segment.key === "L" || segment.key === "C") {
        return {
          ...segment,
          data: segment.data.map((point, index) =>
            index % 2 === 0 ? point - originX : point - originY,
          ),
        };
      }
      return segment;
    });

    return serialize(shifted);
  } catch {
    return normalizeString(value);
  }
}

function getTagName(node: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  return undefined;
}

function getAttrValue(attr: ts.JsxAttribute): string | undefined {
  if (!attr.initializer) return "true";
  if (ts.isStringLiteral(attr.initializer) || ts.isNoSubstitutionTemplateLiteral(attr.initializer)) {
    return normalizeString(attr.initializer.text);
  }
  if (!ts.isJsxExpression(attr.initializer)) {
    return undefined;
  }
  const expr = attr.initializer.expression;
  if (!expr) return "true";
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return normalizeString(expr.text);
  }
  if (ts.isNumericLiteral(expr)) {
    return expr.text;
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
    return expr.kind === ts.SyntaxKind.TrueKeyword ? "true" : "false";
  }
  return undefined;
}

function getRequiredFromOpening(openingElement: ts.JsxOpeningLikeElement): string {
  for (const prop of openingElement.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    if (prop.name.getText() === "viewBox") {
      return getAttrValue(prop) ?? "0 0 24 24";
    }
  }
  return "0 0 24 24";
}

function signatureForNode(node: ts.JsxElement | ts.JsxSelfClosingElement, depth = 0): string | undefined {
  const tagName = getTagName(ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName);
  if (!tagName || !SIGNATURE_TAGS.has(tagName)) return undefined;

  if (tagName === "g") {
    if (depth > 3) return undefined;
    const children = ts.isJsxElement(node) ? node.children : [];
    const nested = children
      .map((child) => {
        if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) return undefined;
        return signatureForNode(child, depth + 1);
      })
      .filter((item): item is string => Boolean(item));
    if (nested.length === 0) return undefined;
    return `g(${nested.join("|")})`;
  }

  const attributesNode = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  const attributes = new Map<string, string>();
  for (const property of attributesNode.properties) {
    if (!ts.isJsxAttribute(property)) return undefined;
    const name = property.name.getText();
    if (!SIGNATURE_ATTRS.has(name)) continue;
    const value = getAttrValue(property);
    if (!value) return undefined;
    if (name === "d") {
      attributes.set(name, toCanonicalPath(value));
    } else {
      attributes.set(name, value);
    }
  }

  const required = SIGNATURE_REQUIRED[tagName];
  for (const key of required) {
    if (!attributes.has(key)) {
      return undefined;
    }
  }

  const parts = [...attributes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${tagName}(${parts.join(",")})`;
}

function signatureFromSvg(node: ts.JsxElement): string | undefined {
  if (getTagName(node.openingElement.tagName) !== "svg") return undefined;
  const viewBox = getRequiredFromOpening(node.openingElement);

  const children = node.children
    .map((child) => {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        return signatureForNode(child);
      }
      return undefined;
    })
    .filter((item): item is string => Boolean(item));

  if (children.length === 0) return undefined;
  return `${viewBox}::${children.join("|")}`;
}

function resolveLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const addBindingName = (binding: ts.BindingName | undefined) => {
    if (!binding) return;
    if (ts.isIdentifier(binding)) {
      names.add(binding.text);
      return;
    }
    for (const element of binding.elements) {
      addBindingName(element.name);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      addBindingName(node.name);
    }
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      if (node.name && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
    }
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      for (const parameter of node.parameters) {
        addBindingName(parameter.name);
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.name) names.add(clause.name.text);
      if (clause?.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const item of clause.namedBindings.elements) {
            names.add(item.name.text);
          }
        } else {
          names.add(clause.namedBindings.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return names;
}

type LucideImportInfo = {
  declaration: ts.ImportDeclaration;
  namedImports: ts.NamedImports | null;
  existing: Map<string, string>;
  typeOnly: boolean;
  start: number;
  end: number;
};

function collectLucideImport(sourceFile: ts.SourceFile): LucideImportInfo | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "lucide-react") continue;

    const existing = new Map<string, string>();
    const namedBindings = statement.importClause?.namedBindings;
    let namedImports: ts.NamedImports | null = null;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      namedImports = namedBindings;
      for (const specifier of namedBindings.elements) {
        const imported = specifier.propertyName?.text ?? specifier.name.text;
        existing.set(imported, specifier.name.text);
      }
    }

    return {
      declaration: statement,
      namedImports,
      existing,
      typeOnly: statement.importClause?.isTypeOnly ?? false,
      start: statement.getStart(),
      end: statement.getEnd(),
    };
  }
  return null;
}

function findImportInsertOffset(sourceFile: ts.SourceFile): number {
  let offset = 0;

  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text.length > 0
    ) {
      offset = statement.getEnd();
      continue;
    }
    if (ts.isImportDeclaration(statement)) {
      offset = statement.getEnd();
      continue;
    }
    break;
  }

  return offset;
}

function cloneAndFilterAttribute(attribute: ts.JsxAttributeLike): ts.JsxAttributeLike | undefined {
  if (ts.isJsxSpreadAttribute(attribute)) return attribute;
  const name = attribute.name.getText();
  if (name === "xmlns" || name === "xmlnsXlink") return undefined;
  return attribute;
}

function toIconSelfClosingText(
  localName: string,
  node: ts.JsxElement,
  sourceFile: ts.SourceFile,
): string {
  const attrs = node.openingElement.attributes.properties
    .map(cloneAndFilterAttribute)
    .filter((attribute): attribute is ts.JsxAttributeLike => attribute !== undefined);
  const replacement = ts.factory.createJsxSelfClosingElement(
    ts.factory.createIdentifier(localName),
    undefined,
    ts.factory.createJsxAttributes(attrs),
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  return printer.printNode(ts.EmitHint.Unspecified, replacement, sourceFile);
}

function buildImportEdit(
  sourceText: string,
  sourceFile: ts.SourceFile,
  importsNeeded: Map<string, string>,
  lucideImport: LucideImportInfo | null,
  usedNames: Set<string>,
): TextEdit | null {
  if (importsNeeded.size === 0) return null;

  const importEntries = [...importsNeeded.entries()];
  const createSpec = (exported: string, local: string): string =>
    exported === local ? exported : `${exported} as ${local}`;

  if (lucideImport && lucideImport.namedImports && !lucideImport.typeOnly) {
    const existing = new Set<string>(lucideImport.existing.keys());
    const toAdd: string[] = [];

    for (const [exported, local] of importEntries) {
      if (existing.has(exported)) continue;
      toAdd.push(createSpec(exported, local));
      existing.add(exported);
      usedNames.add(local);
    }

    if (toAdd.length === 0) return null;

    const oldText = sourceText.slice(lucideImport.start, lucideImport.end);
    const openBrace = oldText.indexOf("{");
    const closeBrace = oldText.indexOf("}");
    if (openBrace >= 0 && closeBrace > openBrace) {
      const inside = oldText.slice(openBrace + 1, closeBrace).trim();
      const nextInside = inside.length > 0 ? `${inside}, ${toAdd.join(", ")}` : toAdd.join(", ");
      const rebuilt = `${oldText.slice(0, openBrace + 1)} ${nextInside} ${oldText.slice(closeBrace)}`;
      return { start: lucideImport.start, end: lucideImport.end, text: rebuilt };
    }

    const rebuilt = `import { ${[...existing, ...toAdd].join(", ")} } from "lucide-react";`;
    return {
      start: lucideImport.start,
      end: lucideImport.end,
      text: rebuilt,
    };
  }

  const importText = `${importEntries
    .map(([exported, local]) => {
      return createSpec(exported, local);
    })
    .sort()
    .join(", ")}`;
  const offset = findImportInsertOffset(sourceFile);
  const needsLeadingNewline = offset > 0 && !sourceText.slice(0, offset).endsWith("\n");

  return {
    start: offset,
    end: offset,
    text: `${needsLeadingNewline ? "\n" : ""}import { ${importText} } from "lucide-react";\n`,
  };
}

function pickName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let i = 1;
  while (used.has(`${base}Icon${i}`)) i += 1;
  return `${base}Icon${i}`;
}

function applyTextEdits(sourceText: string, edits: TextEdit[]): string {
  if (edits.length === 0) return sourceText;
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  return ordered.reduce((result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`, sourceText);
}

function transformSourceFile(
  sourceText: string,
  sourceFile: ts.SourceFile,
  iconMap: Record<IconFingerprint, string>,
): { file: FileResult; text: string } {
  const usedNames = collectIdentifiers(sourceFile);
  const localByImported = new Map<string, string>();
  const existingImport = collectLucideImport(sourceFile);
  if (existingImport) {
    for (const [k, v] of existingImport.existing.entries()) {
      localByImported.set(k, v);
    }
  }

  const neededImports = new Map<string, string>();
  const edits: TextEdit[] = [];
  const unmapped: UnmappedEntry[] = [];
  let replacements = 0;

  const resolveImportName = (lucideName: string): string => {
    const existed = localByImported.get(lucideName);
    if (existed) return existed;
    const existingNeeded = neededImports.get(lucideName);
    if (existingNeeded) return existingNeeded;

    const local = pickName(lucideName, usedNames);
    usedNames.add(local);
    localByImported.set(lucideName, local);
    neededImports.set(lucideName, local);
    return local;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const signature = signatureFromSvg(node);
      if (signature) {
        const lucideName = iconMap[signature];
        if (lucideName) {
          const localName = resolveImportName(lucideName);
          const replacementText = toIconSelfClosingText(localName, node, sourceFile);
          edits.push({
            start: node.getStart(sourceFile),
            end: node.end,
            text: replacementText,
          });
          replacements += 1;
          return;
        }
        unmapped.push({
          file: sourceFile.fileName,
          line: resolveLine(node, sourceFile),
          fingerprint: signature,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const importEdit = buildImportEdit(sourceText, sourceFile, neededImports, existingImport, usedNames);
  if (importEdit) edits.push(importEdit);

  const outputText = applyTextEdits(sourceText, edits);
  const changed = outputText !== sourceText;

  return {
    file: {
      file: sourceFile.fileName,
      replacements,
      unmapped,
      changed,
      written: false,
      outputText,
    },
    text: outputText,
  };
}

function walkFiles(inputs: string[]): string[] {
  const files = new Set<string>();
  const walk = (entry: string): void => {
    const stat = fs.statSync(entry);
    if (stat.isFile()) {
      if (TARGET_EXT.has(path.extname(entry))) files.add(entry);
      return;
    }
    if (!stat.isDirectory()) return;
    const base = path.basename(entry);
    if (SKIP_DIR.has(base)) return;
    for (const child of fs.readdirSync(entry)) {
      walk(path.join(entry, child));
    }
  };

  for (const input of inputs) {
    walk(path.resolve(process.cwd(), input));
  }
  return [...files];
}

function main(): number {
  const opts = parseArgs(process.argv.slice(2));
  const iconMap = { ...buildLucideIconMap(), ...MANUAL_ICON_MAP };
  const files = walkFiles(opts.paths);

  const results: FileResult[] = [];
  for (const file of files) {
    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const { file: result, text } = transformSourceFile(sourceText, sourceFile, iconMap);

    if (result.changed && opts.write) {
      fs.writeFileSync(file, text, "utf8");
      result.written = true;
    }
    result.outputText = text;
    results.push(result);
  }

  const total = results.reduce((acc, entry) => acc + entry.replacements, 0);
  const changed = results.filter((entry) => entry.changed).length;
  const unmapped = results.flatMap((entry) => entry.unmapped);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          scanned: files.length,
          changedFiles: changed,
          replacements: total,
          files,
          results,
          unmapped,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`[lucide-codemod] scanned=${files.length} changed=${changed} replaced=${total}`);
  if (opts.write) {
    for (const entry of results.filter((entry) => entry.written)) {
      console.log(`updated ${entry.file}`);
    }
  }
  if (unmapped.length > 0) {
    console.log(`[lucide-codemod] unmapped=${unmapped.length}`);
    for (const item of unmapped.slice(0, 100)) {
      console.log(`${item.file}:${item.line} ${item.fingerprint}`);
    }
    if (unmapped.length > 100) {
      console.log(`... and ${unmapped.length - 100} more`);
    }
  }

  return 0;
}

process.exit(main());
