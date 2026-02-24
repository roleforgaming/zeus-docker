# Zeus Workspace Templates - Design Document

**Date:** 2026-02-23
**Feature:** Workspace Templates for Project-Scoped Claude Code Setup
**Status:** Approved for Implementation

---

## Overview

Workspace Templates allow users to capture a configured workspace (with skills, MCPs, boilerplate files, and directory structure) and reuse it to create new workspaces quickly. This addresses the pain point of repeatedly setting up project-scoped Claude Code configurations for different project types.

**Key Goal:** Enable users to define "starter kits" for common project types (React, Python, Node, etc.) that include:
- Pre-configured `.claude/` directory (skills, MCP configs)
- Boilerplate files and directory structure
- Recommended file exclusions (node_modules, .git, etc.)
- Automatic post-install hooks (npm install, git init, etc.)

---

## Storage & File Format

### Template Storage Location
Templates are stored as individual directories under the shared system location:

```
~/.local/share/zeus/templates/
├── react-app/
│   ├── .zeus-template.json
│   ├── .zeusignore
│   ├── .zeus-hooks.json (optional)
│   ├── package.json
│   ├── src/
│   ├── .claude/
│   └── ...
├── python-backend/
│   ├── .zeus-template.json
│   ├── .zeusignore
│   └── ...
└── ...
```

This location enables:
- Cross-machine sync via dotfiles
- Template version control
- Sharing templates between users

### Template Manifest (`.zeus-template.json`)
```json
{
  "name": "React TypeScript App",
  "description": "React + TypeScript + Vite with preconfigured Claude Code skills",
  "language": "TypeScript",
  "projectType": "frontend",
  "icon": "⚛️",
  "color": "#61DAFB",
  "tags": ["react", "typescript", "vite"],
  "version": "1.0.0",
  "createdFrom": "/path/to/source/workspace",
  "createdAt": "2026-02-23T10:30:00Z"
}
```

### Exclusions (`.zeusignore`)
Standard glob patterns (like `.gitignore`) specifying which files/directories to exclude during copying:

```
node_modules
.git
.vscode
dist
build
.cache
.env
```

### Post-Install Hooks (`.zeus-hooks.json`) - Optional
```json
{
  "hooks": [
    {
      "name": "install dependencies",
      "command": "npm ci",
      "when": "package.json exists"
    },
    {
      "name": "initialize git",
      "command": "git init && git add -A && git commit -m 'Initial commit from template'",
      "when": ".git does not exist"
    }
  ]
}
```

---

## Template Discovery

Zeus performs **auto-discovery** by scanning `~/.local/share/zeus/templates/` at startup and when the directory changes.

**Discovery Logic:**
1. Scan all subdirectories in templates folder
2. For each directory, check for existence of `.zeus-template.json`
3. If valid manifest found, load template metadata
4. Templates appear in the Template Picker automatically

No manual registration required. Users can add templates by copying folders into the templates directory, or remove by deleting them.

---

## User Flows

### 1. Create Template from Workspace

**Trigger:** Right-click workspace in sidebar → "Create Template from Workspace"

**Wizard Modal:**

**Step 1: Basic Metadata**
- Template name (default: workspace name, editable)
- Description (text area)
- Language dropdown (TypeScript, Python, Rust, Go, etc.)
- Icon selector (emoji picker)
- Color picker

**Step 2: Inclusion/Exclusion**
- Smart presets (toggled on by default):
  - [x] Exclude `node_modules`
  - [x] Exclude `.git`
  - [x] Exclude `.vscode` / `.idea`
  - [x] Exclude `dist` / `build`
  - [x] Exclude environment files (`.env`, `.env.local`)
- Advanced section (collapsible):
  - File tree view showing entire workspace
  - Checkboxes for individual files/folders (overrides presets)
  - Search/filter input
- Preview summary: "X files, Y folders will be included (Z excluded)"

**Step 3: Hooks (Optional)**
- Checkbox: "Add custom post-install hooks?"
- If checked, show code editor for `.zeus-hooks.json` with template
- If unchecked, only built-in language hooks will run
- Help text: "Advanced: Customize commands to run after files are copied"

**Step 4: Review & Create**
- Summary card: name, language, icon, file count
- "Create Template" button
- On create: Copy workspace files to `~/.local/share/zeus/templates/<name>/` (respecting exclusions), write `.zeus-template.json` and optional `.zeus-hooks.json`

---

### 2. Create Workspace from Template

**Trigger:** "Add Workspace" button → Choice: "Empty workspace" or "From template"

**If "From template":**

**Step 1: Template Picker Modal**
- Grid/list of all discovered templates
- Each template card shows: icon (large), name, language badge, description
- Search/filter by name or language
- Select template → "Next"

**Step 2: Directory Name**
- Prompt: "Enter workspace directory name"
- Default: template name (sanitized)
- Validation: must be a valid directory name, not already exist
- On submit: proceed to installation

**Step 3: Installation**
- Show progress: "Creating workspace..."
- Copy all template files (respecting `.zeusignore`) to new directory
- Run built-in language hooks (if applicable)
- Run custom hooks from `.zeus-hooks.json` (if exists)
- On completion: add workspace to sidebar, select it

---

### 3. Manage Templates (Implicit)

