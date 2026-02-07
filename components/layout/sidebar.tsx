"use client";

import { FileText, Moon, Plus, Search, Settings, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
  const { theme, setTheme } = useTheme();

  const handleNewApplicationClick = () => {
    onNewApplication?.();
    router.push("/");
  };

  return (
    <>
      <TooltipProvider>
        <aside className="hidden h-[100dvh] w-14 flex-col items-center border-r border-border bg-sidebar-bg py-4 md:flex">
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
                  className={cn(
                    "h-9 w-9",
                    pathname === "/applications" && "bg-accent"
                  )}
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar-bg/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10 text-foreground", pathname === "/" && "bg-accent")}
            asChild
          >
            <Link href="/">
              <FileText className="h-4 w-4" />
              <span className="sr-only">Resume Editor</span>
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 text-foreground",
              pathname === "/applications" && "bg-accent"
            )}
            asChild
          >
            <Link href="/applications">
              <Search className="h-4 w-4" />
              <span className="sr-only">Browse Applications</span>
            </Link>
          </Button>

          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 text-foreground"
            onClick={handleNewApplicationClick}
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">New Application</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 text-foreground",
              pathname.startsWith("/settings") && "bg-accent"
            )}
            asChild
          >
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </nav>
    </>
  );
}
