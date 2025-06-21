local base64 = require("strudel.base64")

local M = {}

local MESSAGES = {
  CONTENT = "STRUDEL_CONTENT:",
  STOP = "STRUDEL_STOP",
  PLAY_STOP = "STRUDEL_PLAY_STOP",
  UPDATE = "STRUDEL_UPDATE",
  REFRESH = "STRUDEL_REFRESH",
  READY = "STRUDEL_READY",
  CURSOR = "STRUDEL_CURSOR:",
  EVAL_ERROR = "STRUDEL_EVAL_ERROR:",
}

local STRUDEL_SYNC_AUTOCOMMAND = "StrudelSync"
local SUCCESSIVE_CMD_DELAY = 100

-- State
local strudel_job_id = nil
local last_content = nil
local strudel_synced_bufnr = nil
local strudel_ready = false
local custom_css_b64 = nil

-- Event queue for sequential message processing
local event_queue = {}
local is_processing_event = false

-- Config with default options
local config = {
  ui = {
    hide_top_bar = true,
    maximise_menu_panel = true,
    hide_menu_panel = false,
    hide_code_editor = false,
    hide_error_display = false,
    custom_css_file = nil,
  },
  report_eval_errors = true,
  update_on_save = false,
  headless = false,
  browser_data_dir = nil,
}

local function send_message(message)
  if strudel_job_id then
    vim.fn.chansend(strudel_job_id, message .. "\n")
  else
    vim.notify("No active Strudel session", vim.log.levels.WARN)
  end
end

local function send_cursor_position()
  if not strudel_job_id or not strudel_synced_bufnr or not strudel_ready then
    return
  end
  if not vim.api.nvim_buf_is_valid(strudel_synced_bufnr) then
    return
  end

  local pos = vim.api.nvim_win_get_cursor(0)
  local line = pos[1]
  local col = pos[2]
  local lines = vim.api.nvim_buf_get_lines(0, 0, line, false)
  local char_offset = 0

  for i = 1, line - 1 do
    char_offset = char_offset + #lines[i] + 1
  end
  char_offset = char_offset + col

  send_message(MESSAGES.CURSOR .. char_offset)
end

local function send_buffer_content()
  if not strudel_job_id or not strudel_synced_bufnr or not strudel_ready then
    return
  end
  if not vim.api.nvim_buf_is_valid(strudel_synced_bufnr) then
    return
  end

  local lines = vim.api.nvim_buf_get_lines(strudel_synced_bufnr, 0, -1, false)
  local content = table.concat(lines, "\n")
  local base64_content = base64.encode(content)

  if base64_content ~= last_content and not is_processing_event then
    last_content = base64_content
    send_message(MESSAGES.CONTENT .. base64_content)
  end
end

local function set_buffer_content(bufnr, content)
  local lines = {}
  if content ~= "" then
    lines = vim.split(content, "\n")
  end

  vim.schedule(function()
    if not vim.api.nvim_buf_is_valid(bufnr) then
      return
    end

    -- save current window view (persist cursor location across content update)
    local view = vim.fn.winsaveview()
    -- Update buffer content
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
    -- Restore window view
    vim.fn.winrestview(view)
  end)
end

local function handle_event(full_data)
  if full_data:match("^" .. MESSAGES.READY) then
    strudel_ready = true
    if strudel_synced_bufnr then
      send_buffer_content()
    end
  elseif full_data:match("^" .. MESSAGES.CONTENT) then
    local content_b64 = full_data:sub(#MESSAGES.CONTENT + 1)
    if content_b64 == last_content then
      return
    end
    last_content = content_b64
    if strudel_synced_bufnr and vim.api.nvim_buf_is_valid(strudel_synced_bufnr) then
      local content = base64.decode(content_b64)
      set_buffer_content(strudel_synced_bufnr, content)
    end
  elseif full_data:match("^" .. MESSAGES.EVAL_ERROR) then
    local error_b64 = full_data:sub(#MESSAGES.EVAL_ERROR + 1)
    local error = base64.decode(error_b64)
    if config.report_eval_errors then
      vim.schedule(function()
        vim.notify("Strudel Error: " .. error, vim.log.levels.ERROR)
      end)
    end
  end
end

local function process_event_queue()
  if is_processing_event then
    return
  end

  is_processing_event = true

  vim.schedule(function()
    while #event_queue > 0 do
      local message = table.remove(event_queue, 1)
      handle_event(message)
    end

    is_processing_event = false
  end)
end

-- Public API
function M.setup(opts)
  opts = opts or {}
  config = vim.tbl_deep_extend("force", config, opts)

  -- Load custom CSS content and base64 encode it
  local css_path = config.custom_css_file
  if css_path then
    local f = io.open(css_path, "rb")
    if f then
      local css = f:read("*a")
      f:close()
      custom_css_b64 = base64.encode(css)
    else
      vim.notify("Could not read custom CSS file: " .. css_path, vim.log.levels.ERROR)
    end
  end

  -- Create autocmd group
  vim.api.nvim_create_augroup(STRUDEL_SYNC_AUTOCOMMAND, { clear = true })

  -- Set file type for .str files to JavaScript
  vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
    pattern = "*.str",
    callback = function()
      vim.bo.filetype = "javascript"
    end,
  })

  -- Commands
  vim.api.nvim_create_user_command("StrudelLaunch", M.launch, {})
  vim.api.nvim_create_user_command("StrudelQuit", M.quit, {})
  vim.api.nvim_create_user_command("StrudelPlayStop", M.play_stop, {})
  vim.api.nvim_create_user_command("StrudelUpdate", M.update, {})
  vim.api.nvim_create_user_command("StrudelSetBuffer", M.set_buffer, { nargs = "?" })
  vim.api.nvim_create_user_command("StrudelExecute", M.execute, {})
