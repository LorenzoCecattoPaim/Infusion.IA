import { Zap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { useState } from "react";
import BuyCreditsDialog from "./BuyCreditsDialog";
import { LOW_CREDITS_THRESHOLD } from "@/lib/credits";

export default function CreditsDisplay() {
  const { credits, isLoading } = useCredits();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
            credits < LOW_CREDITS_THRESHOLD
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-secondary text-foreground"
          }`}
        >
          <Zap className="h-3 w-3 text-primary" />
          {isLoading ? "..." : `${credits} créditos`}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={() => setOpen(true)}
          title="Ver planos"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <BuyCreditsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

