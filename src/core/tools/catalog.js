/**
 * Agent Tools Catalog and Scoping Module
 *
 * Requirements:
 * 1. Prefixed tool names (browser_, snapshot_, profile_, workspace_, file_, shell_).
 * 2. 3-4 sentence comprehensive description explaining:
 *    - What the tool does
 *    - When to use it
 *    - When NOT to use it
 *    - What each parameter means
 * 3. readOnly boolean flag on every tool declaration.
 * 4. Active tools strictly scoped (10 to 20 active tools).
 * 5. ask_user is explicitly supported when interactive HITL is needed.
 */

export const AGENT_TOOLS_CATALOG = {
  browser_search: {
    name: 'browser_search',
    readOnly: true,
    description:
      'Executes a live web search using DuckDuckGo to discover web pages, job postings, official documentation, and public listings. Use this tool when you need external facts, company careers URLs, or real-time web listings. Do NOT use this tool if you already have the target URL or need to interact with form elements on an open page. The "query" parameter specifies clean search keywords; the "stepTitle" parameter summarizes what you are searching for.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Clean, focused search query keywords (e.g., "software engineer jobs remote Greenhouse")'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step description (e.g., "Search for remote engineering roles")'
        }
      },
      required: ['query', 'stepTitle']
    }
  },

  browser_read_page: {
    name: 'browser_read_page',
    readOnly: true,
    description:
      'Navigates the live Chromium browser to a specified HTTPS URL and extracts page title, readable text, hyperlinks, and form input controls. Use this tool to inspect webpage contents, examine job application forms, or review documentation. Do NOT use this tool to fill inputs or click buttons. The "url" parameter provides the destination URL; the "stepTitle" parameter describes what you are inspecting.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'Full https:// URL to navigate to and inspect'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step description (e.g., "Inspect job listing on Lever")'
        }
      },
      required: ['url', 'stepTitle']
    }
  },

  browser_action: {
    name: 'browser_action',
    readOnly: false,
    description:
      'Interacts with the currently loaded webpage in Chromium by clicking an element, typing text into an input field, scrolling the page, or hovering over elements. Use this tool to click buttons, select options, fill text inputs, scroll to view more page content, or hover over menus. Do NOT use this tool if you only need to read page text or perform a search. Parameter "action" is "click", "type", "scroll", or "hover"; "selectorOrText" is the CSS selector, visible text, or scroll container; "value" is text to type; "direction" is "down", "up", "top", or "bottom" for scrolling; "amount" is pixels to scroll (default 500); "pressEnter" presses Enter after typing (leave false for forms); "stepTitle" summarizes the action.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Action type: "click", "type", "scroll", or "hover"'
        },
        selectorOrText: {
          type: 'STRING',
          description: 'CSS selector, placeholder, or visible text of the target element, or container selector for scrolling'
        },
        value: {
          type: 'STRING',
          description: 'Text to type into the element when action is "type"'
        },
        direction: {
          type: 'STRING',
          description: 'Scroll direction when action is "scroll": "down" (default), "up", "top", or "bottom"'
        },
        amount: {
          type: 'NUMBER',
          description: 'Number of pixels to scroll when action is "scroll" (default 500)'
        },
        pressEnter: {
          type: 'BOOLEAN',
          description: 'Whether to press Enter key after typing (leave false when filling multi-input forms to avoid premature form submit resets)'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Short human-readable step description (e.g., "Scroll page down to view more content")'
        }
      },
      required: ['action', 'selectorOrText', 'stepTitle']
    }
  },

  snapshot_read: {
    name: 'snapshot_read',
    readOnly: true,
    description:
      'Inspects the current live browser DOM snapshot, URL, and viewport state without navigating away. Use this tool to verify page state after clicking or typing, or to inspect visible interactive elements. Do NOT use this tool to search the web or open new external links. Parameter "scope" specifies "all" or "interactive" elements; parameter "stepTitle" describes the inspection goal.',
    parameters: {
      type: 'OBJECT',
      properties: {
        scope: {
          type: 'STRING',
          description: 'Scope of snapshot inspection: "all" or "interactive"'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Short human-readable step description (e.g., "Verify form fields loaded")'
        }
      },
      required: ['stepTitle']
    }
  },

  browser_screenshot: {
    name: 'browser_screenshot',
    readOnly: true,
    description:
      'Captures a live screenshot of the currently loaded webpage, viewport, or a specific element selector. Use this tool when asked to screenshot, capture page layout, or save visual image thumbnails of stories or elements. Do NOT use this tool if you only need text extraction; use browser_read_page instead. Parameter "selector" specifies an optional CSS selector to screenshot a specific element; "fullPage" captures the full scrolling page; "stepTitle" summarizes what is being screenshotted.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description: 'Optional CSS selector to screenshot a specific element or thumbnail'
        },
        fullPage: {
          type: 'BOOLEAN',
          description: 'Whether to take a full page screenshot (defaults to false for viewport)'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Capture page thumbnail")'
        }
      },
      required: ['stepTitle']
    }
  },

  profile_get: {
    name: 'profile_get',
    readOnly: true,
    description:
      'Retrieves the saved applicant profile details including full name, email, phone number, resume text, and portfolio URL. Use this tool when filling out job application form fields with applicant data. Do NOT use this tool to mutate or delete profile records. Parameter "category" specifies the data section ("contact", "experience", or "all"); parameter "stepTitle" describes the retrieval purpose.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description: 'Category of profile data: "contact", "experience", or "all"'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Short human-readable step description (e.g., "Retrieve contact details for application")'
        }
      },
      required: ['stepTitle']
    }
  },

  workspace_create: {
    name: 'workspace_create',
    readOnly: false,
    description:
      'Initializes a secure, dedicated workspace directory for this execution run inside workspaces/<run-id>/. Use this tool at the start of a task when you need a local working environment to store project files, notes, or job application assets. Do NOT use this tool if a workspace is already active for the current run. Parameter "name" provides a human-readable title for the workspace; "stepTitle" summarizes what environment is being created.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: {
          type: 'STRING',
          description: 'Human-readable workspace project name'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Create workspace for application run")'
        }
      },
      required: ['stepTitle']
    }
  },

  file_read: {
    name: 'file_read',
    readOnly: true,
    description:
      'Reads the complete UTF-8 text content of a file located within the active workspace root. Use this tool to inspect configuration, code, notes, or resume files before editing or taking actions. Do NOT use this tool to list directories or read paths outside the workspace boundary. Parameter "path" is the workspace-relative path to the file; "stepTitle" describes what file you are inspecting.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Workspace-relative file path to read'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Read package.json")'
        }
      },
      required: ['path', 'stepTitle']
    }
  },

  file_list: {
    name: 'file_list',
    readOnly: true,
    description:
      'Lists directory contents, file sizes, and subdirectories within the active workspace root. Use this tool to explore files, inspect project structure, or locate assets. Do NOT use this tool to read the contents of individual files. Parameter "path" is the workspace-relative directory path (default "."); "recursive" determines whether to walk subdirectories; "stepTitle" describes the listing goal.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Workspace-relative directory path to list (defaults to ".")'
        },
        recursive: {
          type: 'BOOLEAN',
          description: 'Whether to list subdirectories recursively'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "List project files")'
        }
      },
      required: ['stepTitle']
    }
  },

  file_search: {
    name: 'file_search',
    readOnly: true,
    description:
      'Searches file names and file contents across the workspace root for a keyword or pattern. Use this tool to locate specific functions, settings, job descriptions, or references across multiple files. Do NOT use this tool to replace or edit files. Parameter "pattern" is the search keyword; "path" is the workspace directory to search from; "stepTitle" describes the search purpose.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pattern: {
          type: 'STRING',
          description: 'Search keyword or text pattern to locate'
        },
        path: {
          type: 'STRING',
          description: 'Workspace directory path to search within (defaults to ".")'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Search for apiUrl in workspace")'
        }
      },
      required: ['pattern', 'stepTitle']
    }
  },

  file_write: {
    name: 'file_write',
    readOnly: false,
    description:
      'Creates a new file or overwrites an existing file with text content within the workspace root. Use this tool to generate new code, write summaries, save notes, or output job application data. Do NOT use this tool to make small targeted edits to existing files; use file_edit instead. Parameter "path" is the workspace-relative target file path; "content" is the text to write; "stepTitle" summarizes the creation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Workspace-relative file path to write'
        },
        content: {
          type: 'STRING',
          description: 'Text content to write to the file'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Write notes.json")'
        }
      },
      required: ['path', 'content', 'stepTitle']
    }
  },

  file_edit: {
    name: 'file_edit',
    readOnly: false,
    description:
      'Performs a safe, exact-match text replacement within an existing file in the workspace root. Use this tool to update specific functions, variables, or sentences. Do NOT use this tool if you are rewriting an entire file from scratch or creating new files; use file_write instead. The tool strictly requires that the file was read earlier with file_read in this run, and old_text must match exactly once. Parameter "path" is the workspace-relative file path; "old_text" is the exact text to replace; "new_text" is the replacement text; "stepTitle" describes the edit.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Workspace-relative file path to edit'
        },
        old_text: {
          type: 'STRING',
          description: 'Exact text chunk to be replaced (must match exactly once)'
        },
        new_text: {
          type: 'STRING',
          description: 'Replacement text chunk'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Update port number in config.json")'
        }
      },
      required: ['path', 'old_text', 'new_text', 'stepTitle']
    }
  },

  file_delete: {
    name: 'file_delete',
    readOnly: false,
    description:
      'Deletes a file or directory from within the active workspace root. Use this tool to remove obsolete temporary files, caches, or outdated drafts. Do NOT use this tool without human approval; file_delete always asks the user before executing. Parameter "path" is the workspace-relative path to remove; "stepTitle" summarizes what is being deleted.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Workspace-relative path to delete'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Delete temporary draft file")'
        }
      },
      required: ['path', 'stepTitle']
    }
  },

  shell_run: {
    name: 'shell_run',
    readOnly: false,
    description:
      'Executes a shell command inside an isolated sandbox scoped to the workspace directory. Use this tool to run tests, build scripts, compile code, or inspect environment output within the workspace. Parameter "command" is the shell command to execute inside the sandbox; "background" indicates whether to run the command asynchronously; "stepTitle" describes the command purpose.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: {
          type: 'STRING',
          description: 'The shell command to execute inside the sandbox'
        },
        background: {
          type: 'BOOLEAN',
          description: 'Whether to run the command asynchronously in the background'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Run npm test")'
        }
      },
      required: ['command', 'stepTitle']
    }
  },

  shell_output: {
    name: 'shell_output',
    readOnly: true,
    description:
      'Retrieves the output, running status, and exit code for a background sandbox command. Use this tool to inspect progress or logs from a process previously started with shell_run in background mode. Parameter "id" is the background execution ID returned by shell_run; "stepTitle" summarizes what output is being inspected.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'The background execution ID returned by shell_run'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Check test output")'
        }
      },
      required: ['id', 'stepTitle']
    }
  },

  shell_kill: {
    name: 'shell_kill',
    readOnly: false,
    description:
      'Terminates an actively running background sandbox process by its execution ID. Use this tool when a background process is no longer needed, appears hung, or has finished its task. Parameter "id" is the background execution ID to terminate; "stepTitle" describes why the process is being killed.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'The background execution ID to terminate'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Stop background dev server")'
        }
      },
      required: ['id', 'stepTitle']
    }
  },
  segment_image: {
    name: 'segment_image',
    readOnly: false,
    description:
      'Finds and outlines objects in an image from a short concrete noun prompt using Meta Segment Anything Model (SAM 3.1). Use this tool when you need pixel-accurate bounding boxes and masks for visual elements (e.g. "glasses", "yellow school bus", "cup") in an image located in your workspace. Do NOT use this tool for full image captioning or questions; use vision understanding for that. The "image_path" parameter specifies the relative image file in the user workspace; "prompt" is a short concrete noun phrase; "max_matches" optionally caps the returned detections.',
    parameters: {
      type: 'OBJECT',
      properties: {
        image_path: {
          type: 'STRING',
          description: 'Relative path to the image file within the workspace (e.g. "inputs/photo.png")'
        },
        prompt: {
          type: 'STRING',
          description: 'Short concrete noun phrase naming one object type to segment (e.g. "yellow bus", "glasses")'
        },
        max_matches: {
          type: 'INTEGER',
          description: 'Optional maximum number of matching objects to return'
        }
      },
      required: ['image_path', 'prompt']
    }
  },

  generate_image: {
    name: 'generate_image',
    readOnly: true,
    description:
      'Generates a high-resolution image, photo, portrait, illustration, or artwork from a text prompt using Meta Muse Image 1.0 (muse-image-1.0) and renders it directly in the UI ImageGeneration component. ALWAYS use this tool whenever the user asks to generate, create, draw, paint, or render an image. NEVER write SVG files or use shell scripts/code to fake image generation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed visual description of the image to generate (subject, lighting, style, composition).'
        },
        size: {
          type: 'STRING',
          enum: ['1024x1024', '1024x1536', '1536x1024'],
          description: 'Image dimensions (defaults to "1024x1024").'
        },
        stepTitle: {
          type: 'STRING',
          description: 'Concise human-readable step title (e.g., "Generating portrait with Muse Image 1.0")'
        }
      },
      required: ['prompt', 'stepTitle']
    }
  }
};

