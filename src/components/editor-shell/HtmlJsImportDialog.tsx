import type { HtmlJsImportResult, ImportDiagnostic, ImportStatus } from "@blud/scene-importer";
import { AlertTriangle, CheckCircle2, Code2, FileWarning, Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type HtmlJsImportDialogProps = {
  entrypointSelection: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onEntrypointChange: (value: string) => void;
  onReloadEntrypoint: () => void;
  open: boolean;
  result?: HtmlJsImportResult | null;
};

const STATUS_COPY: Record<ImportStatus, string> = {
  "entrypoint-required": "Choose which entry file should be analyzed before Dream Studio imports the scene.",
  imported: "Supported scene content was converted into native Dream Studio nodes.",
  "partially-imported": "Dream Studio converted supported content and generated a custom bridge script for the rest.",
  unsupported: "The importer could not extract enough native scene content from this payload."
};

export function HtmlJsImportDialog({
  entrypointSelection,
  loading = false,
  onClose,
  onConfirm,
  onEntrypointChange,
  onReloadEntrypoint,
  open,
  result
}: HtmlJsImportDialogProps) {
  const report = result?.report;
  const status = report?.status ?? "entrypoint-required";
  const diagnostics = report?.diagnostics ?? [];
  const entrypointOptions = report?.entrypointOptions ?? [];
  const hasSnapshot = Boolean(result?.snapshot);

  return (
    <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="border-white/10 bg-[#0a1510] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import HTML/JS Scene</DialogTitle>
          <DialogDescription>
            {STATUS_COPY[status]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.25fr,0.95fr]">
            <section className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium tracking-[0.18em] text-foreground/48 uppercase">Entrypoint</div>
                  <div className="mt-1 text-sm text-foreground/82">{report?.entrypoint ?? (entrypointSelection || "Select an entrypoint")}</div>
                </div>
                <StatusPill status={status} />
              </div>

              {entrypointOptions.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/48 uppercase">
                    Choose Entry File
                  </label>
                  <div className="flex gap-2">
                    <NativeSelect
                      className="flex-1"
                      onChange={(event) => onEntrypointChange(event.target.value)}
                      value={entrypointSelection}
                    >
                      <NativeSelectOption value="">Select an entrypoint</NativeSelectOption>
                      {entrypointOptions.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                          {option}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Button disabled={loading || !entrypointSelection} onClick={onReloadEntrypoint} size="sm" variant="ghost">
                      {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Analyze"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <SummaryCard icon={<Sparkles className="size-3.5" />} label="Detected Libraries" value={report?.detectedLibraries.join(", ") || "None"} />
                <SummaryCard icon={<Code2 className="size-3.5" />} label="Generated Scripts" value={String(report?.summary.customScripts ?? 0)} />
                <SummaryCard icon={<CheckCircle2 className="size-3.5" />} label="Native Nodes" value={String(report?.summary.nodes ?? 0)} />
                <SummaryCard icon={<AlertTriangle className="size-3.5" />} label="Warnings" value={String(report?.summary.unsupportedFeatures ?? 0)} />
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Metric label="Lights" value={report?.summary.lights ?? 0} />
                <Metric label="Materials" value={report?.summary.materials ?? 0} />
                <Metric label="Assets" value={report?.summary.assets ?? 0} />
                <Metric label="Entities" value={report?.summary.entities ?? 0} />
                <Metric label="Cameras" value={report?.summary.cameras ?? 0} />
                <Metric label="Scripts" value={report?.summary.customScripts ?? 0} />
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[11px] font-medium tracking-[0.18em] text-foreground/48 uppercase">Diagnostics</div>
              <div className="max-h-80 space-y-2 overflow-auto pr-1">
                {diagnostics.length > 0 ? diagnostics.map((diagnostic, index) => (
                  <DiagnosticCard diagnostic={diagnostic} key={`${diagnostic.code}:${index}`} />
                )) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-foreground/52">
                    No import diagnostics were reported.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <DialogFooter className="border-white/8 bg-white/[0.03]">
          <Button onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={loading || !hasSnapshot}
            onClick={onConfirm}
            size="sm"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Replace Scene With Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: ImportStatus }) {
  const tone =
    status === "imported"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : status === "partially-imported"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : status === "unsupported"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <div className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-[0.16em] uppercase", tone)}>
      {status.replace(/-/g, " ")}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/18 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] text-foreground/52">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground/84">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/16 px-3 py-2">
      <div className="text-[10px] font-medium tracking-[0.16em] text-foreground/44 uppercase">{label}</div>
      <div className="mt-1 text-sm text-foreground/82">{value}</div>
    </div>
  );
}

function DiagnosticCard({ diagnostic }: { diagnostic: ImportDiagnostic }) {
  const tone =
    diagnostic.severity === "error"
      ? "border-rose-400/20 bg-rose-400/8"
      : diagnostic.severity === "warning"
        ? "border-amber-400/20 bg-amber-400/8"
        : "border-cyan-400/20 bg-cyan-400/8";

  return (
    <div className={cn("rounded-xl border px-3 py-2.5", tone)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-medium tracking-[0.16em] text-foreground/48 uppercase">
          <FileWarning className="size-3.5" />
          {diagnostic.severity}
        </div>
        {diagnostic.file ? <div className="max-w-[12rem] truncate text-[10px] font-mono text-foreground/44">{diagnostic.file}</div> : null}
      </div>
      <div className="mt-1 text-xs leading-5 text-foreground/78">{diagnostic.message}</div>
    </div>
  );
}
