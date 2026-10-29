# Map
URL: /elements/map-answer

A location answer: pins, a route between them, and the list they came from.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

MapAnswer lays location results on a schematic grid: pins you can select, an optional route between them, and the list they came from underneath. With a runtime the pins come from a tool call that looked places up; standalone you already hold them.

## Getting started

**With a runtime:**

assistant-ui has no map or geocoding concept, and MapAnswer draws no real tiles or projection: `x` and `y` are plain 0 to 100 percentages that place a pin on the grid, not latitude and longitude. Whatever looks places up is responsible for turning real coordinates into that percentage layout before the result reaches this component.

1. ### Render the tool call

   ```
   "use client";

   import { useState } from "react";
   import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
   import {
     MapAnswer,
     type MapPin,
   } from "@/components/assistant-ui/elements/map-answer";

   type FindPlacesResult = {
     pins: MapPin[];
     route: boolean;
   };

   export const FindPlacesToolUI: ToolCallMessagePartComponent<
     { query: string },
     FindPlacesResult
   > = ({ result }) => {
     const [activeId, setActiveId] = useState("");

     if (!result) return null;
     const activePin = activeId || (result.pins[0]?.id ?? "");

     return (
       <MapAnswer
         pins={result.pins}
         activeId={activePin}
         route={result.route}
         onSelect={setActiveId}
       />
     );
   };
   ```

2. ### Register the tool

   ```
   import { defineToolkit } from "@assistant-ui/react";
   import { z } from "zod";
   import { FindPlacesToolUI } from "@/components/assistant-ui/elements/find-places-tool-ui";

   export const toolkit = defineToolkit({
     find_places: {
       type: "frontend",
       description: "Find places for a query and lay them out on a schematic map.",
       parameters: z.object({ query: z.string() }),
       execute: async ({ query }) => lookupPlaces(query),
       render: FindPlacesToolUI,
     },
   });
   ```

   `lookupPlaces` owns the coordinate math: normalize each result's real latitude and longitude against the bounding box of the whole set, so the closest pins end up close together on the grid. Wire the toolkit in with `Tools({ toolkit })`; see [Tool UI](/docs/tools/tool-ui).

**Standalone (no runtime):**

Standalone, you already hold the pins, their layout percentages, and which one is active.

1. ### Hold the active pin

   ```
   "use client";

   import { useState } from "react";
   import {
     MapAnswer,
     type MapPin,
   } from "@/components/assistant-ui/elements/map-answer";

   const PINS: MapPin[] = [
     { id: "a", label: "Ferry Building", detail: "0.4 mi", x: 28, y: 62 },
     { id: "b", label: "Coit Tower", detail: "1.1 mi", x: 55, y: 20 },
     { id: "c", label: "Chinatown", detail: "0.8 mi", x: 40, y: 45 },
   ];

   export function Places() {
     const [activeId, setActiveId] = useState(PINS[0].id);
     return (
       <MapAnswer pins={PINS} activeId={activeId} route onSelect={setActiveId} />
     );
   }
   ```

2. ### Replace the pin set

   A new search swaps the whole array and resets which pin is active.

   ```
   async function search(query: string) {
     const places = await fetchPlaces(query);
     setPins(places);
     setActiveId(places[0]?.id ?? "");
   }
   ```

## Anatomy

```
<div data-slot="map-answer">
  <div>
    <svg>{/* hairline grid, plus an optional dashed route through pins in array order */}</svg>
    {/* one marker button per pin, positioned by x/y percentage */}
  </div>
  <div>
    {/* one row per pin, top-bordered, including the first */}
  </div>
</div>
```

The route line draws only when `route` is true and there are at least two pins. It is a static dashed polyline connecting pins strictly in array order, not a computed path, so reordering `pins` changes the drawn route without adding or removing a single pin. `x` and `y` place a marker by percentage inside a 0 to 100 viewBox; nothing clamps an out-of-range value. The active pin's marker grows and switches to a blue fill; every other marker stays a smaller, neutral fill, both sharing the same background-colored ring so they read clearly against the grid lines. Clicking a marker and clicking its row in the list below both call `onSelect` with the same `pin.id`, so either one moves the active pin. Every list row carries a top divider, including the first, since the list sits directly under the grid rather than under another row. An empty `pins` array renders an empty grid, its hairlines still visible, with an empty list underneath.

## Examples

### Draw the route

The dashed line is decorative connectivity, not a routed path: it always runs in `pins` order and never adjusts itself to the active pin.

```
<MapAnswer pins={pins} activeId={activeId} route onSelect={onSelect} />
```

### Restyle the map

Both lanes take `className` on the root. The grid background reads the shared `field` token, the card itself `paper`, and the list's detail column `mono`, all from `surfaces.tsx`.

```
<MapAnswer className="max-w-none" /* ... */ />
```

## API reference

**With a runtime:**

### Tool-call render props

| Prop         | Type                        | Description                                                                         |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `args`       | `TArgs`                     | Parsed arguments. Partial while the model is still streaming them.                  |
| `argsText`   | `string`                    | Raw JSON argument text streamed by the model.                                       |
| `result`     | `TResult \| undefined`      | The tool's return value once it completes. `undefined` while running.               |
| `status`     | `ToolCallMessagePartStatus` | `status.type` is `"running"`, `"requires-action"`, `"complete"`, or `"incomplete"`. |
| `toolName`   | `string`                    | Name of the tool the model called.                                                  |
| `toolCallId` | `string`                    | Stable id for this invocation.                                                      |
| `isError`    | `boolean \| undefined`      | Whether `result` represents a tool execution error.                                 |

Register the renderer on a toolkit entry's `render` field and attach the toolkit with `Tools({ toolkit })`. See [Tool UI](/docs/tools/tool-ui) for the full render-prop surface, including `addResult`, human tools, and approval gates.

**Standalone (no runtime):**

### MapAnswer

| Prop        | Type                   | Default  | Description                                                                                                                       |
| ----------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pins`      | `readonly MapPin[]`    | required | The markers to place, in order. Also the order the route line connects them in.                                                   |
| `activeId`  | `string`               | required | Id of the highlighted pin. An id matching no pin highlights none.                                                                 |
| `route`     | `boolean`              |          | Draws a dashed line through `pins` in array order. No line below two pins even when `true`.                                       |
| `onSelect`  | `(id: string) => void` |          | Called with a pin's `id` from either its marker or its list row. Without it, both surfaces render as non-interactive map content. |
| `className` | `string`               |          | Merged onto the root.                                                                                                             |

### MapPin

| Field    | Type     | Description                                             |
| -------- | -------- | ------------------------------------------------------- |
| `id`     | `string` |                                                         |
| `label`  | `string` | Marker `aria-label` and the list row's primary text.    |
| `detail` | `string` | Secondary text in the list row, for example a distance. |
| `x`      | `number` | Horizontal position, 0 to 100 percent. Not longitude.   |
| `y`      | `number` | Vertical position, 0 to 100 percent. Not latitude.      |

All other `div` props are forwarded to the root.