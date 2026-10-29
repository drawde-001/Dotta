"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeCreateTaskHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><form data-aui=\"form\" data-aui-action=\"{&quot;type&quot;:&quot;create_task&quot;}\"><input data-aui=\"input\" aria-label=\"Title\" placeholder=\"Task title\" name=\"title\"/><textarea data-aui=\"input\" data-aui-multiline=\"true\" name=\"description\" aria-label=\"Description\" placeholder=\"Add more detail...\"></textarea><input type=\"date\" data-aui=\"datepicker\" aria-label=\"Due date\" name=\"dueDate\"/><button type=\"submit\" data-aui=\"button\" data-aui-style=\"primary\" data-aui-block=\"true\" data-aui-submit=\"true\">Create task</button></form></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeCreateTask({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-create-task"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeCreateTaskHtml }} />
      )}
    </div>
  );
}

export default GenerativeCreateTask;
