# 《股路不归》第 1 集｜逐鏡拍攝腳本（40 鏡 / 180 秒 / 可直接投喂）

> 片名：第 1 集〈刀已入手〉
> 對應劇本：第一篇〈黃土歸城・人工坐莊〉第 1 集（冷面殺手修訂版）
> 規格：9:16，1080×1920，24fps，−16 LUFS
> 結構：12 段 → 40 鏡，平均 4.6 秒／鏡
> 鐵律：**AI 只生成畫面。所有文字、數字、UI、字幕，一律後期合成。**

---

## 一、先跑這 5 張定妝（沒有這 5 張，後面 39 鏡全白做）

每張要求：正面 / 3/4 側 / 側面 / 表情，四個角度各一張，同一 seed。

**王红军（歸國時 30 歲）**
```
cinematic character sheet, Chinese man, 30 years old, lean, short black hair,
high cheekbones, calm cold eyes, thin lips, dark navy suit no tie,
neutral expression, four views: front, three-quarter, profile, subtle frown,
plain dark background, low saturation, 35mm film grain, AR 9:16
```

**王红军（現時 40 歲，段 2、7–12 用）**：同上，加 `slight temple grey, deeper eye sockets, tired eyes`

**王老实（62 歲，陝北老農）**
```
cinematic character sheet, Chinese farmer, 62, deep weathered wrinkles,
sun-darkened skin, grey stubble, sheepskin vest, long tobacco pipe,
kind but tired eyes, four views, plain dark background, 35mm grain, AR 9:16
```

**王秀蓮（二姐，34 歲）**：`rural Chinese woman, 34, blue cloth jacket, hair in a bun, cracked knuckles, warm gentle eyes, four views, AR 9:16`

**陳老太（72 歲，散戶）**：`Chinese elderly woman, 72, short grey hair, dark padded jacket, reading glasses on a cord, holding a bankbook, four views, AR 9:16`

**場景鎖（各一張空鏡）**：黃土溝壑、機構操盤室、窯洞內、高鐵站出站口、機構會客小間、證券營業部大廳。

---

## 二、逐鏡腳本

> 記法：`TC` 時間碼｜`D` 時長｜景別／焦段｜運鏡
> `P` = 生成提示詞（英文，直接複製）
> `N` = 負面提示詞（全局共用，見文末）

---

### 段 1｜鉤子｜0:00–0:03

**S01** ｜0:00–0:01.2｜1.2s｜大遠景／24mm｜垂直俯衝
畫面：黃土溝壑，狂風捲沙，天壓得很低。風把黃沙掃過溝底。
音效：風聲（滿）
P：
```
extreme wide shot, Loess Plateau gullies, yellow dust storm sweeping the valley,
heavy dark storm sky, camera diving down fast vertically, desaturated ochre palette,
35mm film grain, harsh sunlight through dust, AR 9:16
```

**S02** ｜0:01.2–0:02.4｜1.2s｜微距／100mm｜固定
畫面：**硬切**到漆黑房間。一根手指落下，按下鍵盤。螢幕綠光映在手背上。畫面右側是委託單的輪廓（**文字不可讀**）。
音效：風聲**驟停**（3 幀真空）→ 報單器「叮」→ 低頻 sub
P：
```
macro shot, index finger pressing a keyboard key in a pitch-black room,
only cold green monitor glow, silhouette of an order ticket on screen edge,
shallow DOF f/2, 100mm macro, 35mm grain, no readable text, AR 9:16
```

**S03** ｜0:02.4–0:03.0｜0.6s｜特寫／85mm｜極緩推
畫面：王红军側臉。螢幕冷光在他臉頰切出一道硬邊緣光。眼神平，不眨。
台詞（0:02.4 起）：「資金進場，戰場開啟。」
音效：sub 低頻延續
P：
```
extreme close-up, profile of a Chinese man's face lit only by monitor glow,
hard rim light on cheekbone, absolutely calm eyes, no expression, 85mm f/1.8,
low key, 35mm grain, AR 9:16
```

---

### 段 2｜權力感｜0:03–0:12

**S04** ｜0:03–0:06｜3.0s｜全景／24mm｜極慢 dolly in
畫面：數十塊螢幕鋪滿牆，紅綠抽象波形跳動。王红军坐在中控位，背對鏡頭，房間只有螢幕的光。
音效：鍵盤、報單、風扇低鳴
P：
```
wide shot, dark institutional trading room, wall of 16 monitors with abstract
glowing red and green waveforms (no readable numbers), one man seated centre
back to camera, cold blue rim light, slow dolly in, 24mm, deep space, 35mm grain, AR 9:16
```

