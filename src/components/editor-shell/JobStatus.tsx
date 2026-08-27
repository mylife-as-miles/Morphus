import type { WorkerJob } from "@blud/workers";
import { Loader2Icon, MoonStarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type JobStatusProps = {
  jobs: WorkerJob[];
};

export function JobStatus({ jobs }: JobStatusProps) {
  const activeJobs = jobs.filter((job) => job.status !== "completed");
  const hasActiveJobs = activeJobs.length > 0;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "editor-toolbar-footer pointer-events-auto inline-flex h-9 items-center gap-2 rounded-[14px] px-3 text-[10px] font-medium tracking-[0.12em] uppercase transition-[background-color,color,border-color,box-shadow] duration-200 [transition-timing-function:var(--ease-out-strong)]",
              hasActiveJobs ? "text-foreground/78" : "text-foreground/48"
            )}
            type="button"
          >
            {hasActiveJobs ? <Loader2Icon className="size-3 animate-spin" /> : <MoonStarIcon className="size-3" />}
            <span>{hasActiveJobs ? `${activeJobs.length} active` : "idle"}</span>
          </button>
        }
      />
      <PopoverContent
        align="end"
        className="editor-toolbar-shell w-80 rounded-[18px] p-3"
        side="top"
      >
        <div className="space-y-2">
          <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-[#f6d07d]/58 uppercase">Jobs</div>
          {hasActiveJobs ? (
            <div className="space-y-1">
              {activeJobs.map((job) => (
                <div
                  className="editor-toolbar-segment flex items-center justify-between rounded-xl px-3 py-2.5 text-[11px] text-foreground/60"
                  key={job.id}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground/78">{job.label}</div>
                    <div className="truncate text-[10px] text-foreground/34">
                      {job.task.worker} / {job.task.task}
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 capitalize text-foreground/38">{job.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="editor-toolbar-segment rounded-xl px-3 py-3 text-[11px] text-foreground/44">No active jobs.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
