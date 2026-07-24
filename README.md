# 执业工作台（coaching-workbench）

一个人的执业系统：教练日志 · 创作火花 · 每日罗盘 · 进度地图。
单文件 React 组件（`workbench.jsx`），配合 Claude.ai 的 artifact 渲染 + 内置的持久化存储（`window.storage`）跑起来，不需要单独的后端。
```
   git diff                     # 看清楚具体改了什么，跟你的描述对不对得上
   git add -A
   git commit -m "加：教练日志按标签筛选"
   git push
```
任何时候想回到某个旧版本：`git log --oneline` 看历史，`git checkout <commit号> -- workbench.jsx` 把某个版本的文件单独取回来，或者 `git revert` 撤销某次改动。

这样"新版本和旧版本差多少"这件事，`git diff` 会直接告诉你，不用靠我口头保证。

## 后续可能的方向

- 如果以后想给其他教练/coach也用：这个仓库结构已经可以直接支持——独立文件、有版本历史、别人 fork 一份改自己的存储 key 就能用。
- 如果想脱离 Claude.ai 单独部署（比如自己的域名），需要把 `window.storage` 换成真实的后端存储（比如 Supabase / Firebase），这是另一件事，到时候单独聊。