**Editing:**
- Open template folder in code-server
- Edit `.zeus-template.json`, `.zeusignore`, `.zeus-hooks.json`, or template files directly
- Changes take effect immediately (auto-discovery on reload)

**Deleting:**
- Delete template folder from `~/.local/share/zeus/templates/`
- Template disappears from picker on next scan

**Sharing:**
- Zip template folder and share
- User extracts to their templates directory

---

## Technical Implementation

### Frontend Changes

**Components:**
- `TemplateCreationWizard.svelte` - Multi-step modal for creating templates
- `TemplatePicker.svelte` - Modal for selecting template
- `TemplateCard.svelte` - Individual template display (icon, name, language)
- `FileTreeWithPresets.svelte` - Advanced file selection (reusable component)

**Store Extensions (`src/renderer/src/lib/stores/workspace.svelte.ts`):**
- `templates` - $state<Template[]> array
- `discoverTemplates()` - Scan templates directory via backend API
- `createTemplateFromWorkspace(workspacePath, templateConfig)` - Wizard submit handler
- `createWorkspaceFromTemplate(templateName, targetDir)` - Workspace creation handler

**Backend API Endpoints (`server/index.js`):**
- `template:discover` - Scan templates directory, return template metadata
- `template:createFromWorkspace` - Copy workspace files, write manifest
- `workspace:createFromTemplate` - Copy template to target, execute hooks

**Socket.IO Events:**
- `workspace:template:create` → triggers wizard modal
- `workspace:create:choose-template` → opens template picker

---

### Backend Changes

**Template Discovery Logic:**
```javascript
const TEMPLATES_DIR = path.join(os.homedir(), '.local', 'share', 'zeus', 'templates');

function discoverTemplates() {
  const dirs = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => path.join(TEMPLATES_DIR, dirent.name));

  const templates = [];

  for (const dir of dirs) {
    const manifestPath = path.join(dir, '.zeus-template.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.path = dir; // store path for later use
      templates.push(manifest);
    }
  }

  return templates;
}
```

**Workspace from Template:**
```javascript
function createWorkspaceFromTemplate(templatePath, targetDir, hooks) {
  // 1. Copy template files (respect .zeusignore)
  copyWithExclusions(templatePath, targetDir, '.zeusignore');

  // 2. Run built-in hooks based on language
  runBuiltinHooks(targetDir, manifest.language);

  // 3. Run custom hooks if present
  if (hooks) {
    executeHooks(targetDir, hooks);
  }

  // 4. Add to workspace store
  workspaceStore.add(targetDir);
}
```

**Built-in Hooks Registry:**
```javascript
const BUILTIN_HOOKS = {
  'Node.js': async (dir) => {
    if (exists(path.join(dir, 'package.json'))) {
      await exec('npm ci', { cwd: dir });
    }
  },
  'Python': async (dir) => {
    const reqFile = path.join(dir, 'requirements.txt');
    if (exists(reqFile)) {
      await exec('pip install -r requirements.txt', { cwd: dir });
    }
  },
  'Rust': async (dir) => {
    if (exists(path.join(dir, 'Cargo.toml'))) {
      await exec('cargo fetch', { cwd: dir });
    }
  }
  // ...
};
```

---

### Storage Changes

**New Directory Structure:**
- `~/.local/share/zeus/templates/` - Template storage (auto-created if missing)

**No changes to `~/.zeus/zeus-store.json`** - Templates are discovery-based, not stored in the workspace store.

---

## Error Handling

**Template Creation Failures:**
- Disk full / permission denied → show error, suggest alternative location
- Invalid manifest → validation errors in wizard
- File copy error (in-use files) → retry with delay or skip

**Workspace Creation Failures:**
- Target directory already exists → validation error in name prompt
- Hook command fails → show warning but workspace still created
- Partial copy (interruption) → clean up incomplete directory

---

## Testing Strategy

**Unit Tests:**
- Template discovery logic (directory scanning, manifest validation)
- File copy with exclusions (`.zeusignore` parsing, path matching)
- Hook execution (built-in and custom, success/failure cases)
- Manifest validation (required fields, defaults)

**Integration Tests:**
- Full template creation wizard flow → template appears in picker
- Workspace from template → files copied, hooks executed, workspace added
- Template editing (modify manifest → changes reflected on reload)

**E2E Tests (Playwright):**
- User creates template from a sample workspace, then uses it to create new workspace
- Verify `.claude/` config is copied correctly
- Verify hooks run (e.g., `node_modules` created after npm install)
- Verify exclusions respected (node_modules not copied)

---

## Open Questions & Future Enhancements

1. **Template Versioning:** Should templates support version numbers and upgrade paths?
2. **Template Sharing:** Could Zeus facilitate template import from remote URLs or a template gallery?
3. **Workspace Diff:** Show diff between template and current workspace to highlight modifications?
4. **Template Validation:** Lint templates for common issues (missing required files, invalid hooks)?
5. **Backup/Restore:** Include templates in Zeus backup/export functionality?

---

## Success Criteria

- Users can create templates from configured workspaces via intuitive wizard
- Templates include skills/MCPs, boilerplate, and respect exclusions
- Workspace creation from template automates setup with hooks
- Template management is zero-friction (auto-discovery, file-based editing)
- All existing workspace functionality remains unaffected

---

## Design Approval

**Approved by:** User
**Date:** 2026-02-23
**Next Step:** Implementation plan creation via `superpowers:writing-plans`
