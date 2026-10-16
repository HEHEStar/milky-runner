# 🐸 奶蛙跑酷 · Milky Frog Run

一个类似《地铁跑酷》的三跑道跑酷游戏，**双人联网竞技**，可打包成**安卓 APK**。
角色为**原创奶萌小青蛙**（纯 Canvas 代码绘制，圆滚滚 + 大眼睛 + 腮红 + 奶嘴），规避版权问题。

---

## ✨ 特性

- 🎮 三跑道跑酷：左右换道、上跳、下滑
- 🪙 收集金币、躲避障碍（方块要跳、横杆要滑）
- 👥 双人联网对战：输入相同房间号即可同房竞技，实时看到对手位置和分数
- 📶 断线自动重连
- 📱 触屏滑动 + 点击操作区，桌面支持键盘（← → ↑ ↓ / WASD）
- 🟢 纯前端 + Node.js WebSocket，安卓 APK 用 Capacitor 打包
- 🚀 服务器可用 Render 免费一键部署

---

## 📁 目录结构

```
milky-runner/
├── www/                    # 游戏本体（浏览器 / APK 通用）
│   ├── index.html
│   ├── style.css
│   ├── frog.js             # 原创奶萌角色绘制
│   ├── engine.js           # 跑酷核心引擎
│   ├── net.js              # WebSocket 客户端
│   └── ui.js               # 界面与输入
├── server/                 # 对战服务器
│   ├── server.js
│   ├── package.json
│   └── render.yaml         # Render 免费一键部署配置
├── capacitor.config.json
├── package.json
└── README.md
```

---

## 🎮 第一步：先在电脑上试玩（可选但推荐）

**1. 启动对战服务器**
```bash
cd server
npm install
npm start
# 输出：🐸 奶蛙跑酷对战服务器已启动: http://localhost:3000
```

**2. 启动游戏网页**
```bash
# 回到项目根目录
npm install
npm run serve
# 打开 http://localhost:8080
```

**3. 本地测试双人**：开两个浏览器标签页，都点「联网对战」，输入相同房间号（如 `8888`），即可看到两个玩家。

> 想让另一台电脑/手机连你？把服务器地址填成 `ws://你的电脑局域网IP:3000`（如 `ws://192.168.1.5:3000`），在「服务器设置」里保存即可。

---

## 🌐 第二步：部署公网服务器（免费，5 分钟）

公网对战必须有服务器。用 **Render 免费档**，步骤如下：

### 1. 上传代码到 GitHub
在 GitHub 新建一个仓库，把整个 `milky-runner` 项目推上去（或用 GitHub 网页上传）。

### 2. 在 Render 部署
1. 打开 https://render.com ，用 **GitHub 账号登录**
2. 点 **New → Web Service**
3. 选择你刚建的仓库
4. 配置（Render 通常会自动识别 `render.yaml`）：
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. 点 **Create Web Service**，等待 1–2 分钟部署完成
6. 部署后你会拿到一个地址，例如：
   ```
   https://milky-runner-server.onrender.com
   ```
   **游戏里要填的 WebSocket 地址是 `wss://` 开头**：
   ```
   wss://milky-runner-server.onrender.com
   ```

> 💡 Free 实例闲置 15 分钟会休眠，第一次访问需要等约 30 秒唤醒，属正常现象。

> 也可用 Railway / Glitch / Koyeb 等，逻辑相同：Root 目录 `server`，`npm install` + `npm start`。

---

## 📱 第三步：打包成安卓 APK

### 前置要求
- 安装 **Node.js 18+**
- 安装 **Android Studio**（含 Android SDK，打包必需）
- 配置好 `ANDROID_HOME` 环境变量（Android Studio 首次安装会引导）

### 打包步骤

```bash
# 1. 在项目根目录安装依赖
npm install

# 2. 添加安卓平台（只需第一次）
npx cap add android

# 3. 把 www 里的游戏同步到安卓工程
npx cap sync

# 4. 用 Android Studio 打开
npx cap open android
```

在 **Android Studio** 中：
- 菜单 **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- 等待编译完成，点击 **locate** 找到 APK
- 位置：`android/app/build/outputs/apk/debug/app-debug.apk`

把这个 `app-debug.apk` 传到安卓手机安装即可（需在手机上允许「安装未知来源应用」）。

> 需要正式发布签名版 APK：Android Studio 里 **Build → Generate Signed Bundle / APK**。

---

## 🔧 使用说明

1. 第一次打开游戏，点 **「服务器设置」**，填入你部署的地址：
   ```
   wss://milky-runner-server.onrender.com
   ```
   点保存（地址会记住）。
2. 返回菜单，点 **「联网对战」**。
3. 输入**昵称**和**房间号**（两人输入同一个房间号，如 `8888`），点「进入房间」。
4. 两人都进入后，自动 3-2-1 倒计时开始。
5. 目标：跑完 9000 距离，或比对手活得久。撞到障碍即结束。

**操作**
- 左右滑动 / 点屏幕左右两侧 → 换道
- 上滑 / 点上方 → 跳跃
- 下滑 / 点下方 → 下滑
- 键盘（桌面）：← → ↑ ↓ 或 WASD

---

## 🎨 换成你自己的角色

角色在 `www/frog.js`，函数 `drawFrog(ctx, x, y, size, opt)`。
- `THEMES.player` / `THEMES.rival` 控制两种配色。
- 想换成别的萌宠，改这个文件即可，引擎会自动调用。

---

## ⚠️ 版权提醒

本项目角色为**原创绘制**。请勿将网络上受版权保护的卡通形象（如某些知名 IP）直接替换进游戏用于商业发布，以免侵权。

---

## 🐛 常见问题

| 问题 | 解决 |
|---|---|
| 连接超时 / 无法连接 | 检查服务器地址是否为 `wss://` 开头；Render 免费实例休眠需等 30 秒 |
| 房主一直等不到人 | 确认两人**房间号完全相同**（区分大小写） |
| APK 安装后无法联网 | `capacitor.config.json` 已开启 `cleartext`；若用 `ws://` 明文，Android 9+ 需允许，正式环境请用 `wss://` |
| 打包报错找不到 SDK | 安装 Android Studio 并设置 `ANDROID_HOME` |
| 画面卡顿 | 引擎已限制 DPR≤2；低端机可把 `www/engine.js` 里 `baseSpeed` 降低 |

---

祝你玩得开心！🐸💨