export const ASK_USER_TOOL = {
  name: 'ask_user',
  readOnly: true,
  description:
    'Pauses execution to present a brief question or recommendation with 2 to 3 concise selectable options. Use this tool when you genuinely need a decision or confirmation from the user. Keep "question" to a single brief sentence (under 18 words) and ALWAYS provide 2 to 3 short options (2-6 words each), placing your recommended option first prefixed with "(Recommended)".',
  parameters: {
    type: 'OBJECT',
    properties: {
      question: {
        type: 'STRING',
        description: 'A brief, direct 1-sentence question or recommendation (max 18 words).'
      },
      context: {
        type: 'STRING',
        description: 'Optional 1-line brief rationale or recommendation note.'
      },
      options: {
        type: 'ARRAY',
        description: 'REQUIRED: 2 to 3 short selectable options (2-6 words each). Prefix the first option with "(Recommended)" when suggesting a preferred path.',
        items: { type: 'STRING' }
      },
      is_multi_select: {
        type: 'BOOLEAN',
        description: 'Whether multiple options can be selected (defaults to false)'
      },
      stepTitle: {
        type: 'STRING',
        description: 'Concise human-readable step title (e.g., "Ask user preference")'
      }
    },
    required: ['question', 'options', 'stepTitle']
  }
};

