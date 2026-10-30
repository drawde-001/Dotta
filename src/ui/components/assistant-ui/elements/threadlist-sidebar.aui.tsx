import type * as React from "react";
import { MessagesSquare } from "lucide-react";
import { GitHubIcon } from "@/components/icons/github";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";

export function ThreadListSidebar({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className={className} {...props}>
      <SidebarHeader className="aui-sidebar-header mb-2 border-b border-[#1F1F26]">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <div className="flex items-center gap-2.5 cursor-pointer">
                  <div className="aui-sidebar-header-icon-wrapper bg-white/10 text-white flex aspect-square size-8 items-center justify-center rounded-lg">
                    <MessagesSquare className="aui-sidebar-header-icon size-4 text-emerald-400" />
                  </div>
                  <div className="aui-sidebar-header-heading me-6 flex flex-col gap-0.5 leading-none">
                    <span className="aui-sidebar-header-title font-semibold text-sm text-white">
                      OmniAgent
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Threads
                    </span>
                  </div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2">
        <ThreadList />
      </SidebarContent>
      {props.collapsible !== "none" && <SidebarRail />}
      <SidebarFooter className="aui-sidebar-footer border-t border-[#1F1F26]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a
                href="https://github.com/drawde-001/omni-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-zinc-400 hover:text-white transition"
              >
                <div className="aui-sidebar-footer-icon-wrapper bg-white/10 text-white flex aspect-square size-8 items-center justify-center rounded-lg">
                  <GitHubIcon className="aui-sidebar-footer-icon size-4" />
                </div>
                <div className="aui-sidebar-footer-heading flex flex-col gap-0.5 leading-none">
                  <span className="aui-sidebar-footer-title font-semibold text-xs text-white">
                    GitHub
                  </span>
                  <span className="text-[11px] text-zinc-400">View Source</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
