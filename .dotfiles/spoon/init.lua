----------------------------------------------------------------------
-- Hammerspoon Configuration
-- Application Switching + Window Cycling + Right-Command Hotkeys
----------------------------------------------------------------------

----------------------------------------------------------------------
-- Helper: Load a Spoon and return its object
----------------------------------------------------------------------
local function Spoon(name)
    hs.loadSpoon(name)
    return spoon[name]
end

----------------------------------------------------------------------
-- Function: Cycle through an application's visible windows
----------------------------------------------------------------------
local function cycleApplicationWindows(app)
    local visibleWindows = app:visibleWindows()
    local trulyVisibleWindows = {}

    -- Filter out non-standard or hidden windows
    for _, win in ipairs(visibleWindows) do
        local isValid =
            win:isVisible() and
            win:subrole() == "AXStandardWindow"

        if isValid then
            table.insert(trulyVisibleWindows, win)
        end
    end

    -- Only cycle if there’s more than one visible window
    if #trulyVisibleWindows <= 1 then return end

    -- Sort windows by ID for deterministic cycling order
    table.sort(trulyVisibleWindows, function(a, b)
        return a:id() < b:id()
    end)

    local current = app:focusedWindow()
    local switched = false

    for _, win in ipairs(trulyVisibleWindows) do
        if win:id() > current:id() then
            win:focus()
            switched = true
            break
        end
    end

    -- If no later window, wrap around to the first one
    if not switched then
        trulyVisibleWindows[1]:focus()
    end
end

----------------------------------------------------------------------
-- Function: Activate or launch an app by bundle ID
-- If already frontmost, cycle through its windows instead
----------------------------------------------------------------------
local function activateOrLaunch(bundleID)
    local frontApp = hs.application.frontmostApplication()

    if frontApp and frontApp:bundleID() == bundleID then
        cycleApplicationWindows(frontApp)
    else
        hs.application.launchOrFocusByBundleID(bundleID)
    end
end

----------------------------------------------------------------------
-- Right Command Hotkeys (using LeftRightHotkey Spoon)
----------------------------------------------------------------------
local LR = Spoon("LeftRightHotkey")

-- Mapping: Right Command + key → App
local hotkeys = {
    a = "com.chabomakers.Antinote",
    c = "com.microsoft.teams2",
    d = "com.hnc.Discord",
    f = "com.apple.Finder",
    g = "com.openai.chat",
    m = "com.apple.Mail",
    n = "com.apple.Notes",
    o = "dev.kdrag0n.MacVirt",
    p = "com.jetbrains.PhpStorm",
    s = "com.apple.Safari",
    t = "com.apple.Terminal",
    v = "com.microsoft.VSCode",
}

for key, bundleID in pairs(hotkeys) do
    LR:bind({ "rCmd" }, key, function()
        activateOrLaunch(bundleID)
    end)
end

-- Start the spoon watcher
LR:start()