export const TOOL_ALIASES = {
  web_search: 'browser_search',
  read_page: 'browser_read_page',
  image_generation: 'generate_image',
  create_image: 'generate_image'
};

export function getScopedTools({ phase = 'all', mode = 'turbo', includeAskUser = false } = {}) {
  let tools = [];

  if (phase === 'phase2' || phase === 'workspace') {
    tools = [
      AGENT_TOOLS_CATALOG.workspace_create,
      AGENT_TOOLS_CATALOG.file_read,
      AGENT_TOOLS_CATALOG.file_list,
      AGENT_TOOLS_CATALOG.file_search,
      AGENT_TOOLS_CATALOG.file_write,
      AGENT_TOOLS_CATALOG.file_edit,
      AGENT_TOOLS_CATALOG.file_delete
    ];
  } else if (phase === 'phase3' || phase === 'sandbox') {
    tools = [
      AGENT_TOOLS_CATALOG.workspace_create,
      AGENT_TOOLS_CATALOG.file_read,
      AGENT_TOOLS_CATALOG.file_list,
      AGENT_TOOLS_CATALOG.file_search,
      AGENT_TOOLS_CATALOG.file_write,
      AGENT_TOOLS_CATALOG.file_edit,
      AGENT_TOOLS_CATALOG.file_delete,
      AGENT_TOOLS_CATALOG.shell_run,
      AGENT_TOOLS_CATALOG.shell_output,
      AGENT_TOOLS_CATALOG.shell_kill
    ];
  } else if (phase === 'phase1' || phase === 'browser') {
    tools = [
      AGENT_TOOLS_CATALOG.browser_search,
      AGENT_TOOLS_CATALOG.browser_read_page,
      AGENT_TOOLS_CATALOG.browser_action,
      AGENT_TOOLS_CATALOG.snapshot_read,
      AGENT_TOOLS_CATALOG.browser_screenshot,
      AGENT_TOOLS_CATALOG.profile_get
    ];
  } else {
    tools = [
      AGENT_TOOLS_CATALOG.workspace_create,
      AGENT_TOOLS_CATALOG.file_read,
      AGENT_TOOLS_CATALOG.file_list,
      AGENT_TOOLS_CATALOG.file_search,
      AGENT_TOOLS_CATALOG.file_write,
      AGENT_TOOLS_CATALOG.file_edit,
      AGENT_TOOLS_CATALOG.file_delete,
      AGENT_TOOLS_CATALOG.shell_run,
      AGENT_TOOLS_CATALOG.shell_output,
      AGENT_TOOLS_CATALOG.shell_kill,
      AGENT_TOOLS_CATALOG.browser_search,
      AGENT_TOOLS_CATALOG.browser_read_page,
      AGENT_TOOLS_CATALOG.browser_action,
      AGENT_TOOLS_CATALOG.snapshot_read,
      AGENT_TOOLS_CATALOG.browser_screenshot,
      AGENT_TOOLS_CATALOG.profile_get,
      AGENT_TOOLS_CATALOG.segment_image,
      AGENT_TOOLS_CATALOG.generate_image
    ];
  }

  if (includeAskUser && !tools.some((t) => t.name === 'ask_user') && ASK_USER_TOOL) {
    tools.push(ASK_USER_TOOL);
  }

  let active = mode === 'readonly' ? tools.filter((t) => t.readOnly) : [...tools];

  if (!includeAskUser) {
    active = active.filter((t) => t.name !== 'ask_user');
  }

  if (active.length > 20) {
    active = active.slice(0, 20);
  }

  return active;
}

export const AGENT_TOOLS = getScopedTools({ phase: 'all', includeAskUser: false });
