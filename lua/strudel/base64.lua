local M = {}

-- Base64 encoding table
local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

-- Function to encode a string to base64
function M.encode(data)
  return ((data:gsub(".", function(x)
    local r, b = "", x:byte()
    for i = 8, 1, -1 do r = r .. (b % 2 ^ i - b % 2 ^ (i - 1) > 0 and "1" or "0") end
    return r;
  end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
    if (#x < 6) then return "" end
    local c = 0
    for i = 1, 6 do c = c + (x:sub(i, i) == "1" and 2 ^ (6 - i) or 0) end
    return alphabet:sub(c + 1, c + 1)
  end) .. ({ "", "==", "=" })[#data % 3 + 1])
end

-- Function to decode a base64 string
function M.decode(data)
  data = string.gsub(data, "[^" .. alphabet .. "=]", "")
  return (data:gsub(".", function(x)
    if (x == "=") then return "" end
    local r, f = "", (alphabet:find(x) - 1)
    for i = 6, 1, -1 do r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and "1" or "0") end
    return r;
  end):gsub("%d%d%d?%d?%d?%d?%d?%d?", function(x)
    if (#x ~= 8) then return "" end
    local c = 0
    for i = 1, 8 do c = c + (x:sub(i, i) == "1" and 2 ^ (8 - i) or 0) end
    return string.char(c)
  end))
end

return M
