import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
};

/**
 * Browser-style confirm replacement — dark shell, lavender primary / purple secondary.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-w-[min(22rem,calc(100%-2rem))] gap-0 rounded-[1.35rem] border border-white/[0.09] bg-[#141118] p-5 text-white shadow-[0_24px_64px_rgba(0,0,0,0.55)] ring-0 sm:max-w-md",
          "data-closed:zoom-out-95 data-open:zoom-in-95"
        )}
      >
        <DialogTitle className="text-[15px] font-semibold leading-snug tracking-tight text-white pr-2">
          {title}
        </DialogTitle>
        <DialogDescription className="mt-3 text-[13px] leading-relaxed text-white/88 [&]:text-white/88">
          {message}
        </DialogDescription>
        <div className="mt-6 flex flex-row flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 rounded-xl border border-violet-950/40 bg-[#3a2658] px-4 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#4b3270] hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-9 rounded-xl border-2 border-[#1c1224] bg-[#dcd4f0] px-4 text-[13px] font-semibold text-[#140a1c]",
              "shadow-[0_0_0_2px_rgba(99,63,140,0.55)]",
              "hover:bg-[#ebe4f8] hover:text-[#140a1c]"
            )}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
