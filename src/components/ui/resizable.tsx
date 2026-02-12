"use client";

import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof Group>) => (
  <Group
    className={cn("flex h-full w-full", className)}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex items-center justify-center bg-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 hover:bg-primary/30 active:bg-primary/40 transition-colors [&[aria-orientation=vertical]]:h-full [&[aria-orientation=vertical]]:w-0.5 [&[aria-orientation=vertical]]:cursor-col-resize [&[aria-orientation=horizontal]]:h-1.5 [&[aria-orientation=horizontal]]:w-full [&[aria-orientation=horizontal]]:cursor-row-resize",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-6 w-3.5 items-center justify-center rounded-sm border bg-border shadow-sm">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
