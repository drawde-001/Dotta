# Question flow
URL: /elements/question-flow

Ask a few short questions in sequence and return every answer as one result.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

A question flow gives the user one small decision at a time, then sends the complete set of answers back together. It is useful when one answer narrows the next decision without turning the conversation into a form.

## Getting started

**With a runtime:**

A question flow is a human tool: the model supplies its steps as arguments, the run pauses when the arguments are complete, and the final step returns `{ answers }` as the tool result.

1. ### Render the human tool

   ```
   "use client";

   import { defineToolkit, useAuiState } from "@assistant-ui/react";
   import { z } from "zod";
   import { QuestionFlow } from "@/components/assistant-ui/elements/question-flow";

   export const toolkit = defineToolkit({
     ask_project_questions: {
       type: "human",
       description: "Ask a short sequence of questions before planning the project update.",
       parameters: z.object({
         steps: z.array(
           z.object({
             id: z.string(),
             question: z.string(),
             description: z.string().optional(),
             options: z.array(
               z.object({
                 id: z.string(),
                 label: z.string(),
                 description: z.string().optional(),
               }),
             ),
             selectionMode: z.enum(["single", "multiple"]).optional(),
             minSelections: z.number().optional(),
             maxSelections: z.number().optional(),
           }),
         ),
       }),
       render: function AskProjectQuestions({ args, status, result, addResult }) {
         const canAnswer = useAuiState(
           (s) => s.thread.capabilities.answerToolCall,
         );
         const waiting = status.type === "requires-action" && canAnswer;

         return (
           <QuestionFlow
             steps={args.steps ?? []}
             choice={result?.answers}
             onComplete={
               waiting ? (answers) => addResult({ answers }) : undefined
             }
           />
         );
       },
     },
   });
   ```

   `status.type` is `"requires-action"` only once the arguments are complete and the run is waiting on the user. `answerToolCall` is false in a readonly thread, such as a sub-agent transcript. Outside that window, `onComplete` is absent and the flow displays every supplied step without controls.

2. ### Register the toolkit

   ```
   "use client";

   import { AssistantRuntimeProvider, AuiConfig, Tools } from "@assistant-ui/react";
   import { useChatRuntime } from "@assistant-ui/ai-sdk";
   import { toolkit } from "./toolkit";

   const config = AuiConfig({ tools: Tools({ toolkit }) });

   export function MyRuntimeProvider({ children }: { children: React.ReactNode }) {
     const runtime = useChatRuntime();
     return (
       <AssistantRuntimeProvider runtime={runtime} config={config}>
         {children}
       </AssistantRuntimeProvider>
     );
   }
   ```

   The model receives the result only after the last answer lands. See [Tool UI](/docs/tools/tool-ui#user-input-collection) for the human tool lifecycle.

**Standalone (no runtime):**

Standalone, a fulfilled `onComplete` settles the flow into its receipt. Hold completed answers in your own state and pass them to `choice` when your application needs to supply or override that receipt.

1. ### Hold the combined answer

   ```
   "use client";

   import { useState } from "react";
   import {
     QuestionFlow,
     type QuestionFlowStep,
   } from "@/components/assistant-ui/elements/question-flow";

   const STEPS: QuestionFlowStep[] = [
     {
       id: "audience",
       question: "Who should receive this update?",
       options: [
         { id: "team", label: "The project team" },
         { id: "leaders", label: "Department leaders" },
       ],
     },
     {
       id: "topics",
       question: "What should it cover?",
       selectionMode: "multiple",
       options: [
         { id: "milestones", label: "Milestones" },
         { id: "risks", label: "Open risks" },
       ],
     },
   ];

   export function ProjectUpdateQuestions() {
     const [choice, setChoice] = useState<Record<string, string[]>>();

     return (
       <QuestionFlow
         steps={STEPS}
         choice={choice}
         onComplete={setChoice}
       />
     );
   }
   ```

2. ### Complete asynchronously

   Return a promise when the answers need to reach a server first. The final option and Back lock while it is pending. A fulfilled completion becomes a receipt even without `choice`; a supplied `choice` takes precedence. A rejection keeps the question open with the error message:

   ```
   <QuestionFlow
     steps={STEPS}
     onComplete={async (answers) => {
       await saveProjectUpdateAnswers(answers);
       setChoice(answers);
     }}
   />
   ```

## Anatomy

```
<div data-slot="question-flow" data-state="open | receipt">
  <div>
    <span />
    <button type="button" />
  </div>
  <div role="progressbar" />
  <p />
  <div data-slot="option-list" />
</div>
```

An open flow has one paper card, a counter, a progress bar, and the current step's OptionList. A single selection advances immediately. A multiple selection uses Next until the final step, which uses Submit by default. Back preserves prior answers. Each step change moves focus to the first enabled option of the step now shown. Without `onComplete`, every step is a display-only OptionList with no header controls.

After `onComplete` resolves, the card is a receipt. `choice`, when set, takes precedence over the internally confirmed answers. A receipt has one row for each answered step, with the question above its selected labels, and no controls.

## Examples

### Start with existing answers

`defaultValue` starts a flow with answers that are already known. Going Back keeps any answers made during this flow too:

```
<QuestionFlow
  steps={STEPS}
  defaultValue={{ audience: ["team"], topics: ["milestones"] }}
  onComplete={saveAnswers}
/>
```

### Change the final action

Use `completeLabel` when the final action has a more specific name. It only replaces the final multiple-selection button. A final single selection still submits on pick:

```
<QuestionFlow
  steps={STEPS}
  completeLabel="Create update"
  onComplete={saveAnswers}
/>
```

## API reference

**With a runtime:**

### Human-tool render props

| Prop                                   | Type                                                 | Description                                                            |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `args.steps`                           | `QuestionFlowStep[]`                                 | Questions the model supplied, which can arrive incrementally.          |
| `status`                               | `ToolCallMessagePartStatus`                          | `status.type === "requires-action"` while the run waits for an answer. |
| `result`                               | `{ answers: Record<string, string[]> } \| undefined` | The completed answers, supplied to `choice` for the receipt.           |
| `addResult`                            | `(result) => void`                                   | Completes the human tool with `{ answers }`.                           |
| `s.thread.capabilities.answerToolCall` | `boolean`                                            | Gates `onComplete` so readonly threads never offer controls.           |

**Standalone (no runtime):**

### QuestionFlow

| Prop            | Type                                 | Default    | Description                                                                                                              |
| --------------- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `steps`         | `QuestionFlowStep[]`                 | required   | `{ id, question, description?, options, selectionMode?, minSelections?, maxSelections? }` in flow order.                 |
| `defaultValue`  | `Record<string, string[]>`           |            | Answers used when a step first opens. Unknown option ids are ignored by OptionList.                                      |
| `onComplete`    | `(answers) => void \| Promise<void>` |            | Receives every answer at the final step. A fulfilled completion becomes a receipt; without it, the flow is display only. |
| `completeLabel` | `string`                             | `"Submit"` | Label for the final multiple-selection action.                                                                           |
| `choice`        | `Record<string, string[]>`           |            | Completed answers. When set, they take precedence and the root becomes a receipt.                                        |
| `className`     | `string`                             |            | Merged onto the root.                                                                                                    |

All other `div` props are forwarded to the root.