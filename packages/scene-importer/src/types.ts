import type { SceneDocumentSnapshot } from "@blud/editor-core";

export type ImportDiagnosticSeverity = "error" | "info" | "warning";
export type ImportStatus = "entrypoint-required" | "imported" | "partially-imported" | "unsupported";

export type HtmlJsImportFile = {
  bytes: Uint8Array;
  mimeType?: string;
  path: string;
};

export type HtmlJsImportInput = {
  entrypoint?: string;
  files: HtmlJsImportFile[];
  projectName?: string;
};

export type ImportDiagnostic = {
  code: string;
  file?: string;
  message: string;
  severity: ImportDiagnosticSeverity;
};

export type ImportReport = {
  detectedLibraries: string[];
  diagnostics: ImportDiagnostic[];
  entrypoint?: string;
  entrypointOptions?: string[];
  projectName: string;
  status: ImportStatus;
  summary: {
    assets: number;
    cameras: number;
    customScripts: number;
    entities: number;
    lights: number;
    materials: number;
    nodes: number;
    unsupportedFeatures: number;
  };
};

export type HtmlJsImportResult = {
  report: ImportReport;
  snapshot?: SceneDocumentSnapshot;
};
