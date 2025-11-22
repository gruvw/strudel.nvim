# strudel.nvim

A Neovim plugin that integrates with [Strudel](https://strudel.cc/), a live coding web editor for algorithmic music and visuals.

This plugin launches Strudel in a browser window and provides real-time two-way synchronization between a selected Neovim buffer and the Strudel editor, as well as remote Strudel controls (play/stop, update), and much more!

<p align="center">
  <img width="600" src="./docs/images/demo.png"><br>
  <b>🎉 Happy live coding & algorave! 🎵</b>
</p>

## Features

- **Real-time sync** - Two-way synchronization between Neovim buffer and Strudel editor.
- **Playback control** - Control Strudel's _Play/Stop_ and _Update_ functions directly from Neovim.
- **Side by side workflow** - Maximized Strudel menu panel and (optionally) hidden top bar for side by side Neovim-Strudel seamless workflow (effectively replacing the default Strudel editor by Neovim).
- **File based** - Save your files as `*.str` (or `.std`) and open them right away in Strudel through Neovim, anywhere on your file system (open and change files with your own file manager or fuzzy finder/picker, and allows using your regular version control system).
- **Two-way cursor sync** - The cursor position is synchronized in real-time (by default) between Neovim and the Strudel editor. Move your cursor in either environment and it will update in the other, enabling seamless navigation and editing.
- **Swap files** - Change the buffer that is synced to Strudel on the fly with the simple `:StrudelSetBuffer` command.
- **File type support** - The plugin automatically sets the file type to `javascript` for `.str` (or `.std`) files, providing proper syntax highlighting and language support.
- **Hydra support** - As Strudel [integrates with Hydra](https://strudel.cc/learn/hydra/), you can also live code stunning visuals directly from Neovim. Check out the [Hydra only config options](#hydra-only-config-options) to only display the Hydra background (allows for easy screen projections during live performance for example).
- **Strudel error reporting** - Reports Strudel evaluation errors back into Neovim (by default).
- **Custom CSS injection** - Optionally inject your own CSS into the Strudel web editor by specifying a `custom_css_file` in the setup options. Allows you to fully customize the Strudel UI from your Neovim config.
- **Auto update** - Optionally trigger Strudel Update when saving the buffer content.
- **Customizable** - Check out the [configuration options](#configuration) to customize your experience and user-interface.
- **Headless mode** - Optionally launch Strudel without opening the Strudel browser window for a pure Neovim live coding experience.
- **Session persistence & offline** - Remembers browser state across sessions, which also means you can use it [offline](https://strudel.cc/learn/pwa/).

It uses [Puppeteer](https://github.com/puppeteer/puppeteer) to control a real browser instance allowing you to write Strudel code from Neovim (your favorite text editor) with all your regular config and plugins.

Check out the [Strudel documentation](https://strudel.cc/learn) to learn about the language.

Take a look at the project's [roadmap](docs/roadmap.md) to see upcoming features (along with all the work accomplished).

## Prerequisites

- [Neovim](https://neovim.io/) (0.9.0 or higher)
- [Node.js](https://nodejs.org) (16.0 or higher)
- [npm](https://www.npmjs.com/) for JavaScript package management
- [Chromium based browser](https://www.chromium.org/Home/) for web view launch

## Installation

First, make sure you have all the prerequisites installed on your system.

With [lazy.nvim](https://github.com/folke/lazy.nvim)

```lua
{
  "gruvw/strudel.nvim",
  build = "npm ci",
  config = function()
    require("strudel").setup()
  end,
}
```

**Note:** You have to call the `.setup()` function before using the plugin.

**Note:** Lazy loading the plugin may break the _File type support_ feature (see https://github.com/gruvw/strudel.nvim/issues/5).

## Usage

### Basic Workflow

1. **Launch Strudel** - Open a `.str` file or any buffer in Neovim and run: `:StrudelLaunch`.
2. **Start Coding** - The Strudel editor will open in your browser with the content of the current buffer. By default the Strudel menu panel is maximized to allow for a seamless side by side workflow between Neovim and strudel (effectively hiding the default Strudel editor and replacing it by your Neovim window). Any changes you make in Neovim will be automatically synced to Strudel (and the other way arround as well).
3. **Control Playback** - Use `:StrudelToggle` to start and stop the playback, and `:StrudelUpdate` to trigger the update of your code (effectively remotely presses the _Play/Stop_ and _Update_ buttons on Strudel header).
4. **Exit Session**: When you're done, run: `:StrudelQuit` or close your browser/your Neovim window.

### Configuration

The plugin works out of the box with sensible defaults.  
The browser data is stored in `~/.cache/strudel-nvim/` (by default) for session persistence.

You can customize the plugin behavior by passing options to the setup function:

```lua
require("strudel").setup({
  -- Strudel web user interface related options
  ui = {
    -- Maximise the menu panel
    -- (optional, default: true)
    maximise_menu_panel = true,
    -- Hide the Strudel menu panel (and handle)
    -- (optional, default: false)
    hide_menu_panel = false,
    -- Hide the default Strudel top bar (controls)
    -- (optional, default: false)
    hide_top_bar = false,
    -- Hide the Strudel code editor
    -- (optional, default: false)
    hide_code_editor = false,
    -- Hide the Strudel eval error display under the editor
    -- (optional, default: false)
    hide_error_display = false,
  },
  -- Automatically start playback when launching Strudel
  -- (optional, default: true)
  start_on_launch = true,
  -- Set to `true` to automatically trigger the code evaluation after saving the buffer content
  -- Only works if the playback was already started (doesn't start the playback on save)
  -- (optional, default: false)
  update_on_save = false,
  -- Enable two-way cursor position sync between Neovim and Strudel editor
  -- (optional, default: true)
  sync_cursor = true,
  -- Report evaluation errors from Strudel as Neovim notifications
  -- (optional, default: true)
  report_eval_errors = true,
  -- Path to a custom CSS file to style the Strudel web editor (base64-encoded and injected at launch)
  -- This allows you to override or extend the default Strudel UI appearance
  -- (optional, default: nil)
  custom_css_file = "/path/to/your/custom.css",
  -- Headless mode: set to `true` to run the browser without launching a window
  -- (optional, default: false)
  headless = false,
  -- Path to the directory where Strudel browser user data (cookies, sessions, etc.) is stored
  -- (optional, default: `~/.cache/strudel-nvim/`)
  browser_data_dir = "~/.cache/strudel-nvim/",
  -- Path to a (chromium-based) browser executable of choice
  -- (optional, default: nil)
  browser_exec_path = "/path/to/browser/executable",
})
```

#### Hydra only config options

You can combine the following config options to only display the Hydra background.
It allows for easy screen projections during live performance for example.

```lua
require("strudel").setup({
  ui = {
      hide_menu_panel = true,
      hide_top_bar = true,
      hide_error_display = true,
      hide_code_editor = true,
      -- Set `hide_code_editor = false` if you want to overlay the code editor
  },
})
```

<p align="center">
  <img width="800" src="./docs/images/demo_hydra.png"><br>
</p>

### Commands & API

**Note:** All Lua functions are available via `local strudel = require("strudel")` after setup.

| Command              | Lua Function                | Description                                                      |
|----------------------|----------------------------|------------------------------------------------------------------|
| `:StrudelLaunch`     | `strudel.launch()` | Launch a Strudel browser session and start syncing the current buffer.     |
| `:StrudelQuit`       | `strudel.quit()`   | Quit the Strudel session and close the browser.        |
| `:StrudelToggle`     | `strudel.toggle()`      | Toggle playback (the _Play/Stop_ button) in the Strudel editor.               |
| `:StrudelUpdate`     | `strudel.update()`         | Trigger code evaluation (the _Update_ button) in the Strudel editor. It will start playback if not already started. |
| `:StrudelStop`       | `strudel.stop()`         | Stop playback in Strudel (calls `strudelMirror.stop()`). |
| `:StrudelSetBuffer`  | `strudel.set_buffer()`     | Change the buffer that is synced to Strudel (optionally by providing a buffer number, current buffer otherwise). |
| `:StrudelExecute`  | `strudel.execute()`     | Combo command: set current buffer and trigger _Update_. |

| Lua Function | Description |
|-|-|
| `strudel.is_launched()` | Returns `true` if the Strudel browser session is launched, `false` otherwise. |

### Keymaps

I would advise configuring the following Neovim Keymaps in your config:

```lua
local strudel = require("strudel")

vim.keymap.set("n", "<leader>sl", strudel.launch, { desc = "Launch Strudel" })
vim.keymap.set("n", "<leader>sq", strudel.quit, { desc = "Quit Strudel" })
vim.keymap.set("n", "<leader>st", strudel.toggle, { desc = "Strudel Toggle Play/Stop" })
vim.keymap.set("n", "<leader>su", strudel.update, { desc = "Strudel Update" })
vim.keymap.set("n", "<leader>ss", strudel.stop, { desc = "Strudel Stop Playback" })
vim.keymap.set("n", "<leader>sb", strudel.set_buffer, { desc = "Strudel set current buffer" })
vim.keymap.set("n", "<leader>sx", strudel.execute, { desc = "Strudel set current buffer and update" })
```

## How It Works

The plugin consists of two main components:

1. Lua Module (`lua/strudel/init.lua`) - Handles Neovim integration, buffer management, and remote communication with the JavaScript process.
2. JavaScript Process (`js/launch.js`) - Uses Puppeteer to control the browser, receives and sends commands, and interact with the Strudel web application.

### Communication Protocol

The Lua and JavaScript components communicate via stdin/stdout using a simple message protocol:

- `STRUDEL_CONTENT:<base64-content>` - Sync buffer content (sent both ways).
- `STRUDEL_QUIT` - Quit the Strudel session and close the browser.
- `STRUDEL_TOGGLE` - Toggle playback (play/stop) in Strudel.
- `STRUDEL_UPDATE` - Trigger the _Update_ button (evaluate code). Starts playback if not already started.
- `STRUDEL_STOP` - Stop playback in Strudel.
- `STRUDEL_REFRESH` - Trigger code evaluation only if already playing (used for update on save).
- `STRUDEL_READY` - Browser is ready (initialization complete).
- `STRUDEL_CURSOR:<row>:<col>` - Update the cursor position (row and column, 1-based).
- `STRUDEL_EVAL_ERROR:<base64-error>` - Sent from Strudel to Neovim to report an evaluation error.

### Synchronization

The plugin implements intelligent two-way synchronization:

- Neovim to Strudel - When the selected buffer's content changes, it trigger automatic updates to the Strudel editor.
- Strudel to Neovim - Changes in the Strudel editor are detected and synced back to the Neovim buffer.

Note on Loop Prevention - Base64 content comparison prevents infinite update loops (and new lines issues).

## Troubleshooting

- Browser doesn't open - Ensure Node.js and npm are properly installed.
- Permission errors - Ensure write permissions to the cache directory.
- Puppeteer error (`Cannot find module 'puppeteer'`) - see https://github.com/gruvw/strudel.nvim/issues/9.
- Whole buffer content gets highlighted - Probably caused by the [highlight-undo.nvim](https://github.com/tzachar/highlight-undo.nvim) plugin. Use the following config:
```lua
require("highlight-undo").setup({
  -- ...
  ignore_cb = function(buf)
    local name = vim.api.nvim_buf_get_name(buf)
    return name:match("%.str$") ~= nil
  end,
})
```

## Acknowledgments

This project would not be possible without the wonderful technologies below:

- [Strudel](https://strudel.cc/) - Web-based environment for live coding algorithmic patterns.
- [Hydra](https://github.com/hydra-synth/hydra) - Livecoding networked visuals in the browser.
- [Puppeteer](https://pptr.dev/) - Browser automation library and JavaScript API for Chrome and Firefox.
- [Neovim](https://neovim.io/) - Vim-fork focused on extensibility and usability.