**S05** ｜0:06–0:09｜3.0s｜過肩／35mm｜手持輕晃
畫面：從背後過肩，他的手在兩個鍵盤之間移動，動作極省。
P：
```
over-the-shoulder shot, man's hands moving minimally between two keyboards,
monitor glow, cold room, handheld micro-shake, 35mm, shallow DOF, AR 9:16
```

**S06** ｜0:09–0:12｜3.0s｜低角度特寫／50mm｜固定
畫面：桌面——一杯涼透的茶（水面無熱氣）、一部舊手機（螢幕黑）、一疊手寫筆記（**字跡模糊不可讀**）。
音效：遠方城市車流（極弱）
P：
```
low angle close-up of a desk: a cup of cold tea with no steam, an old black
phone, a stack of handwritten notes with illegible scrawl, monitor glow from
the side, 50mm, dust in the air, AR 9:16
```

---

### 段 3｜窯洞・家訓｜0:12–0:30

**S07** ｜0:12–0:16｜4.0s｜全景／35mm｜固定（對稱）
畫面：土坯牆、炕、油燈。透過木門框看見三人：王老实抽旱煙、少年王红军坐炕沿、二姐在旁縫衣。**這是全片唯一的暖光。**
音效：窯洞外風聲（悶）／旱煙「呼嚕」／針線穿布
P：
```
cave dwelling interior on the Loess Plateau, symmetrical composition framed by
a wooden door, oil lamp with warm 2800K light, old farmer smoking a long pipe,
a thin boy in a patched jacket sitting on the kang, a woman sewing beside him,
earthen walls, 35mm, warm low key, film grain, AR 9:16
```

**S08** ｜0:16–0:20｜4.0s｜中景／50mm｜固定
畫面：王老实抬眼，煙霧從他臉前升起。
台詞（0:16.5 起）：「小軍，記牢。」
P：
```
medium shot of an old Chinese farmer lifting his eyes, smoke drifting in front
of his weathered face, oil lamp light from below, earthen wall behind, 50mm,
warm low key, 35mm grain, AR 9:16
```

**S09** ｜0:20–0:26｜6.0s｜中近景／50mm｜固定（雙段拼接：20–23 + 23–26 於煙霧處切）
台詞（0:20.0 起）：「一袋錢搭在肩膀上，人長錢短。」（停 1.2s）「做人，義永遠在錢前面。」
畫面：他說話時不動，只有嘴與煙霧。少年在畫框右下角，低頭聽。
P：
```
medium close-up, old farmer speaking slowly, pipe in hand, teenager's head
lowered at the bottom right of the frame, warm oil lamp light, earthen wall,
50mm f/2, 35mm grain, AR 9:16
```

**S10** ｜0:26–0:30｜4.0s｜特寫／85mm｜極緩推
畫面：少年王红军的臉。瘦，眼睛大而黑，抬眼看向父親。
台詞：無。
P：
```
close-up of a thin 8-year-old Chinese boy's face, big dark eyes lifting to look
at his father, warm lamp light, patched collar visible, 85mm f/2, slow push in,
35mm grain, AR 9:16
```

---

### 段 4｜二姐・身體｜0:30–0:42

**S11** ｜0:30–0:36｜6.0s｜雙人中近景／50mm｜固定（微呼吸感）
畫面：王秀蓮坐在少年身後，手掌貼在他後背上，一下一下地撫。動作很輕。
台詞（0:31.0 起）：「身子弱，長大別跟人拼命。」
P：
```
two-shot, a rural woman in a blue cloth jacket sitting behind a thin boy,
her rough hand resting on his back, gentle repetitive movement, oil lamp light,
earthen wall, 50mm f/2, 35mm grain, AR 9:16
```

**S12** ｜0:36–0:39｜3.0s｜微距／100mm｜固定
畫面：她的手。指節粗大、有裂口、正在縫一件補丁褂。布很舊。
P：
```
macro shot of a rural woman's rough cracked hands mending a patched jacket,
coarse fabric, warm lamp light, extreme shallow DOF, 100mm macro, 35mm grain, AR 9:16
```

**S13** ｜0:39–0:42｜3.0s｜特寫／85mm｜固定
畫面：少年眼睛。不說話，只是看著姐姐的手。
P：
```
close-up of a boy's dark eyes looking down at a woman's hands, warm light,
reflection of lamp flame in the pupil, 85mm, 35mm grain, AR 9:16
```

