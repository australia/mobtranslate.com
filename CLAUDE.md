# MobTranslate.com

## Project Overview
Next.js 14 (App Router) web app for Indigenous Australian language dictionaries. Uses `@mobtranslate/ui` design system, Tailwind CSS, Supabase, and Vercel AI SDK.

## Dev Commands
- `pnpm dev` — Start dev server (port 3000)
- `pnpm build` — Production build
- `pnpm lint` — Lint check
- `turbo run dev --parallel --continue` — Run full monorepo

## Key Routes
| Route | Description |
|---|---|
| `/` | Home — translator with available dictionaries |
| `/dictionaries/[language]` | Dictionary browse/search |
| `/learn/[dictionary]` | Learning/quiz features |
| `/stats/[dictionary]` | Language statistics |
| `/curator/` | Curator dashboard (approved, pending, rejected, comments) |
| `/admin/` | Admin panel (users, analytics, languages, dictionary-sync) |
| `/chat/` | AI chat interface |
| `/about/` | About page |
| `/leaderboard/` | User leaderboard |
| `/settings/` | User settings |
| `/styleguide/` | Component showcase — use this to review the design system |
| `/auth/signin` | Sign in |
| `/auth/signup` | Sign up |

## Visual Review with agent-browser

agent-browser (v0.10.0) is installed for browser automation. Use it to screenshot pages, inspect layouts, and iterate on designs without leaving the terminal.

### Quick Reference

```bash
# Open a page
agent-browser open http://localhost:3000

# Screenshot the current page
agent-browser screenshot                     # saves to temp file
agent-browser screenshot page.png            # saves to specific path
agent-browser screenshot --full page.png     # full-page scrollable capture

# Get page structure (accessibility tree with element refs)
agent-browser snapshot                       # full tree
agent-browser snapshot -i                    # interactive elements only
agent-browser snapshot -c                    # compact output
agent-browser snapshot -d 3                  # limit depth to 3 levels

# Interact with elements using refs from snapshot
agent-browser click @e2
agent-browser fill @e5 "search term"
agent-browser type @e3 "hello"
agent-browser hover @e1

# Semantic element finding (no CSS selectors needed)
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@example.com"
agent-browser find placeholder "Search..." fill "wajarri"

# Viewport and device emulation
agent-browser set viewport 1440 900          # desktop
agent-browser set viewport 390 844           # mobile
agent-browser set device "iPhone 14"
agent-browser set media dark                 # dark mode
agent-browser set media light                # light mode

# Wait for content
agent-browser wait --load networkidle        # wait for page to settle
agent-browser wait --text "Results"          # wait for text to appear
agent-browser wait 2000                      # wait 2 seconds

# Navigation
agent-browser back
agent-browser forward
agent-browser reload

# Scroll
agent-browser scroll down 500
agent-browser scroll up 300
agent-browser scrollintoview @e10

# Tabs
agent-browser tab new http://localhost:3000/styleguide
agent-browser tab                            # list tabs
agent-browser tab 0                          # switch to first tab

# Close
agent-browser close
```

### Design Iteration Workflow

When reviewing or iterating on a design:

1. **Start the dev server** if not running: `pnpm dev`
2. **Open the page** under review:
   ```bash
   agent-browser open http://localhost:3000/styleguide
   agent-browser wait --load networkidle
   ```
3. **Screenshot for review**:
   ```bash
   agent-browser screenshot --full /tmp/styleguide-desktop.png
   agent-browser set viewport 390 844
   agent-browser screenshot --full /tmp/styleguide-mobile.png
   agent-browser set viewport 1440 900
   ```
4. **Inspect specific elements** using snapshot + refs:
   ```bash
   agent-browser snapshot -i
   agent-browser click @e3        # navigate to a section
   agent-browser screenshot /tmp/section-detail.png
   ```
5. **Test dark mode**:
   ```bash
   agent-browser set media dark
   agent-browser screenshot /tmp/page-dark.png
   agent-browser set media light
   ```
6. **After making code changes**, reload and re-screenshot:
   ```bash
   agent-browser reload
   agent-browser wait --load networkidle
   agent-browser screenshot --full /tmp/after-changes.png
   ```

### Multi-Page Review

Screenshot several pages in sequence for a broad design audit:

```bash
agent-browser open http://localhost:3000
agent-browser wait --load networkidle
agent-browser screenshot --full /tmp/review-home.png

agent-browser open http://localhost:3000/styleguide
agent-browser wait --load networkidle
agent-browser screenshot --full /tmp/review-styleguide.png

agent-browser open http://localhost:3000/about
agent-browser wait --load networkidle
agent-browser screenshot --full /tmp/review-about.png

agent-browser open http://localhost:3000/leaderboard
agent-browser wait --load networkidle
agent-browser screenshot --full /tmp/review-leaderboard.png
```

### Session Management

For authenticated pages (admin, curator, settings), save and reuse auth state:

```bash
# After logging in manually or via automation:
agent-browser state save /tmp/auth-state.json

# Restore for future sessions:
agent-browser state load /tmp/auth-state.json
agent-browser open http://localhost:3000/admin
```

### Debugging Visuals

```bash
agent-browser highlight @e5                  # visually highlight an element
agent-browser get box @e5                    # get element bounding box
agent-browser get text @e5                   # get element text content
agent-browser eval "getComputedStyle(document.querySelector('.btn')).color"
agent-browser console                        # view console messages
agent-browser errors                         # view JS errors
```

### Tips
- Screenshots saved to `/tmp/` can be read directly by Claude Code for visual feedback
- Use `snapshot -i` to get only interactive elements — keeps output small
- The `--full` flag on screenshot captures below-the-fold content
- Use `wait --load networkidle` after navigation to ensure page is fully rendered
- Element refs (`@e1`, `@e2`) are stable within a snapshot but reset on new snapshots
- Use `set device "iPhone 14"` for quick mobile testing instead of manual viewport sizes
