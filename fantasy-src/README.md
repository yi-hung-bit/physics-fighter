# 物理幻想：27 賢者戰紀 (Physics Fantasy)

結合經典《太空戰士》回合制攻防與 27 位物理學家（源自 Physics Fighter）的公式奧義對決遊戲。

## 特色
- **27 位物理學家陣容**：涵蓋經典九傑、古典力學、熱學、電磁學、光學與近代量子力學，每位賢者皆有專屬物理奧義、領域魔法、極限公式奧義與 Physgram 冷知識翻面卡。
- **純回合制攻防雙模式**：
  - **陣營輪流制**：我方全員依序出招或防禦後，再進入敵方攻勢階段。
  - **速度序列制**：依角色速度與加速／減速／延遲效果計算行動順序並預覽未來 6 步順位。
- **支援 3v3 小隊戰與 1v1 宿敵單挑**，搭配三大手繪風格舞台背景與 Web Audio 復古 JRPG 音效。

## 本機開發與建置

```bash
npm install
npm run dev
npm run build
```

## 部署至 GitHub Pages
專案已內建 `.github/workflows/deploy.yml` 並設定 Vite `base: './'`。推送至 GitHub 後，前往 Repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**，即可自動發布至 GitHub Pages。
