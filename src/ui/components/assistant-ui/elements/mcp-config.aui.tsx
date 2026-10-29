"use client";
import React from "react";
import { McpServerPanel } from "./mcp-server-panel.aui";
export function McpConfig(props: any) {
  return <McpServerPanel data-slot="mcp-config" {...props} />;
}
export default McpConfig;
