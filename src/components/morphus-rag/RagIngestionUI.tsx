import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Database, Upload, FileCode2, Code2, AlertTriangle, Loader2 } from "lucide-react";

export function RagIngestionUI() {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="text-xs border-dashed opacity-50 hover:opacity-100 transition-opacity"
      >
        <Database className="w-3 h-3 mr-2" />
        Game Code Memory (Admin)
      </Button>
    );
  }

  return (
    <div className="border border-white/10 rounded-xl bg-black/40 p-4 mt-4 text-sm relative">
       <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-50 hover:opacity-100"
        onClick={() => setIsOpen(false)}
      >
        Close
      </Button>

      <div className="flex items-center gap-2 mb-4 text-[#f6d07d]">
        <Database className="w-4 h-4" />
        <h3 className="font-semibold uppercase tracking-wider text-xs">Game Code Memory (Dev Tool)</h3>
      </div>

      <p className="text-white/50 text-xs mb-4 flex items-center gap-2">
        <AlertTriangle className="w-3 h-3 text-yellow-500" />
        Temporary dev tool. Server-side only. Do not expose API keys.
      </p>

      <RagIngestionForm />
    </div>
  );
}

function RagIngestionForm() {
  const [code, setCode] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState({
    projectId: "dream-studio-games",
    title: "",
    sourceGame: "",
    genre: "",
    framework: "",
    mechanics: "",
    path: ""
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  const handleMetadataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMetadata(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    if (!code && files.length === 0) {
      setStatus("error");
      setMessage("Please provide code via text area or file upload.");
      return;
    }

    setStatus("loading");
    setMessage("Processing and upserting chunks...");
    setResult(null);

    const formData = new FormData();
    formData.append("code", code);
    formData.append("metadata", JSON.stringify(metadata));
    files.forEach(f => formData.append("files", f));

    try {
      const response = await fetch("/api/rag/upsert-game-code", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upsert game code.");
      }

      setStatus("success");
      setMessage("Successfully upserted game code chunks.");
      setResult(data);
      setCode("");
      setFiles([]);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "An unknown error occurred.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          name="projectId"
          placeholder="Project ID / Namespace"
          value={metadata.projectId}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
        <input
          type="text"
          name="title"
          placeholder="Title (optional)"
          value={metadata.title}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
        <input
          type="text"
          name="sourceGame"
          placeholder="Source Game (optional)"
          value={metadata.sourceGame}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
        <input
          type="text"
          name="genre"
          placeholder="Genre (optional)"
          value={metadata.genre}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
        <input
          type="text"
          name="framework"
          placeholder="Framework (optional)"
          value={metadata.framework}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
        <input
          type="text"
          name="mechanics"
          placeholder="Mechanics (comma separated)"
          value={metadata.mechanics}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
        <input
          type="text"
          name="path"
          placeholder="File Path (optional)"
          value={metadata.path}
          onChange={handleMetadataChange}
          className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-xs text-white"
        />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-white/70 flex items-center gap-2">
          <Code2 className="w-3 h-3" /> Paste Code
        </label>
        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          className="bg-black/50 border border-white/10 rounded p-3 h-32 text-xs font-mono text-white/90 resize-y"
          placeholder="Paste HTML, CSS, JS, TS, or TSX here..."
        />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-white/70 flex items-center gap-2">
          <FileCode2 className="w-3 h-3" /> Or Upload Files
        </label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            accept=".html,.css,.js,.ts,.tsx,.json"
            onChange={handleFileChange}
            className="text-xs text-white/60 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/10">
        <div className="flex-1 mr-4 text-xs">
          {status === "loading" && <span className="text-blue-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> {message}</span>}
          {status === "success" && (
            <div className="text-emerald-400 flex flex-col gap-1">
              <span>{message}</span>
              {result && (
                <>
                  <span className="text-emerald-400/70 text-[10px]">
                    Project: {result.projectId} | Version: {result.versionId}
                  </span>
                  <span className="text-emerald-400/70 text-[10px]">
                    Files: {result.filesProcessed} | Chunks: {result.chunksCreated} | Upserted: {result.recordsUpserted}
                  </span>
                  <span className="text-emerald-400/70 text-[10px] break-all">
                    Snapshot: {result.snapshotPath}
                  </span>
                </>
              )}
            </div>
          )}
          {status === "error" && <span className="text-red-400">{message}</span>}
        </div>
        <Button
          onClick={handleSubmit}
          disabled={status === "loading"}
          className="bg-[#f6d07d] text-black hover:bg-[#f6d07d]/90 font-medium text-xs px-4"
        >
          {status === "loading" ? "Upserting..." : "Upsert to Pinecone"}
        </Button>
      </div>
    </div>
  );
}