---

### 段 5｜時間流逝｜0:42–0:55

**S14** ｜0:42–0:45｜3.0s｜微距／100mm｜固定
畫面：燈芯燃盡，火苗縮小，最後一縷黑煙直上。
音效：油燈「噗」一聲
P：
```
macro shot, oil lamp wick burning out, flame shrinking then extinguishing,
last thin wisp of black smoke rising, warm light dying to darkness, 100mm,
35mm grain, AR 9:16
```

**S15** ｜0:45–0:49｜4.0s｜全景／35mm｜極慢橫移
畫面：窯洞空了。炕上只剩一件疊好的補丁褂。灰塵在光柱裡浮。
音效：只剩風
P：
```
wide shot of an empty cave dwelling, only a neatly folded patched jacket left
on the kang, dust motes floating in a shaft of light through the door, very slow
lateral move, 35mm, cold daylight now, film grain, AR 9:16
```

**S16** ｜0:49–0:55｜6.0s｜特寫／50mm｜固定＋疊化
畫面：風沙從窗櫺縫裡灌進來，紙窗被吹得鼓起。畫面疊化到黑。
後期字幕卡（0:51–0:54）：「一九九八年・陝西古豳」
P：
```
close-up of wind-blown dust forcing through a wooden window lattice, paper
window bulging inward, cold grey light, slow dissolve to black, 50mm, 35mm grain, AR 9:16
```

---

### 段 6｜歸國｜0:55–1:10

**S17** ｜0:55–0:59｜4.0s｜中景／35mm｜手持背跟
畫面：高鐵站出站口，冷白燈。人流拖著行李箱迎面而來，他被夾在中間，逆著走。
音效：車站底噪（廣播必須處理成不可辨）、行李箱輪子
P：
```
handheld follow shot from behind, a Chinese man in a dark suit walking against
the flow of travellers in a cold-lit railway arrival hall, luggage wheels,
fluorescent light, desaturated, 35mm, AR 9:16
```

**S18** ｜0:59–1:04｜5.0s｜中近景／50mm｜固定
畫面：他停下，回頭看了一眼（什麼都沒有），然後繼續走。
P：
```
medium close-up, the man stops and looks back over his shoulder in a station
concourse, nothing behind him, cold light, neutral expression, 50mm, 35mm grain, AR 9:16
```

**S19** ｜1:04–1:10｜6.0s｜微距／100mm｜固定
畫面：他手裡那張泛黃照片——**正是 S07 的構圖**（同一個門框、同一盞燈的位置）。照片邊角磨白。
P：
```
macro shot of a yellowed photograph held in a man's hand, the photo shows a
cave dwelling interior framed by a wooden door with an oil lamp, corners worn
white, cold fluorescent light on the print, 100mm macro, 35mm grain, AR 9:16
```

---

### 段 7｜進機構｜1:10–1:25

**S20** ｜1:10–1:14｜4.0s｜中景／35mm｜手持跟
畫面：玻璃走廊，門禁燈紅轉綠。他刷卡，走進去。
音效：門禁「嘀」、空調、椅子滑輪
P：
```
handheld follow shot, man in suit walking down a glass corridor in an office
tower, access control light turning green, cold white light, reflections,
35mm, AR 9:16
```

**S21** ｜1:14–1:18｜4.0s｜中景／35mm｜固定
畫面：他推開門。冷氣白霧湧出。
P：
```
medium shot, man pushing open a heavy glass door, cold air haze rolling out,
dark trading floor beyond him, backlit, 35mm, AR 9:16
```

**S22** ｜1:18–1:25｜7.0s｜全景／24mm｜慢搖（雙段拼接：18–21.5 + 21.5–25）
畫面：操盤室全貌。十幾個人回頭看了他一秒，又全部轉回螢幕。沒人說話。他走到中控位坐下。
P：
```
wide shot of a dark trading floor, a dozen traders glance up for one second
then turn back to their monitors, a man walks to the centre seat and sits down,
slow pan, cold fluorescent, 24mm, 35mm grain, AR 9:16
```

---

### 段 8｜第一句試探｜1:25–1:45

**S23** ｜1:25–1:31｜6.0s｜中景／50mm｜固定（正反打 A）
畫面：小會議間。出資方（50 歲、圓臉、金錶、笑意不到眼）坐在對面，兩杯茶都沒動。
台詞（1:26.0 起）：「這隻票，交給你操盤。我們要目標價位。」
P：
```
medium shot of a wealthy Chinese businessman in his fifties, round face, gold
watch, a smile that doesn't reach his eyes, small meeting room, two untouched
teacups, cold window light, 50mm, 35mm grain, AR 9:16
```

