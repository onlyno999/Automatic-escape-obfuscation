# 自动转义+混淆

把代码粘贴到 `abc.js`，手动运行 Actions，自动生成混淆好的 `_worker.js`。

## 用法

1. 把代码整份粘贴进 `abc.js`，保存提交。
2. 打开仓库的 **Actions** 页面，选择左侧「转义+混淆」，点 **Run workflow**。
3. 跑完后 `_worker.js` 会自动更新并提交，那就是处理好的成品。

## 它做了两步

1. **转义**：解析源码，只在字符串、模板、正则、变量名和注释里，把敏感词（vless / socks / cloudflare / proxyip / encryption / dingyue / 8.8.8.8 / CONNECT）逐字改成 `\uXXXX` 转义，含敏感词的注释整段删掉；含 `://` 的链接模板里 `:` 和 `@` 一并转义。代码含义一字不变。`import` 的模块名保持明文（照 onezun 在用的定版格式）。
2. **混淆**：用 javascript-obfuscator 处理，RC4 字符串数组＋拆串＋全局改名，参数与 onezun 线上定版一致。

本地也可以跑：`npm install` 后执行 `node scripts/transform.mjs abc.js _worker.js`。
