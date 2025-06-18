local base64 = require("strudel.base64")

local M = {}

-- Get the plugin root directory
local function get_plugin_root()
    return vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h:h")
end

-- Store the job ID of the Node.js process
local strudel_job_id = nil

-- Store the last base64 content we sent to avoid loops
local last_base64_content = nil

-- Function to sync buffer content
local function sync_buffer_content(bufnr)
    if strudel_job_id then
        local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
        local content = table.concat(lines, "\n")
        -- Encode content as base64
        local base64_content = base64.encode(content)
        -- Only send if base64 content has changed
        if base64_content ~= last_base64_content then
            last_base64_content = base64_content
            vim.fn.chansend(strudel_job_id, "STRUDEL_CONTENT:" .. base64_content .. "\n")
        end
    end
end

-- Function to update buffer from Strudel
local function update_buffer_from_strudel(bufnr, base64_content)
        -- Decode base64 content
        local content = base64.decode(base64_content)
        -- Split content into lines, handling empty string case
        local lines = {}
        if content ~= "" then
            lines = vim.split(content, "\n")
        end
        
        -- Schedule the buffer update to avoid "E565: Not allowed here"
        vim.schedule(function()
            -- Ensure the buffer still exists
            if vim.api.nvim_buf_is_valid(bufnr) then
                -- Get the current window view
                local win = vim.fn.winnr()
                local view = vim.fn.winsaveview()
                
                -- Update buffer content
                vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
                
                -- Restore window view
                vim.fn.winrestview(view)
            end
        end)
end

-- Function to launch Strudel
function M.launch_strudel()
    local plugin_root = get_plugin_root()
    local launch_script = plugin_root .. "/launch.js"
    local bufnr = vim.api.nvim_get_current_buf()
    
    -- Run the Node.js script
    strudel_job_id = vim.fn.jobstart("node " .. vim.fn.shellescape(launch_script), {
        on_stderr = function(_, data)
            if data then
                for _, line in ipairs(data) do
                    if line ~= "" then
                        vim.notify("Strudel Error: " .. line, vim.log.levels.ERROR)
                    end
                end
            end
        end,
        on_stdout = function(_, data)
            if data then
                -- Join all data lines to handle multiline content
                local full_data = table.concat(data, "\n")
                
                if full_data:match("^STRUDEL_READY") then
                    -- Send initial buffer content once Strudel signals it's ready
                    sync_buffer_content(bufnr)
                elseif full_data:match("^STRUDEL_CONTENT:") then
                    -- Extract base64 content after the prefix
                    if (base64_content ~= last_base64_content) then
                        last_base64_content = base64_content
                        local base64_content = full_data:sub(#"STRUDEL_CONTENT:" + 1)
                        update_buffer_from_strudel(bufnr, base64_content)
                    end
                end
            end
        end,
        on_exit = function(_, code)
            if code == 0 then
                vim.notify("Strudel session closed", vim.log.levels.INFO)
            else
                vim.notify("Strudel window error: " .. code, vim.log.levels.ERROR)
                vim.notify("Strudel window error: " .. code, vim.log.levels.ERROR)
            end
            strudel_job_id = nil
            last_base64_content = nil
            vim.api.nvim_clear_autocmds({ group = "StrudelSync" })
        end,
    })

    -- Create an autocommand group for Strudel sync
    vim.api.nvim_create_augroup("StrudelSync", { clear = true })
    
    -- Set up autocommand to sync buffer changes
    vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
        group = "StrudelSync",
        buffer = bufnr,
        callback = function()
            sync_buffer_content(bufnr)
        end,
    })
end

-- Function to exit Strudel
function M.exit_strudel()
    if strudel_job_id then
        -- Send stop message to Node.js process
        vim.fn.chansend(strudel_job_id, "STRUDEL_STOP\n")
    else
        vim.notify("No active Strudel session", vim.log.levels.WARN)
    end
end

-- Setup function
function M.setup()
    vim.api.nvim_create_user_command("StrudelLaunch", function()
        M.launch_strudel()
    end, {})
    
    vim.api.nvim_create_user_command("StrudelExit", function()
        M.exit_strudel()
    end, {})
end

return M 