**S24** ｜1:31–1:35｜4.0s｜桌面高度／35mm｜固定
畫面：一份資料從桌面推過來。紙上的字**不可讀**。
音效：紙張摩擦、茶杯底磕桌
P：
```
table-level shot, a document being pushed across a tea table towards camera,
two men's hands in frame, paper texture, cold light, no readable text,
35mm, shallow DOF, AR 9:16
```

**S25** ｜1:35–1:40｜5.0s｜過肩／50mm｜固定
畫面：王红军低頭掃資料，手指停在其中一行。
台詞（1:36.5 起）：「籌碼結構我看過。浮籌很亂，散戶扎堆。」
P：
```
over-the-shoulder shot, man in suit reading a document, index finger stopping
on a line, cold light, neutral expression, 50mm, 35mm grain, AR 9:16
```

**S26** ｜1:40–1:45｜5.0s｜特寫／85mm｜固定
畫面：出資方的笑。他往椅背一靠。
台詞（1:40.5 起）：「正好。洗盤、拉升、派發，老路子。」
P：
```
close-up of a businessman leaning back in his chair with a slight smile, gold
watch catching light, cold meeting room, 85mm f/2, 35mm grain, AR 9:16
```

---

### 段 9｜刀與規矩｜1:45–2:05


**S27** ｜1:45–1:51｜6.0s｜眼部落特寫／85mm｜極緩推
畫面：王红军抬眼。瞳孔裡有螢幕的反光。
台詞（1:46.0）：「我可以做。資金博弈我熟，該擠壓對手盤的時候，我不會手軟。」（1:48.8）「但我的刀，只朝外。」
P：
```
extreme close-up of a man's eyes lifting, monitor reflections moving inside
the pupils, absolutely no expression, 85mm f/1.4, slow push in, low key,
35mm grain, AR 9:16
```

**S28** ｜1:51–1:56｜5.0s｜中景／50mm｜固定
畫面：他身体不動，只說下一句。**停 1.5 秒**。
台詞（1:51.0 起）：「但我不做趕盡殺絕的局。」（1:53.5）「我會留離場窗口。」
P：
```
medium shot, man sitting completely still while speaking, cold light from the
side, no gesture at all, 50mm, 35mm grain, AR 9:16
```

**S29** ｜1:56–2:01｜5.0s｜反打中景／50mm｜固定
畫面：出資方皺眉，身體前傾。
台詞（1:56.0 起）：「你是機構操盤手，不是慈善家。」
P：
```
reverse shot, businessman frowning and leaning forward across the tea table,
cold window light, 50mm, 35mm grain, AR 9:16
```

**S30** ｜2:01–2:05｜4.0s｜中景／50mm｜焦點由臉轉到玻璃外
畫面：王红军不回答。他轉頭，看向玻璃牆外的開放辦公區（有人在小跑、有人在打電話）。
音效：**幾乎無聲**，只有空調
P：
```
medium shot, man turns his head away from the conversation and looks through
a glass wall at a distant open office, focus racks from his face to the people
beyond, cold light, 50mm, 35mm grain, AR 9:16
```

---

### 段 10｜散戶大廳｜2:05–2:20

**S31** ｜2:05–2:10｜5.0s｜高角度全景／24mm｜固定（監控視角）
畫面：日光燈、塑料椅、密密麻麻的人頭仰著看大屏。大屏**虛化、無字**，只有一片紅。
音效：大廳嗡鳴、叫號機
P：
```
high angle surveillance-style shot of a crowded Chinese brokerage hall,
fluorescent lights, plastic chairs, a dense crowd of heads tilted up towards
a blurred red board, desaturated, 24mm, AR 9:16
```

**S32** ｜2:10–2:16｜6.0s｜中景／50mm｜手持
畫面：陳老太坐在塑料椅上，攥著存摺，側頭跟老姐妹說話。她笑了一下，笑得很輕。
台詞（環境聲）：「……真的能賺啊？」「人家都賺了。」
P：
```
medium handheld shot of an elderly Chinese woman sitting on a plastic chair in
a brokerage hall, clutching a bankbook, talking to another old woman beside
her, a faint hopeful smile, fluorescent light, 50mm, 35mm grain, AR 9:16
```

