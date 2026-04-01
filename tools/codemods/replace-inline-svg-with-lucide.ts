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
  "0 0 24 24::path(d=M6.75 7.5h10.5M6.75 12h10.5M6.75 16.5h6.75M4.5 4.5h15A2.25 2.25 0 0121.75 6.75v10.5A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V6.75A2.25 2.25 0 014.5 4.5z)": "Server",
  "0 0 24 24::path(d=M6.75 3.75v3m10.5-3v3M4.5 8.25h15m-14.25 9h5.25m-5.25 0V6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25z)": "Calendar",
  "0 0 24 24::path(d=M6 5.25h3.75V9H6V5.25zm8.25 0H18V9h-3.75V5.25zM6 15h3.75v3.75H6V15zm8.25 0H18v3.75h-3.75V15zM9.75 7.125h4.5m-2.25 1.5v5.25m2.25 0h-4.5)": "Workflow",
  "0 0 24 24::path(d=M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z)": "MessageSquareMore",
  "0 0 24 24::path(d=M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4)": "ClipboardCheck",
  "0 0 24 24::path(d=M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z)": "NotebookText",
  "0 0 24 24::path(d=M 0 0 L 5.25 5.25 L 0 10.5 M 0 0 L -5.25 -5.25 L 0 -10.5 M 0 0 L -4.5 16.5)": "CodeXml",
  "0 0 24 24::path(d=M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4)": "CodeXml",
  "0 0 24 24::path(d=M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3)": "ArrowRight",
  "0 0 24 24::path(d=M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z)": "Sparkles",
  "0 0 24 24::path(d=M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776)": "Folder",
  "0 0 16 16::path(d=M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z,fillRule=evenodd)": "GitBranch",
  "0 0 24 24::path(d=M 0 0 L 3.75 0 L 3.75 3.75 L 0 3.75 L 0 0 Z M 0 0 L 3.75 0 L 3.75 3.75 L 0 3.75 L 0 0 Z M 0 0 L 3.75 0 L 3.75 3.75 L 0 3.75 L 0 0 Z M 0 0 L 3.75 0 L 3.75 3.75 L 0 3.75 L 0 0 Z M 0 0 L 4.5 0 M 0 0 L 0 5.25 M 0 0 L -4.5 0)": "Workflow",
  "0 0 24 24::path(d=M 0 0 L 0 3.75 M 0 0 C -0.8660000000000001 1.5, 0.21700000000000008 3.3739999999999988, 1.9480000000000004 3.3739999999999988 L 16.658 3.3739999999999988 C 18.388 3.3739999999999988, 19.471 1.5, 18.606 0 L 11.252 -12.748000000000001 C 10.386000000000001 -14.248000000000001, 8.22 -14.248000000000001, 7.354000000000001 -12.748000000000001 L 8.881784197001252e-16 0 Z M 0 0 L 0.006999999999999673 0 L 0.006999999999999673 0.007999999999999119 L 0 0.007999999999999119 L 0 0 Z)": "TriangleAlert",
  "0 0 24 24::path(d=M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z)": "ClipboardList",
  "0 0 24 24::path(d=M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3)": "Download",
  "0 0 24 24::path(d=M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z)": "CircleUser",
  "0 0 24 24::path(d=M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z)": "ChartColumn",
  "0 0 24 24::path(d=M 0 0 L 7 7 L 0 14 M 0 0 L 7 7 L 0 14)": "ChevronsRight",
  "0 0 24 24::path(d=M 0 0 L -7 -7 L 0 -14 M 0 0 L -7 -7 L 0 -14)": "ChevronsLeft",
  "0 0 24 24::path(d=M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z)": "Play",
  "0 0 24 24::circle(cx=12,cy=12,r=10)|path(d=M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20)": "Globe",
  "0 0 24 24::path(d=M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14)": "SquareArrowOutUpRight",
  "0 0 24 24::path(d=M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z)": "Copy",
  "0 0 24 24::line(x1=18,x2=6,y1=6,y2=18)|line(x1=6,x2=18,y1=6,y2=18)": "X",
  "0 0 24 24::path(d=M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z)": "Terminal",
  "0 0 24 24::path(d=M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z)": "Monitor",
  "0 0 24 24::path(d=M 0 0 L 4 -16 M 0 0 L 4 4 L 0 8 M 0 0 L -4 -4 L 0 -8)": "CodeXml",
  "0 0 24 24::path(d=M 0 0 L 8.954 -8.955 C 9.394 -9.394, 10.106 -9.394, 10.545 -8.955 L 19.5 0 M 0 0 L 0 10.125 C 0 10.745999999999999, 0.5039999999999996 11.25, 1.125 11.25 L 5.25 11.25 L 5.25 6.375 C 5.25 5.754, 5.754 5.25, 6.375 5.25 L 8.625 5.25 C 9.246 5.25, 9.75 5.754, 9.75 6.375 L 9.75 11.25 L 13.875 11.25 C 14.495999999999999 11.25, 15 10.745999999999999, 15 10.125 L 15 0 M 0 0 L 8.25 0)": "House",
  "0 0 24 24::circle(cx=7.5,cy=8,r=2.25)|circle(cx=16.5,cy=8,r=2.25)|circle(cx=12,cy=16,r=2.25)|path(d=M 0 0 L 5 0 M 0 0 L 2 3.549999999999999 M 0 0 L -2 3.5500000000000007)": "Share2",
  "0 0 16 16::path(d=M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8V1.5z,fillRule=evenodd)": "Book",
  "0 0 24 24::path(d=M3 7.5A1.5 1.5 0 014.5 6h4.379a1.5 1.5 0 011.06.44l1.12 1.12a1.5 1.5 0 001.06.44H19.5A1.5 1.5 0 0121 9.5v8A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5v-10z)": "Folder",
  "0 0 24 24::path(d=M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z)": "CircleCheck",
  "0 0 24 24::path(d=M 0 0 L 7 -7 M 0 0 L 7 7 M 0 0 L 0 18)": "ArrowUp",
  "0 0 24 24::path(d=M 0 0 L -7 7 M 0 0 L -7 -7 M 0 0 L 0 -18)": "ArrowDown",
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
