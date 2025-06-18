# Strudel.nvim

A Neovim plugin that opens [Strudel](https://strudel.cc/) in your web browser using Puppeteer.

## Requirements

- Neovim >= 0.5.0
- Node.js and npm installed

## Installation

Using [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{
    "gruvw/strudel.nvim",
    config = function()
            require("strudel").setup()
    end,
    build = "npm install"
}
```

## Usage

The plugin provides one command:

- `:StrudelLaunch` - Opens Strudel website in your default browser

## License

MIT 