**S33** ｜2:16–2:20｜4.0s｜微距／100mm｜固定
畫面：存摺在她手裡被捏出一道折痕。指節泛白。
P：
```
macro shot of an elderly woman's hand gripping a bankbook, knuckles white,
crease in the cover, fluorescent light, 100mm macro, shallow DOF, AR 9:16
```

---

### 段 11｜刀落在哪裡｜2:20–2:45

**S34** ｜2:20–2:25｜5.0s｜中景／85mm｜固定
畫面：王红军站在玻璃牆前。玻璃上只有他自己與背後螢幕的倒影，看不見大廳。
P：
```
medium shot, man standing in front of a glass wall at night, only his own
reflection and monitor glow in the glass, nothing visible beyond, low key,
85mm, 35mm grain, AR 9:16
```

**S35** ｜2:25–2:29｜4.0s｜特寫／85mm｜0.3 秒閃回疊
畫面：眼底極快掠過一絲鬆動（插入 0.3 秒 S32 陳老太笑的畫面，半透明），隨即消失。
P：
```
extreme close-up of a man's eye, a brief flicker of softening, then hardening
again within a fraction of a second, monitor glow, 85mm f/1.4, AR 9:16
```

**S36** ｜2:29–2:37｜8.0s｜中近景／85mm｜緩推（雙段拼接：29–33 + 33–37）
畫面：他低頭，聲音很低。說的時候沒有表情。
台詞（2:30.0 起）：「戰場規則我遵守。」（2:32.5）「但我有權劃定——刀落在哪裡。」
音效：一聲極輕的鋼琴單音（只有一個音）
P：
```
medium close-up, man looking down, speaking quietly, no expression, cold
monitor glow on one side of his face, slow push in, 85mm, 35mm grain, AR 9:16
```

**S37** ｜2:37–2:45｜8.0s｜中景／50mm｜固定（雙段拼接）
畫面：他站著不動，很久。螢幕的光在他背後慢慢變化。最後他伸手，關掉一盞檯燈。
P：
```
medium shot, man standing motionless in a dark trading room, monitor glow
shifting slowly behind him, then he reaches out and switches off a desk lamp,
room falling darker, 50mm, 35mm grain, AR 9:16
```

---

### 段 12｜收尾懸念｜2:45–3:00

**S38** ｜2:45–2:50｜5.0s｜微距／100mm｜固定
畫面：舊手機屏幕在黑暗中亮起。一條訊息。
後期層：`UI_03`「帳戶已激活。權限：全額。」
音效：訊息提示音（乾、短）
P：
```
macro shot of an old phone screen lighting up in complete darkness, glow on
the man's fingers, no readable text on screen, 100mm macro, 35mm grain, AR 9:16
```

**S39** ｜2:50–2:56｜6.0s｜特寫／85mm｜極緩推
畫面：他的拇指懸在螢幕上方。**沒有落下。**指節微微收緊，又鬆開。
音效：心跳（極低、慢）
P：
```
close-up of a thumb hovering above a phone screen, never pressing down,
tendon tightening slightly then relaxing, dark room, screen glow from below,
85mm f/2, slow push in, AR 9:16
```

**S40** ｜2:56–3:00｜4.0s｜全景／35mm｜後拉
畫面：鏡頭後拉。他變成黑房間裡的一個剪影，四周是幾十塊螢幕的光。畫面漸暗至黑。
台詞（2:56.5 起）：「刀已經拿到手裡了。」（2:58.0）「接下來，看我用。」
音效：全靜 → 黑場 → 一聲極遠的風（接第 2 集）
P：
```
camera pulls back from a silhouetted man in a dark room surrounded by dozens
of glowing monitors, figure shrinking into shadow, slow fade to black,
35mm, film grain, AR 9:16
```

---

## 三、負面提示詞（全局共用，逐鏡都要帶）

```
readable text, Chinese characters, subtitles, logos, watermarks, numbers,
letters, distorted faces, extra fingers, deformed hands, plastic skin,
oversaturated, HDR, lens flare, cartoon, 3D render, video game look,
vertical stretch, warped geometry, fast morphing, flicker
```

---

## 四、對白稿（可直接貼字幕工具）

