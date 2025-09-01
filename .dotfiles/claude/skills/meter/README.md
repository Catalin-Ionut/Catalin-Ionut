# meter

A Claude Code mod based on [sub-meter](https://github.com/midudev/better-claude/tree/master/plugins/sub-meter) by midudev (MIT).
It shows the model, the reasoning effort, the context window and the subscription usage at the bottom right, on the same row as the permission mode.

```text
⏵⏵ auto mode on       opus 5.5 ●●●○○   cache ━━━━━━─ 96%   ctx ━━━──── 31%   5h ━━━━━── 58%   wk ━━──── 22%
```

- The model is the one the last request used, or the `/model` setting before the first request and after it changes. With `opusplan` that is Opus in plan mode and Sonnet otherwise.
- Effort dots: low ●○○○○, medium ●●○○○, high ●●●○○, xhigh ●●●●○, max ●●●●●. They take the `/effort` picker's colors: low yellow, medium green, high blue, xhigh a shimmer sweeping over purple, max a moving rainbow. The animation runs only at xhigh and max, and uses the ANSI colors under an `-ansi` theme. The effort is the one the last request used, or `effortLevel` from settings before the first request and after a model change. A model without effort shows no dots.
- `cache` is the share of the last request's input the prompt cache served. Its colors run the other way: green from 80%, yellow from 40%, red below. A low value on a large context means that request paid full price for it, after a long pause, a model change, a `CLAUDE.md` or tool change, or `/compact`. It shows after the first response, and again after the first response that follows a `/model` switch or a `/clear`.
- The 5-hour and weekly (`wk`) windows show side by side. Set `display` in `/config` to `session` or `week` to keep only one.
- Sessions share the last reading. A window past its reset time shows 0% until a new response reports it.
- Bars and their percentages are green up to 50%, yellow up to 75% and red above that. The mod shows no reset countdowns.
- When the row is too short, the mod removes the bars first, then the `cache`, `wk`, `5h` and `ctx` meters one at a time, then the model, then the complete meter. The effort animation pauses while the dots are hidden.
- It hides `(shift+tab to cycle)` and `esc to interrupt` to make room (`hideCycleHint`, `hideInterruptHint`).

`claude plugin validate .` and `claude plugin test .` check the mod.

MIT licensed. See [LICENSE](LICENSE), which keeps the upstream copyright notice.
