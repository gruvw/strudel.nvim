local base64 = require("strudel.base64")

local M = {}

local MESSAGES = {
  CONTENT = "STRUDEL_CONTENT:",
  STOP = "STRUDEL_STOP",
  PLAY_STOP = "STRUDEL_PLAY_STOP",
  UPDATE = "STRUDEL_UPDATE",
  READY = "STRUDEL_READY"
}

local STRUDEL_SYNC_AUTOCOMMAND = "StrudelSync"

-- State
local strudel_job_id = nil
local last_content = nil

local function send_message(message)
  if strudel_job_id then
    vim.fn.chansend(strudel_job_id, message .. "\n")
  else
    vim.notify("No active Strudel session", vim.log.levels.WARN)
  end
end

local function send_buffer_content(bufnr)
  if not strudel_job_id then
    return
  end

  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local content = table.concat(lines, "\n")
  local base64_content = base64.encode(content)

  if base64_content ~= last_content then
    last_content = base64_content
    send_message(MESSAGES.CONTENT .. base64_content)
  end
end

local function update_buffer_content(bufnr, content)
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
function M.launch_strudel()
  if strudel_job_id ~= nil then
    vim.notify("Strudel is already running, run :StrudelExit to quit.", vim.log.levels.ERROR)
    return
  end

  local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h:h")
  local launch_script = plugin_root .. "/js/launch.js"
  local bufnr = vim.api.nvim_get_current_buf()

  -- Run the js script
  strudel_job_id = vim.fn.jobstart("node " .. vim.fn.shellescape(launch_script), {
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
        -- Send initial buffer content once Strudel is ready
        send_buffer_content(bufnr)
      elseif full_data:match("^" .. MESSAGES.CONTENT) then
        local base64_content = full_data:sub(#MESSAGES.CONTENT + 1)
        if base64_content == last_content then
          return
        end

        last_content = base64_content

        local content = base64.decode(base64_content)
        update_buffer_content(bufnr, content)
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
      vim.api.nvim_clear_autocmds({ group = STRUDEL_SYNC_AUTOCOMMAND })
    end,
  })

  vim.api.nvim_create_augroup(STRUDEL_SYNC_AUTOCOMMAND, { clear = true })

  -- Set up autocommand to sync buffer changes
  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = STRUDEL_SYNC_AUTOCOMMAND,
    buffer = bufnr,
    callback = function()
      send_buffer_content(bufnr)
    end,
  })
end

function M.exit_strudel()
  send_message(MESSAGES.STOP)
end

function M.play_stop()
  send_message(MESSAGES.PLAY_STOP)
end

function M.update()
  send_message(MESSAGES.UPDATE)
end

function M.setup()
  -- Set filetype for .str files to javascript
  vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
    pattern = "*.str",
    callback = function()
      vim.bo.filetype = "javascript"
    end,
  })

  -- Commands
  vim.api.nvim_create_user_command("StrudelLaunch", M.launch_strudel, {})
  vim.api.nvim_create_user_command("StrudelExit", M.exit_strudel, {})
  vim.api.nvim_create_user_command("StrudelPlayStop", M.play_stop, {})
  vim.api.nvim_create_user_command("StrudelUpdate", M.update, {})
end

return M