| # | 時間碼 | 角色 | 台詞 |
|---|---|---|---|
| 1 | 00:02.4–00:03.4 | 王红军（畫外／低） | 資金進場，戰場開啟。 |
| 2 | 00:16.5–00:20.0 | 王老实 | 小軍，記牢。 |
| 3 | 00:20.0–00:26.0 | 王老实 | 一袋錢搭在肩膀上，人長錢短。做人，義永遠在錢前面。 |
| 4 | 00:31.0–00:36.0 | 王秀蓮 | 身子弱，長大別跟人拼命。 |
| 5 | 00:51.0–00:54.0 | （字幕卡） | 一九九八年・陝西古豳 |
| 6 | 01:26.0–01:31.0 | 出資方 | 這隻票，交給你操盤。我們要目標價位。 |
| 7 | 01:36.5–01:40.0 | 王红军 | 籌碼結構我看過。浮籌很亂，散戶扎堆。 |
| 8 | 01:40.5–01:45.0 | 出資方 | 正好。洗盤、拉升、派發，老路子。 |
| 9 | 01:46.0–01:51.0 | 王红军 | 我可以做。資金博弈我熟，該擠壓對手盤的時候，我不會手軟。但我的刀，只朝外。 |
| 10 | 01:51.0–01:56.0 | 王红军 | 但我不做趕盡殺絕的局。我會留離場窗口。 |
| 11 | 01:56.0–02:01.0 | 出資方 | 你是機構操盤手，不是慈善家。 |
| 12 | 02:11.0–02:14.0 | 陳老太（環境聲） | ……真的能賺啊？ |
| 13 | 02:14.0–02:16.0 | 老姐妹（環境聲） | 人家都賺了。 |
| 14 | 02:30.0–02:37.0 | 王红军（低） | 戰場規則我遵守。但我有權劃定——刀落在哪裡。 |
| 15 | 02:56.5–03:00.0 | 王红军（低） | 刀已經拿到手裡了。接下來，看我用。 |

**全片台詞總字數：約 210 字。** 180 秒只說 210 字——留白是設計，不是省事。

---

## 五、音樂設計（克制到近乎沒有）

| 位置 | 內容 | 說明 |
|---|---|---|
| 0:00–0:03 | 一個低頻 pulse（無旋律） | 只為鉤子加壓，切點即斷 |
| 0:03–0:12 | 低頻環境床（-30dB） | 幾乎聽不見 |
| 0:12–0:55 | **無音樂** | 只有環境音。全片最安靜的 43 秒 |
| 0:55–1:25 | 極淡弦樂單音（無和聲） | 音量低於環境音 |
| 1:25–2:05 | 無音樂 | 全靠對白與空白 |
| 2:05–2:20 | 大廳底噪代替音樂 | 人聲就是配樂 |
| 2:20–2:45 | **一個鋼琴單音**（S36 起點） | 全片只有這一個音 |
| 2:45–3:00 | 心跳 → 全靜 → 遠風 | 黑場留白 |

---

## 六、投喂批次建議

| 批次 | 內容 | 鏡數 | 說明 |
|---|---|---|---|
| 批 0 | 5 張角色定妝 + 6 張場景空鏡 | 11 | **不通過不往下走** |
| 批 1 | S01–S13（窯洞段） | 13 | 暖光，需嚴格鎖定色溫 2800K |
| 批 2 | S14–S22（時間流逝＋歸國＋進場） | 9 | 冷暖轉換，注意同一張臉 |
| 批 3 | S23–S33（會議＋散戶大廳） | 11 | 對白戲，口型僅要求「大致對得上」，成片用配音覆蓋 |
| 批 4 | S34–S40（收尾） | 7 | 特寫為主，最容易崩臉，多備版 |

每鏡生成 **3 版**，共 120 次；選版標準只有一條：**臉是不是同一張臉**。達不到就重跑，不要修。

---

## 七、驗收（12 條，全過才交付）

1. 0–3 秒是否「靜→響→靜」三段式？
2. 除後期字幕外，畫面有沒有一個可讀漢字？
3. S07 與 S19 的照片，是否同一個門框、同一盞燈的位置？
4. S28 的「停 1.5 秒」是否真的留了？
5. S35 的「鬆動」是否 ≤ 0.3 秒？
6. S39 的拇指，是否**沒有**按下？
7. 王红军的臉在 40 鏡裡是否同一張？（抽 6 幀並排比對）
8. 有沒有一顆 AI 生成鏡頭超過 6 秒？（雙段拼接的除外）
9. 字幕是否都在底部 18% 安全區內？
10. 全片台詞是否 ≤ 250 字？
11. 燈芯熄滅那 3 秒，是否真的只剩風聲？
12. 交付是否 1080×1920、≥ 8 Mbps、−16 LUFS？