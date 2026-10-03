import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { usePrivacyMode } from "@/contexts/PrivacyModeContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SHORTCUTS } from "@/lib/platform";

export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacyMode();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={enabled ? "Show amounts" : "Hide amounts"}
          aria-pressed={enabled}
          className={enabled ? "text-primary" : undefined}
        >
          {enabled ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {enabled ? "Privacy mode on: amounts hidden" : "Hide amounts"} ({SHORTCUTS.privacyMode.label})
      </TooltipContent>
    </Tooltip>
  );
}
