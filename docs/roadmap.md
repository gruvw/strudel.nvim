# Roadmap for strudel.nvim

## Features

- [x] Real-time two-way sync between Neovim buffer and Strudel editor
- [x] Playback control (play/stop, update) from Neovim
- [x] Session persistence (remembers browser state)
- [x] Swap synced buffer on the fly with a command
- [x] Automatic file type detection for `.str` files (JavaScript)
- [x] Simple installation and setup with lazy.nvim
- [x] Basic README documentation
- [X] Maximized menu panel behind a config flag
- [X] Provide a way to disable color updates of the file when content is set (caused by HighlightUndo plugin)
- [X] Send custom CSS file to the Strudel page (from Lua plugin config)
- [X] Support Strudel inline visualizations (currently clears them on content sync), change the update editor content system
- [X] Optionally auto trigger update command when saving the buffer
- [X] Hide Strudel top bar (by default)
- [X] Hide menu panel behind a config flag
- [X] Hide browser editor scrollbar
- [X] Hide code editor behind a config flag
- [X] Headless mode (no opened web browser, pure Neovim)
- [X] Hydra support
- [X] Chose and set an open-source license for the project
- [X] Report Strudel errors back to Neovim
- [X] Hide error display box behind a config flag
- [X] Disable code editor line background flashing when triggering evaluation
- [X] Update on save should only update when already playing, not starting/restarting playback when saving the file (create a new REFRESH message)
- [X] Fix fast typing messes with input in Neovim issue (use an event queue to sequentially process messages, at both ends)
- [X] Fix all weird messaging problems (wrong content, weird characters, looping, reactive resend, ...)
- [X] Persist cursor location across content update in Neovim and in Strudel editor
- [X] Strudel Stop message
- [X] Fix current line jumping to first line in strudel editor when changing content (use partial document updates)
- [X] Two way sync cursor position between Neovim and Strudel editor (behind config flag)
- [X] Start music playback on launch (configurable, opt out)
- [ ] Don't depend on the `https://strudel.cc` website, host locally
- [ ] LSP and auto completion with the strudel API
- [ ] JS LSP integration
- [ ] Code formatter
