"use client";

import { Plus, Search, Settings, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onNewApplication?: () => void;
}

export function Sidebar({ onNewApplication }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNewApplicationClick = () => {
    onNewApplication?.();
    router.push("/");
  };

  return (
    <TooltipProvider>
      <aside className="flex h-screen w-14 flex-col items-center border-r border-border bg-sidebar-bg py-4">
        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={handleNewApplicationClick}
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">New Application</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>New Application</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-9 w-9", pathname === "/applications" && "bg-accent")}
                asChild
              >
                <Link href="/applications">
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Browse Applications</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Browse Applications</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-auto flex flex-col items-center gap-2">
          <Separator className="mb-2 w-8" />
          <ThemeToggle />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-9 w-9",
                  pathname.startsWith("/settings") && "bg-accent"
                )}
                asChild
              >
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <User className="h-4 w-4" />
                <span className="sr-only">Profile</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Profile</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
