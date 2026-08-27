import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { defaultTools, type ToolId } from "@blud/tool-system";
import { toolIconFor } from "@/components/editor-shell/icons";
import { cn } from "@/lib/utils";

type ToolIconSidebarProps = {
  activeToolId: ToolId;
  onSetToolId: (toolId: ToolId) => void;
};

export function ToolIconSidebar({ activeToolId, onSetToolId }: ToolIconSidebarProps) {
  const [open, setOpen] = useState(true);
  const activeTool = defaultTools.find((tool) => tool.id === activeToolId);
  const ActiveToolIcon = toolIconFor(activeToolId);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setOpen(false);
    }
  }, []);

  return (
    <div className="pointer-events-none absolute left-4 top-[6.5rem] z-30 flex flex-col items-start gap-2">
      <div className="editor-toolbar-rail pointer-events-auto flex flex-col gap-2 rounded-[18px] p-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="editor-toolbar-label">Tools</span>
          <button
            className="editor-toolbar-button flex size-7 items-center justify-center rounded-[10px] transition-colors duration-150 hover:translate-y-0"
            onClick={() => setOpen((v) => !v)}
            title={open ? "Collapse tools" : "Expand tools"}
            type="button"
          >
            {open ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>

        {open ? (
          <div className="flex flex-col items-center gap-1">
            {defaultTools.map((tool) => {
              const Icon = toolIconFor(tool.id);
              const active = tool.id === activeToolId;
              return (
                <button
                  key={tool.id}
                  className={cn(
                    "editor-toolbar-button pointer-events-auto flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150 hover:translate-y-0",
                    active && "editor-toolbar-button-active text-[#fff0cb]"
                  )}
                  onClick={() => onSetToolId(tool.id)}
                  title={tool.label}
                  type="button"
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        ) : (
          <button
            className="editor-toolbar-button pointer-events-auto flex size-9 items-center justify-center rounded-[10px] hover:translate-y-0"
            onClick={() => setOpen(true)}
            title={activeTool?.label ?? "Open tools"}
            type="button"
          >
            <ActiveToolIcon className="size-4" />
          </button>
        )}
      </div>

      {open && activeTool ? (
        <div className="editor-toolbar-segment pointer-events-auto rounded-[14px] px-3 py-2 text-[10px] font-semibold tracking-[0.18em] text-[#f6d07d]/76 uppercase">
          {activeTool.label}
        </div>
      ) : null}
    </div>
  );
}