end

function M.launch()
  if strudel_job_id ~= nil then
    vim.notify("Strudel is already running, run :StrudelQuit to quit.", vim.log.levels.ERROR)
    return
  end

  local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h:h")
  local launch_script = plugin_root .. "/js/launch.js"
  local cmd = "node " .. vim.fn.shellescape(launch_script)

  if config.ui.hide_top_bar then
    cmd = cmd .. " --hide-top-bar"
  end
  if config.ui.maximise_menu_panel then
    cmd = cmd .. " --maximise-menu-panel"
  end
  if config.ui.hide_menu_panel then
    cmd = cmd .. " --hide-menu-panel"
  end
  if config.ui.hide_code_editor then
    cmd = cmd .. " --hide-code-editor"
  end
  if config.ui.hide_error_display then
    cmd = cmd .. " --hide-error-display"
  end
  if custom_css_b64 then
    cmd = cmd .. " --custom-css-b64=" .. vim.fn.shellescape(custom_css_b64)
  end
  if config.headless then
    cmd = cmd .. " --headless"
  end
  if config.browser_data_dir then
    cmd = cmd .. " --user-data-dir=" .. vim.fn.shellescape(config.browser_data_dir)
  end

  -- Run the js script
  strudel_job_id = vim.fn.jobstart(cmd, {
    on_stderr = function(_, data)
      if not data then
        return
      end

      for _, line in ipairs(data) do
        if line ~= "" then
          vim.notify("Strudel Process Error: " .. line, vim.log.levels.ERROR)
        end
      end
    end,
    on_stdout = function(_, data)
      if not data then
        return
      end

      for _, line in ipairs(data) do
        if line ~= "" then
          table.insert(event_queue, line)
        end
      end

      process_event_queue()
    end,
    on_exit = function(_, code)
      if code == 0 then
        vim.notify("Strudel session closed", vim.log.levels.INFO)
      else
        vim.notify("Strudel process error: " .. code, vim.log.levels.ERROR)
      end

      -- reset state
      strudel_job_id = nil
      last_content = nil
      strudel_synced_bufnr = nil
      strudel_ready = false
    end,
  })

  M.set_buffer()
end

function M.quit()
  send_message(MESSAGES.STOP)
end

function M.play_stop()
  send_message(MESSAGES.PLAY_STOP)
end

function M.update()
  send_message(MESSAGES.UPDATE)
end

function M.set_buffer(opts)
  vim.api.nvim_clear_autocmds({ group = STRUDEL_SYNC_AUTOCOMMAND })

  if not strudel_job_id then
    vim.notify("No active Strudel session", vim.log.levels.WARN)
    return false
  end

  local bufnr = opts and opts.args and opts.args ~= "" and tonumber(opts.args) or vim.api.nvim_get_current_buf()
  if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then
    vim.notify("Invalid buffer number for :StrudelSetBuffer", vim.log.levels.ERROR)
    return false
  end

  strudel_synced_bufnr = bufnr
  send_buffer_content()

  -- Set up autocommand to sync buffer changes
  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = STRUDEL_SYNC_AUTOCOMMAND,
    buffer = bufnr,
    callback = function()
      if strudel_synced_bufnr then
        send_buffer_content()
      end
    end,
  })

  -- Set up autocommand to sync cursor position
  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
    group = STRUDEL_SYNC_AUTOCOMMAND,
    buffer = bufnr,
    callback = function()
      send_cursor_position()
    end,
  })

  -- Set up autocommand to update on save
  if config.update_on_save then
    vim.api.nvim_create_autocmd("BufWritePost", {
      group = STRUDEL_SYNC_AUTOCOMMAND,
      buffer = bufnr,
      callback = function()
        if strudel_job_id then
          -- Use the REFRESH message to update only when already playing
          send_message(MESSAGES.REFRESH)
        end
      end,
    })
  end

  local buffer_name = vim.fn.bufname(bufnr)
  if buffer_name == "" then
    buffer_name = "#" .. bufnr
  end
  vim.notify("Strudel is now syncing buffer " .. buffer_name, vim.log.levels.INFO)

  return true
end

-- Combo command to set the current buffer and trigger update
function M.execute()
    local ok = M.set_buffer()
    if ok then
      vim.defer_fn(function()
        M.update()
      end, SUCCESSIVE_CMD_DELAY)
  end
end

return M
