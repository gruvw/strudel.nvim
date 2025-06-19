local base64 = require("strudel.base64")

local M = {}

local MESSAGES = {
  CONTENT = "STRUDEL_CONTENT:",
  STOP = "STRUDEL_STOP",
  PLAY_STOP = "STRUDEL_PLAY_STOP",
  UPDATE = "STRUDEL_UPDATE",
  READY = "STRUDEL_READY",
  CURSOR = "STRUDEL_CURSOR:",
}

local STRUDEL_SYNC_AUTOCOMMAND = "StrudelSync"

-- Config
local user_browser_data_dir = nil
local maximise_menu_panel = true
local custom_css_b64 = nil
local update_on_save = false

-- State
local strudel_job_id = nil
local last_content = nil
local strudel_synced_bufnr = nil
local strudel_ready = false

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

  if base64_content ~= last_content then
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

    -- save current window view
    local view = vim.fn.winsaveview()

    -- Update buffer content
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)

    -- Restore window view
    vim.fn.winrestview(view)
  end)
end

-- Public API
function M.start()
  if strudel_job_id ~= nil then
    vim.notify("Strudel is already running, run :StrudelQuit to quit.", vim.log.levels.ERROR)
    return
  end

  local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h:h")
  local launch_script = plugin_root .. "/js/launch.js"
  local cmd = "node " .. vim.fn.shellescape(launch_script)

  if user_browser_data_dir then
    cmd = cmd .. " --user-data-dir=" .. vim.fn.shellescape(user_browser_data_dir)
  end
  if not maximise_menu_panel then
    cmd = cmd .. " --no-maximise-menu-panel"
  end
  if custom_css_b64 then
    cmd = cmd .. " --custom-css-b64=" .. vim.fn.shellescape(custom_css_b64)
  end

  -- Run the js script
  strudel_job_id = vim.fn.jobstart(cmd, {
    on_stderr = function(_, data)
      if not data then
        return
      end

      for _, line in ipairs(data) do
        if line ~= "" then
          vim.notify("Strudel Error: " .. line, vim.log.levels.ERROR)
        end
      end
    end,
    on_stdout = function(_, data)
      if not data then
        return
      end

      local full_data = table.concat(data, "\n")
      if full_data == "" then
        return
      end

      if full_data:match("^" .. MESSAGES.READY) then
        strudel_ready = true
        -- Send initial buffer content once Strudel is ready
        if strudel_synced_bufnr then
          send_buffer_content()
        end
      elseif full_data:match("^" .. MESSAGES.CONTENT) then
        local base64_content = full_data:sub(#MESSAGES.CONTENT + 1)
        if base64_content == last_content then
          return
        end

        last_content = base64_content

        local content = base64.decode(base64_content)
        if strudel_synced_bufnr and vim.api.nvim_buf_is_valid(strudel_synced_bufnr) then
          set_buffer_content(strudel_synced_bufnr, content)
        end
      end
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
    return
  end

  local bufnr = opts and opts.args and opts.args ~= "" and tonumber(opts.args) or vim.api.nvim_get_current_buf()
  if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then
    vim.notify("Invalid buffer number for StrudelSetBuffer", vim.log.levels.ERROR)
    return
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

  if update_on_save then
    vim.api.nvim_create_autocmd("BufWritePost", {
      group = STRUDEL_SYNC_AUTOCOMMAND,
      buffer = bufnr,
      callback = function()
        if strudel_job_id then
          M.update()
        end
      end,
    })
  end

  local buffer_name = vim.fn.bufname(bufnr)
  if buffer_name == "" then
    buffer_name = "#" .. bufnr
  end
  vim.notify("Strudel is now syncing buffer " .. buffer_name, vim.log.levels.INFO)
end

function M.setup(opts)
  opts = opts or {}
  user_browser_data_dir = opts.browser_data_dir
  if opts.maximise_menu_panel ~= nil then
    maximise_menu_panel = opts.maximise_menu_panel
  end
  if opts.custom_css_file then
    local css_path = opts.custom_css_file
    local f = io.open(css_path, "rb")
    if f then
      local css = f:read("*a")
      f:close()
      custom_css_b64 = base64.encode(css)
    else
      vim.notify("Could not read custom CSS file: " .. css_path, vim.log.levels.ERROR)
    end
  end
  if opts.update_on_save then
    update_on_save = opts.update_on_save
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
  vim.api.nvim_create_user_command("StrudelStart", M.start, {})
  vim.api.nvim_create_user_command("StrudelQuit", M.quit, {})
  vim.api.nvim_create_user_command("StrudelPlayStop", M.play_stop, {})
  vim.api.nvim_create_user_command("StrudelUpdate", M.update, {})
  vim.api.nvim_create_user_command("StrudelSetBuffer", M.set_buffer, { nargs = "?" })
end

return M
