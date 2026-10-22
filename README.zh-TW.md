# TechTreeCard

[English](README.md) | 繁體中文

**不需要伺服器的 3D 技能樹名片,整張名片就在一條連結或一個 QR Code 裡。**

TechTreeCard 把你的技能、經歷、證照和正在探索的方向,畫成一張可以旋轉縮放的 3D 圖,再用一條網址分享出去。不用註冊帳號,沒有資料庫也沒有後端:名片資料壓縮後放在連結裡,你自己的名片則存在自己的瀏覽器。

## 功能

- **技能樹,不是文字履歷**:一個節點可以依賴多個節點,別人能看出你的技能怎麼互相支撐。
  - 分類:Skills(灰)、Experience(琥珀)、Credential(藍)、Exploring(紅)。
  - 重要度決定節點大小:Hello World、Production、Critical Dependency。
  - 標籤、詳細說明、標籤搜尋、2D / 3D 切換、力導向排版(可關閉物理效果)。
- **連結或 QR Code 分享**:名片壓進網址,對方打開連結就能看。
- **自己決定公開什麼**:分享前勾選要公開的欄位(姓名、單位、學歷、簡介、圖片網址、簡介連結、節點說明)。
- **名片夾**:把收到的名片存在本機,可搜尋、可用標籤篩選。就算原本連結失效,存下來的快照還能開。
- **JSON 匯入 / 匯出**。
- **預覽模式**:看看對方打開時的樣子。
- 深色 / 淺色主題,支援手機。

## 使用方式

1. 點**中心球體**編輯個人資料(姓名、單位、學歷、簡介、圖片網址、連結)。
2. 開啟 **☰ 選單**,用 **+ Node** 新增節點,再點節點編輯標題、分類、重要度、標籤和說明。
3. 在 *Dependencies* 清單裡,**按住 Ctrl(Mac 用 Cmd)再點**,可以讓節點連到多個父節點。
4. 按 **Share** 取得連結和 QR Code,按 **Cards** 開啟名片夾。

名片會自動存在這個瀏覽器(`localStorage`)。清除網站資料就會消失,請用 **Export** 備份。

## 執行

不需要建置,用任何靜態檔案伺服器開啟資料夾即可:

```bash
npx serve .
# 或
python -m http.server 8000
```

可以直接放到 GitHub Pages 或任何靜態空間。

分享連結是用頁面自己的網址產生的,所以從 `localhost` 或 `file://` 產生的連結,別人打不開。請從已部署的網頁分享。

## 分享原理

名片放進網址前會先縮小:

1. **精簡格式**:去掉長 key 和每個節點的長 id,父節點改用編號,座標四捨五入(排版會自己重新穩定)。
2. 用 **[ZipURL](https://github.com/citycafe578/ZipURL)** 壓縮。
3. **挑最短的編碼**:`zb`(壓縮後轉 base64,中文內容最短)、`z`(壓縮後直接放網址)、`c`(精簡後轉 base64,不需要函式庫)、`card`(舊格式,只負責讀取)。

產生連結前會先解壓縮驗證,確保不會做出內容有損的連結。

**限制**

- 連結超過 12,000 字元會被拒絕。
- QR Code 大約只能放 2.9KB。名片太大時,QR 會放精簡版(先去掉節點說明,再去掉標籤和簡介)並註明,完整內容永遠在連結裡。

## 名片檔案格式

匯出 / 可匯入的 JSON:

```jsonc
{
  "version": 1,
  "id": "did:local:…",
  "profile": { "name": "", "org": "", "edu": "", "intro": "", "imgUrl": "", "introUrl": "" },
  "nodes": [
    {
      "id": "node_1760000000000_1",
      "parentIds": ["center"],          // "center" 或其他節點 id
      "title": "LiteRTOS",
      "desc": "details…",
      "tags": ["rtos", "avr"],
      "category": "experience",         // skill | experience | credential | explore
      "level": 3,                       // 1 | 2 | 3
      "x": 0, "y": 0, "z": 0
    }
  ],
  "updatedAt": "2026-10-22T00:00:00.000Z"
}
```

`ssi-card-sample.json` 是可以匯入的範例名片。

## 專案結構

| 檔案 | 用途 |
|------|---------|
| `index.html` | 介面:選單、節點 / 個人資料面板、名片夾、匯入與 QR 視窗 |
| `style.css` | 樣式與主題 |
| `animation.js` | Three.js 場景、節點、連線、力導向排版、互動 |
| `script.js` | 名片資料、儲存、分享 / 編碼、名片夾、匯入 / 匯出 |
| `ssi-card-sample.json` | 範例名片 |

## 相依套件

從 CDN 載入(不需要安裝):

- [Three.js](https://threejs.org/) r128 + OrbitControls
- [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) 1.5.0
- [ZipURL](https://github.com/citycafe578/ZipURL), 固定在特定 commit

## 關於「SSI」

每張名片有本機產生的 `did:local:…` 身分 ID,概念上是自主身分:名片由自己持有,中間沒有平台。但它**還不是**完整的 SSI 系統,名片沒有簽章,對方無法驗證技能或證照是否屬實。

## 規劃中

- 名片簽章,以及讓 *Credential* 節點連結可驗證憑證
- 把函式庫改成本地載入,不再依賴 CDN
- 補上截圖或展示
