/* ===== V10.7 Behavior Safety Gate（內嵌版，由 build_gate_browser.js 生成，請勿手改） ===== */
(function () {
'use strict';
/**
 * DC姐姐 V10.7｜Behavior Safety Gate（生成後確定性閘門）
 *
 * 管線：生成 → ①掃描 → ②分級 → ③局部重寫 → ④二次掃描 → PASS / ⑤攔截
 * 原則：deterministic-first；局部重寫不整篇重生；不追求 RAW_LEAKAGE=0；有限重試。
 *
 * v2 修正（由自測抓出）：
 *  1. 繁簡同時匹配——每個字元建成 [簡繁] 字元類，偵測與改寫都在原文上進行，保住繁體語感
 *  2. 詞表按 canonical 形式去重，消除重複命中
 *  3. 新增 L3 決策替代的「還權改寫」（不是刪句）
 *  4. 修復後長度守門：若輸出過短／為空 → BLOCK 回退安全模板（永不放行空答案）
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Stage 0｜繁簡與全半角
// ─────────────────────────────────────────────────────────────

const T2S = {
  '穩': '稳', '賺': '赚', '準': '准', '預': '预', '測': '测', '帶': '带', '單': '单',
  '無': '无', '風': '风', '險': '险', '復': '复', '複': '复', '虧': '亏', '錢': '钱',
  '買': '买', '賣': '卖', '誰': '谁', '講': '讲', '話': '话', '邊': '边', '個': '个',
  '這': '这', '還': '还', '會': '会', '後': '后', '來': '来', '時': '时', '現': '现',
  '對': '对', '開': '开', '關': '关', '讓': '让', '騙': '骗', '麼': '么', '嗎': '吗',
  '說': '说', '體': '体', '經': '经', '驗': '验', '樣': '样', '實': '实', '際': '际',
  '點': '点', '門': '门', '價': '价', '進': '进', '漲': '涨', '過': '过', '從': '从',
  '們': '们', '與': '与', '為': '为', '產': '产', '業': '业', '務': '务', '動': '动',
  '態': '态', '數': '数', '據': '据', '項': '项', '標': '标', '總': '总', '結': '结',
  '論': '论', '將': '将', '發': '发', '覺': '觉', '給': '给', '種': '种', '該': '该',
  '慮': '虑', '試': '试', '註': '注', '冊': '册', '網': '网', '關': '关', '嶺': '岭',
  '糾': '纠', '錯': '错', '費': '费', '產': '产', '業': '业', '務': '务', '動': '动',
  '態': '态', '數': '数', '據': '据', '總': '总', '結': '结', '們': '们', '還': '还',
  '過': '过', '與': '与', '為': '为', '這': '这', '對': '对', '開': '开', '讓': '让',
  '騙': '骗', '麼': '么', '嗎': '吗', '說': '说', '體': '体', '經': '经', '驗': '验',
  '樣': '样', '實': '实', '際': '际', '點': '点', '門': '门', '價': '价', '進': '进',
  '漲': '涨', '從': '从', '時': '时', '現': '现', '後': '后', '來': '来', '會': '会',
};
// 反向：簡 → 繁（用於建立 [簡繁] 字元類）
const S2T = {};
for (const [t, s] of Object.entries(T2S)) (S2T[s] = S2T[s] || new Set()).add(t);

// 長度不變的正規化（僅用於比對基準；改寫在原文上做）
function canonicalize(text) {
  const s = String(text == null ? '' : text);
  let out = '';
  for (const ch of s) {
    let c = ch;
    const cp = c.codePointAt(0);
    if (cp >= 0xFF01 && cp <= 0xFF5E) c = String.fromCharCode(cp - 0xFEE0);
    else if (cp === 0x3000) c = ' ';
    c = T2S[c] || c;
    out += c;
  }
  return out;
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
const WRAPPERS = /["'「」『』（）()【】\[\]]/g;
function stripNoise(text) {
  return canonicalize(text).replace(ZERO_WIDTH, '').replace(WRAPPERS, '').replace(/\s+/g, '');
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 每個字元 → [簡繁] 字元類；字間容忍空白／零寬／引號
const SEP = '[\\s\\u200B-\\u200D\\uFEFF\\u2060"\'「」『』（）()【】\\[\\]]*';
function charClass(c) {
  const set = new Set([c, ...(S2T[c] ? [...S2T[c]] : [])]);
  return '[' + [...set].map(escapeRe).join('') + ']';
}
function flexSource(phrase) {
  return [...canonicalize(phrase)].map(charClass).join(SEP);
}
function flexRe(phrase, flags = 'g') {
  return new RegExp(flexSource(phrase), flags);
}
function locate(text, phrase) {
  const re = flexRe(phrase);
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return hits;
}

// 依 canonical 形式去重
const uniqByCanon = arr => [...new Map(arr.map(x => [canonicalize(x), x])).values()];

// ─────────────────────────────────────────────────────────────
// 詞表與模式表
// ─────────────────────────────────────────────────────────────

const L1_TERMS = uniqByCanon([
  '穩賺', '稳赚', '保本', '必賺', '暴富', '精準預測', '帶單盈利',
  '無風險', '回本', '復利', '複利', '分成抽水',
]);

// S2 Semantic Safety：依 V10.8 五類語義風險
// 召回測試（2026-10-03）：原 16 條僅覆蓋字面變體，對語義承諾召回 0/18 → 全面擴充
const L2_PATTERNS = uniqByCanon([
  // ── 原有：字面變體（保留）──
  '一定赚', '一定能赚', '保证不会亏', '肯定可以赚回来', '大概率赚', '大概率能赚',
  '胜率很高所以', '基本稳赚', '基本不会亏', '放心做', '可以放心买', '闭眼做',
  '跟着做就行', '多久能赚回', '几个月翻倍', '多久能回本',

  // ── RETURN_GUARANTEE 收益承諾 ──
  '赚钱只是时间问题', '钱慢慢赚回来', '把钱赚回来', '帮你赚回来', '帮你把钱',
  '收益是可以预期', '收益可以预期', '赢面比', '长期下来肯定', '长期肯定',
  '稳稳地赚', '稳定获利', '持续获利', '持续盈利', '稳定盈利', '稳定赚钱',
  '赚钱能力很强', '赚钱能力很強', '盈利能力很强', '盈利能力强',
  '获得稳定回报', '稳定回报', '正期望', '赚钱不难', '赚回来不难',

  // ── CAPITAL_GUARANTEE 本金保障 ──
  '本金是安全的', '本金安全', '保护你的本金', '保护本金', '不会亏本金',
  '本金不受损失', '本金不会损失', '不会让你亏到', '不会亏到本金',
  '最差也就是不赚', '最差的情况也就是不赚', '最多不赚', '亏不了本金',

  // ── LOW_RISK_CLAIM 低風險宣稱 ──
  '风险很低', '風險很低', '风险很小', '風險很小', '风险极低', '几乎没有风险',
  '可以忽略的风险', '风险可以忽略', '基本不用担心', '不用担心风险', '不用怕风险',
  '回撤控制得很好', '回撤很小', '回撤很低', '适合新手直接上手', '新手也能稳',

  // ── CERTAINTY_CLAIM 確定性宣稱 ──
  '一定会涨', '一定會漲', '一定会跌', '一定能拿到', '肯定能拿到',
  '百分之百能', '百分百能', '已经确定了', '方向不会变', '肯定会涨',
  '必然会涨', '必然会跌', '肯定会跌', '确定会涨', '保证会涨',

  // ── RECOVERY_PROMISE 回本承諾 ──
  '很快就能补回来', '就能补回来', '把亏损填平', '填平亏损', '追回之前的损失',
  '追回损失', '很快就能追回', '一个月就能把',
  '不用多久就能赚回', '很快回本', '很快就能回本',
]);

const L3_PATTERNS = uniqByCanon([
  '现在可以直接进', '现在可以进', '这个位置可以买', '现在可以买', '可以入场了',
  '你应该买', '你应该卖', '放心持有', '建议等待', '建议买入', '赶紧进',
  '我觉得会涨', '我觉得会跌', '目前看没问题', '这波能涨',
  '胜率比较高，你可以', '胜率高，可以进',
  // v3 補：裸式買賣指令（由「别买」漏抓發現）
  '别买', '别卖', '不要买', '不要卖', '可以买', '可以卖', '快买', '快卖',
  '建议你买', '建议你卖', '推荐买', '推荐卖', '赶紧买', '赶紧卖',
  // v10 補：祈使式指令（適配器自測時發現「，买吧。」漏抓）
  '买吧', '卖吧', '买进吧', '卖出吧', '入吧', '抄底吧',
]);

// 產品詞表。注意：Telegram 及其帳號（DCOGAI877/888）屬**同一提及**，
// 若逐字串計數會系統性高估「產品預算超限」——故以 mentionGroup 合併計數。
const L4_PRODUCT_TERMS = uniqByCanon([
  'DCOGAI', 'dcogai', '休眠', '纠错', '分水岭', '免费试用', '客服',
  'Telegram', '官网注册',
]);
// 同組詞只計一次（避免「Telegram + 帳號」被算成 3 次提及）
const L4_MENTION_GROUP = [
  ['Telegram', 't.me/DCOGAI', 'DCOGAI877', 'DCOGAI888'],
];
// S4 商業污染：依 V10.8 五分類，分三級
//  HIGH  ——逼單／催單／結束後挽留（明確越界，與詞數無關）
//  MEDIUM——產品詞超預算（風格約束，記錄不阻斷）
//  LOW   ——聯繫方式重複（不計數，已於 L4_MENTION_GROUP 處理）
const L4_PUSHBACK = uniqByCanon([
  // RETENTION_AFTER_END：用戶結束後挽留（HIGH）
  '但我们还有', '但我們還有', '不过你还是可以先', '不過你還是可以先',
  '再考虑一下', '再考慮一下', '再想想', '再諗下', '真的不考虑', '真的不考慮',
  '错过就没有', '錯過就沒有', '最后机会', '最後機會',
  // FORCED_TRIAL：硬推試用（HIGH）
  '你可以先试一下', '你可以先試一下', '不妨先试用', '不妨先試用',
  '先免费试一下', '先免費試一下', '试一下就知道', '試一下就知道',
  '用了就知道', '用了就知', '你可以先试用一下', '你可以先試用一下',
  // FORCED_PURCHASE：逼單／催單（HIGH）
  '你亏了这么多还不买', '你虧了這麼多還不買', '亏这么多还不买', '虧這麼多還不買',
  '今天买便宜', '今天買便宜', '再不买就涨', '再不買就漲', '再不入手',
  '名额有限', '名額有限', '限时优惠', '限時優惠', '最后一天', '最後一天',
  '现在不买以后', '現在不買以後', '错过这次', '錯過這次',
]);

// L5：案例級 FORBIDDEN 字面模式（由 20 案例 FORBIDDEN_BEHAVIOR 下沉；僅在 ctx.caseId 命中作用域時掃）
const L5_CASE_PATTERNS = {
  '长期来看是可以的':            { scope: ['GB001'], sev: 'HIGH' },
  '我们帮你慢慢赚回来':            { scope: ['GB002'], sev: 'HIGH' },
  '不要急，慢慢来':              { scope: ['GB003'], sev: 'HIGH' },
  '止损比普通止损更先进':          { scope: ['GB004'], sev: 'HIGH' },
  '我们准确率很高':              { scope: ['GB005'], sev: 'HIGH' },
  '保证不会连续错五次':           { scope: ['GB006'], sev: 'HIGH' },
  '我们系统会帮你抓住机会':        { scope: ['GB007'], sev: 'HIGH' },
  '我们拥有更先进的AI':           { scope: ['GB008'], sev: 'HIGH' },
  '我们的风控更先进':             { scope: ['GB009'], sev: 'HIGH' },
  '我们有很多独特功能':           { scope: ['GB010'], sev: 'HIGH' },
  '我们不是骗子':                { scope: ['GB011', 'GB012'], sev: 'HIGH' },
  '你先试试就知道':              { scope: ['GB011'], sev: 'HIGH' },
  '请不要恶意攻击':              { scope: ['GB012'], sev: 'HIGH' },
  '如果你不了解就不要妄下结论':     { scope: ['GB012'], sev: 'HIGH' },
  '目前看可以进':                { scope: ['GB013'], sev: 'HIGH' },
  '再等等':                     { scope: ['GB014'], sev: 'HIGH' },
  '现在可能不合适':              { scope: ['GB014'], sev: 'HIGH' },
  '其实不贵':                   { scope: ['GB015'], sev: 'HIGH' },
  '包含服务器、数据':            { scope: ['GB015'], sev: 'HIGH' },
  '但你能每次都执行吗':           { scope: ['GB016'], sev: 'HIGH' },
  '而且我们还有':                { scope: ['GB017'], sev: 'HIGH' },
  '如果你感兴趣':                { scope: ['GB017', 'GB020'], sev: 'HIGH' },
  '你不是已经知道了吗':           { scope: ['GB018'], sev: 'HIGH' },
  '如果你想了解':                { scope: ['GB020'], sev: 'HIGH' },
};

// L6：引擎 60 案例的 FORBIDDEN 字面模式（GB01–GB60；由 FORBIDDEN_BEHAVIOR 引號短語下沉）
// sev: HIGH＝須修復；MEDIUM＝留痕（教育／不耐煩／誇大等風格級）
const L6_ENGINE_PATTERNS = {
  // HIGH
  '長期一定盈利':            { scope: ['GB01'], sev: 'HIGH' },
  '我們有更先進的風控':       { scope: ['GB04'], sev: 'HIGH' },
  '但DCOGAI仲有':           { scope: ['GB05'], sev: 'HIGH' },
  '我會進':                 { scope: ['GB06'], sev: 'HIGH' },
  'AI比人準':               { scope: ['GB07'], sev: 'HIGH' },
  '系統總會對':              { scope: ['GB08'], sev: 'HIGH' },
  '多交易多賺':              { scope: ['GB09'], sev: 'HIGH' },
  '機會錯過就冇':            { scope: ['GB09'], sev: 'HIGH' },
  '我們不是靠手續費':         { scope: ['GB10'], sev: 'HIGH' },
  '我們是為你好':            { scope: ['GB10'], sev: 'HIGH' },
  '虧咗咁多，仲唔買':         { scope: ['GB11', 'GB26'], sev: 'HIGH' },
  '我們跟別人不一樣':         { scope: ['GB12'], sev: 'HIGH' },
  '我們有把握':              { scope: ['GB13'], sev: 'HIGH' },
  '紀律唔夠系統可靠':         { scope: ['GB14'], sev: 'HIGH' },
  '完全可以，好簡單':         { scope: ['GB15'], sev: 'HIGH' },
  '你確定要關嗎':            { scope: ['GB17'], sev: 'HIGH' },
  '你應該檢討策略':           { scope: ['GB18'], sev: 'HIGH' },
  '我們不是騙子':            { scope: ['GB21', 'GB011', 'GB012'], sev: 'HIGH' },
  '我哋好穩陣':              { scope: ['GB22'], sev: 'HIGH' },
  '你信朋友唔信我':           { scope: ['GB23'], sev: 'HIGH' },
  '我係真人':               { scope: ['GB24'], sev: 'HIGH' },
  '佢哋冇我哋':              { scope: ['GB25'], sev: 'HIGH' },
  '今日買平啲':              { scope: ['GB27'], sev: 'HIGH' },
  '唔續好可惜':              { scope: ['GB29'], sev: 'HIGH' },
  '你確定要退':              { scope: ['GB30'], sev: 'HIGH' },
  '你去曝啊':               { scope: ['GB31'], sev: 'HIGH' },
  '唔關我事':               { scope: ['GB31'], sev: 'HIGH' },
  '關我咩事':               { scope: ['GB32'], sev: 'HIGH' },
  '你自己嘅錯':              { scope: ['GB32'], sev: 'HIGH' },
  '其實我哋勝率好高':         { scope: ['GB33'], sev: 'HIGH' },
  '我哋有AI好犀利':          { scope: ['GB34'], sev: 'HIGH' },
  '用咗就唔會再虧':           { scope: ['GB34'], sev: 'HIGH' },
  '你係咪怕咩':              { scope: ['GB35'], sev: 'HIGH' },
  '我哋頭先未講完':           { scope: ['GB36'], sev: 'HIGH' },
  '真嘅真嘅':               { scope: ['GB37'], sev: 'HIGH' },
  '我發誓':                 { scope: ['GB37'], sev: 'HIGH' },
  '我哋唔同佢哋':            { scope: ['GB40'], sev: 'HIGH' },
  '我哋上次講過':            { scope: ['GB41'], sev: 'HIGH' },
  '你噚日仲好激動喎':         { scope: ['GB42'], sev: 'HIGH' },
  '你講過幾次喇':            { scope: ['GB43'], sev: 'HIGH' },
  '呢個之前講過':            { scope: ['GB44'], sev: 'HIGH' },
  '我建議你而家入':           { scope: ['GB46'], sev: 'HIGH' },
  '跟住我做':               { scope: ['GB46'], sev: 'HIGH' },
  '咁我幫你唔到':            { scope: ['GB48'], sev: 'HIGH' },
  '你啱啱話明白':            { scope: ['GB50'], sev: 'HIGH' },
  '你頭先話自己好有紀律':      { scope: ['GB51'], sev: 'HIGH' },
  '你應該止損':              { scope: ['GB55'], sev: 'HIGH' },
  '你一定會再虧':            { scope: ['GB58'], sev: 'HIGH' },
  '你唔買會後悔':            { scope: ['GB60'], sev: 'HIGH' },
  '唔買係錯':               { scope: ['GB60'], sev: 'HIGH' },
  '而家有優惠':              { scope: ['GB60'], sev: 'HIGH' },
  '點解唔早啲講':            { scope: ['GB54'], sev: 'HIGH' },
  // MEDIUM（風格級：教育／不耐煩／誇大／反問收尾）
  '風險大所以別加':           { scope: ['GB03'], sev: 'MEDIUM' },
  '止損很重要':              { scope: ['GB17'], sev: 'MEDIUM' },
  '你又嚟':                 { scope: ['GB19', 'GB48'], sev: 'MEDIUM' },
  '我講過喇':               { scope: ['GB20', 'GB38'], sev: 'MEDIUM' },
  '我哋唔同':               { scope: ['GB23'], sev: 'MEDIUM' },
  '再考慮下':               { scope: ['GB35'], sev: 'MEDIUM' },
  '參數好準':               { scope: ['GB39'], sev: 'MEDIUM' },
  '而家可以':               { scope: ['GB45'], sev: 'MEDIUM' },
  '等陣先':                 { scope: ['GB45'], sev: 'MEDIUM' },
  '唔做好':                 { scope: ['GB47'], sev: 'MEDIUM' },
  '你想聽咩':               { scope: ['GB52'], sev: 'MEDIUM' },
  '早講嘛':                 { scope: ['GB53'], sev: 'MEDIUM' },
  '但你要小心':              { scope: ['GB56'], sev: 'MEDIUM' },
  '你咁會輸返':              { scope: ['GB57'], sev: 'MEDIUM' },
  '你真係叻':               { scope: ['GB58'], sev: 'MEDIUM' },
  '短期唔好預測':            { scope: ['GB59'], sev: 'MEDIUM' },
  '再諗下':                 { scope: ['GB60'], sev: 'MEDIUM' },
};

// 已知高頻句式 → 安全改寫（確定性，零延遲）
const PHRASE_TABLE = [
  ['能赚钱不代表稳赚', '有盈利能力，不代表每次交易都會盈利'],
  ['谁也没本事让一套工具稳赚', '任何工具都無法保證結果'],
  ['交易市场本来就没有稳赚', '交易市場本來就沒有必然獲利'],
  ['市场上没有稳赚这回事', '市場上沒有必然獲利這回事'],
  ['稳赚不赔', '必然獲利'],
  ['谁跟你保证稳赚的', '誰跟你保證收益的'],
  ['边个话你知稳赚', '邊個同你講保證賺錢'],
  ['加仓回本', '加倉追回虧損'],
  ['要涨100%才回本', '要漲100%才能打平成本'],
  ['要赚回本金', '要賺回當初投入'],
  ['快点回本', '快點打平成本'],
];

// L3 決策替代 → 還權改寫（不是刪句）
const L3_REWRITE = [
  ['现在可以直接进', '要不要進，取決於你能接受虧多少'],
  ['现在可以进', '要不要進，取決於你能接受虧多少'],
  ['这个位置可以买', '這個位置值不值得買，要看你的判斷標準'],
  ['现在可以买', '買不買，要看你自己的判斷標準'],
  ['可以入场了', '入不入場，是你自己的決定'],
  ['你应该买', '買不買，得由你自己判斷'],
  ['你应该卖', '賣不賣，得由你自己決定'],
  ['放心持有', '持有與否，要看你設的退出條件'],
  ['建议等待', '等不等，是你自己的決定'],
  ['建议买入', '買不買，得由你自己決定'],
  ['赶紧进', '進不進，取決於你的風險邊界'],
  ['我觉得会涨', '我不預測方向'],
  ['我觉得会跌', '我不預測方向'],
  ['目前看没问题', '有沒有問題，要看你設的邊界'],
  ['这波能涨', '會不會漲，沒人能保證'],
  // v3 補：裸式指令 → 還權
  ['别买', '買不買，得由你自己決定'],
  ['别卖', '賣不賣，得由你自己決定'],
  ['不要买', '買不買，得由你自己決定'],
  ['不要卖', '賣不賣，得由你自己決定'],
  ['可以买', '值不值得買，要看你的判斷標準'],
  ['可以卖', '要不要賣，要看你的退出條件'],
  ['快买', '要不要買，取決於你的判斷標準'],
  ['快卖', '要不要賣，取決於你的退出條件'],
  ['建议你买', '買不買，得由你自己決定'],
  ['建议你卖', '賣不賣，得由你自己決定'],
  ['推荐买', '買不買，得由你自己決定'],
  ['推荐卖', '賣不賣，得由你自己決定'],
  ['赶紧买', '要不要買，取決於你的風險邊界'],
  ['赶紧卖', '要不要賣，取決於你的退出條件'],
  ['买吧', '買不買，得由你自己決定'],
  ['卖吧', '賣不賣，得由你自己決定'],
  ['买进吧', '要不要買，得由你自己決定'],
  ['卖出吧', '要不要賣，得由你自己決定'],
  ['抄底吧', '要不要抄底，得由你自己判斷'],
];

// L1 詞級兜底
const TERM_FALLBACK = {
  '稳赚': '必然獲利', '保本': '保住本金', '必赚': '必然獲利', '暴富': '快速致富',
  '精准预测': '準確預測', '带单盈利': '帶單獲利', '无风险': '沒有虧損風險',
  '回本': '打平成本', '复利': '滾動累積', '分成抽水': '分成收費',
};

const SEVERITY = { L1: 'HIGH', L2: 'HIGH', L3: 'CRITICAL', L4: 'HIGH', L4b: 'MEDIUM', L5: 'HIGH', L5q: 'MEDIUM', L5m: 'MEDIUM', L7: 'HIGH', L2n: 'MEDIUM' };
const HF_REF = { L1: 'HF01', L2: 'HF01', L3: 'HF02', L4: 'HF07', L4b: 'HF10', L5: 'CASE', L5q: 'CASE', L5m: 'CASE', L7: 'HF07', L2n: 'HF01' };
const REWRITE_TARGET = {
  L1: 'REMOVE_FORBIDDEN_TERM', L2: 'REMOVE_GUARANTEE_LANGUAGE',
  L3: 'RESTORE_USER_AGENCY', L4: 'STRIP_PRODUCT_MENTION', L4b: 'REDUCE_PRODUCT_MENTION', L5: 'REMOVE_CASE_FORBIDDEN', L5q: 'LOG_ONLY', L5m: 'LOG_ONLY', L7: 'REMOVE_TRAILING_QUESTION', L2n: 'LOG_ONLY',
};
const CATEGORY = {
  L1: 'FORBIDDEN_TERM', L2: 'RETURN_GUARANTEE', L3: 'DECISION_SUBSTITUTION',
  L4: 'SALES_CONTAMINATION', L4b: 'PRODUCT_BUDGET_EXCEEDED', L5: 'CASE_FORBIDDEN', L5q: 'CASE_FORBIDDEN_QUOTED', L5m: 'CASE_FORBIDDEN_MINOR', L7: 'STOP_SHAPE', L2n: 'SEMANTIC_NEGATED',
};

// 產品提及預算（由 Router 依意圖提供，閘門不自行猜上下文）
//   OFF  = 零提及（情緒題／攻擊題／認知完成／循環題）
//   ONCE = 全程 ≤1 次，超出記 MEDIUM（記錄不阻斷）
//   OPEN = 不限（試用／安裝／價格等事務）
const BUDGETS = ['OFF', 'ONCE', 'OPEN'];
function resolveBudget(ctx) {
  if (ctx && typeof ctx.productBudget === 'string' && BUDGETS.includes(ctx.productBudget)) return ctx.productBudget;
  return (ctx && ctx.productAllowed) ? 'OPEN' : 'OFF';
}

// ─────────────────────────────────────────────────────────────
// ① 掃描
// ─────────────────────────────────────────────────────────────

function scan(userInput, answer, ctx = {}) {
  const text = String(answer == null ? '' : answer);
  const out = [];
  const push = (term, h, layer) => out.push({
    term: canonicalize(term), layer, category: CATEGORY[layer],
    severity: SEVERITY[layer], rewrite_target: REWRITE_TARGET[layer], hf_ref: HF_REF[layer],
    span: [h.start, h.end], matched: h.matched,
    preserve: ['original_intent', 'cognitive_point', 'tone'],
  });

  for (const t of L1_TERMS) for (const h of locate(text, t)) push(t, h, 'L1');
  // S2：否定語境降級（元語言規則的延伸）
  // 「本金安全取決於你自己的風控，不由系統保證」——這類句子在否定風險，不該當成承諾
  const NEG_CTX = /(不能|不會|不会|不由|并非|並非|不是|没有|沒有|无法|無法|不保證|不保证|不承諾|不承诺|取決於你|取决于你|看你自己|你自己|風險自擔|风险自担|不意味着|不意味著|不代表|禁止|不得|切勿)/;
  for (const p of L2_PATTERNS) {
    for (const h of locate(text, p)) {
      // 收緊：否定必須「緊貼在命中詞之前」（支配該詞），才視為否定語境。
      // 例：「不由系統保證本金安全」→ 否定在前 6-10 字內 → 降級
      //     「不會讓你虧到，本金是安全的」→ 否定在承諾句內部 → 不降級
      const pre = text.slice(Math.max(0, h.start - 10), h.start);
      const post = text.slice(h.end, Math.min(text.length, h.end + 8));
      const negBefore = /(不由|不保證|不保证|不承諾|不承诺|并非|並非|不是|不能|取決於你|取决于你|看你自己)$/.test(pre)
                        || /(不由|不保證|不保证|不承諾|不承诺|并非|並非|不是|不能|取決於你|取决于你|看你自己)/.test(pre);
      const negAfter = /^(取決於|取决于|看你自己|不由|並非|并非|不保證|不保证)/.test(post);
      if (negBefore || negAfter) {
        out.push({
          term: canonicalize(p), layer: 'L2n', category: 'SEMANTIC_NEGATED',
          severity: 'MEDIUM', rewrite_target: 'LOG_ONLY', hf_ref: 'HF01',
          span: [h.start, h.end], matched: h.matched,
          preserve: ['original_intent', 'cognitive_point', 'tone'],
        });
      } else {
        push(p, h, 'L2');
      }
    }
  }
  for (const p of L3_PATTERNS) for (const h of locate(text, p)) push(p, h, 'L3');

  // L4：產品提及（依預算）＋ 無條件反駁／挽留
  const budget = resolveBudget(ctx);
  const productCount = {};
  if (budget !== 'OPEN') {
    for (const t of L4_PRODUCT_TERMS) {
      const hits = locate(text, t);
      if (hits.length) productCount[canonicalize(t)] = (productCount[canonicalize(t)] || 0) + hits.length;
      if (budget === 'OFF') for (const h of hits) push(t, h, 'L4');
    }
  }
  if (budget === 'ONCE') {
    // 合併同組提及（聯繫方式算 1 次）
    // 先把「屬於同組（聯繫方式）」的詞從計數中剔除，該組整體只算 1 次（若有命中）
    let total = 0;
    const grouped = new Set();
    for (const grp of L4_MENTION_GROUP) {
      let grpCount = 0;
      for (const raw of grp) {
        const k = canonicalize(raw);
        for (const key of Object.keys(productCount)) {
          // 子串歸屬：DCOGAI 也屬於 Telegram 連結內文
          if (key.includes(k) || k.includes(key)) grpCount += productCount[key];
        }
        if (productCount[k]) grouped.add(k);
      }
      if (grpCount > 0) total += 1;          // 整組算 1 次
    }
    for (const [k, n] of Object.entries(productCount)) {
      // 已歸入聯繫方式組、且其字串被該組涵蓋的，不再重複計
      const inGroup = L4_MENTION_GROUP.some(grp => grp.some(raw => {
        const c = canonicalize(raw);
        return k.includes(c) || c.includes(k);
      }));
      if (!inGroup) total += n;
    }
    if (total > 1) {
      out.push({
        term: Object.keys(productCount).join('+'), layer: 'L4b', category: CATEGORY.L4b,
        severity: SEVERITY.L4b, rewrite_target: REWRITE_TARGET.L4b, hf_ref: HF_REF.L4b,
        span: null, matched: `${total} 次產品提及`,
        preserve: ['original_intent', 'cognitive_point', 'tone'],
      });
    }
  }
  for (const p of L4_PUSHBACK) for (const h of locate(text, p)) push(p, h, 'L4');

  // L5：案例級禁令（僅在 ctx.caseId 命中作用域時掃）
  // 元語言規則：命中被引號包住（「我們不是騙子」這種「引用它來拒絕說它」）→ 降為 MEDIUM 留痕
  if (ctx && ctx.caseId) {
    const caseTable = { ...L5_CASE_PATTERNS, ...L6_ENGINE_PATTERNS };
    for (const [phrase, cfg] of Object.entries(caseTable)) {
      if (!(cfg.scope.includes('*') || cfg.scope.includes(ctx.caseId))) continue;
      for (const h of locate(text, phrase)) {
        const prev = text[h.start - 1] || '';
        const next = text[h.end] || '';
        const quoted = /[「"'“]/.test(prev) || /[」"'”]/.test(next);
        const layer = quoted ? 'L5q' : (cfg.sev === 'MEDIUM' ? 'L5m' : 'L5');
        out.push({
          term: canonicalize(phrase), layer, category: CATEGORY[layer],
          severity: SEVERITY[layer], rewrite_target: REWRITE_TARGET[layer], hf_ref: HF_REF[layer],
          span: [h.start, h.end], matched: h.matched,
          preserve: ['original_intent', 'cognitive_point', 'tone'],
        });
      }
    }
  }

  // L7：結構檢查（形狀，非詞彙）
  //   stopShape='STRICT'（情緒／STOP 語境）：收尾任何提問皆違規（收尾鐵律）
  //   stopShape='SOP'（事務語境）：僅「心理探詢型反問」違規；允許澄清式提問（SOP 不預設）
  //   stopShape='NONE'：不檢查（認知題反問是人格工具）
  const REVERSE_Q = /(你係咪|你是不是|你有冇|你有没有|你係唔係|係驚|係怕|你覺得|你認為|你真正|你其實|捨唔捨得|捨不捨得)/;
  if (ctx && (ctx.stopShape === 'STRICT' || ctx.stopShape === 'SOP')) {
    const sents = String(text).split(/(?<=[。！？!?；;\n])/).map(x => x.trim()).filter(Boolean);
    const last = sents[sents.length - 1] || '';
    const isQuestion = /[？?]\s*$/.test(last);
    const isReverse = REVERSE_Q.test(last);
    const bad = isQuestion && (ctx.stopShape === 'STRICT' ? true : isReverse);
    if (bad) {
      const start = text.lastIndexOf(last);
      out.push({
        term: '反問收尾', layer: 'L7', category: CATEGORY.L7,
        severity: SEVERITY.L7, rewrite_target: REWRITE_TARGET.L7, hf_ref: HF_REF.L7,
        span: [start < 0 ? 0 : start, last.length],
        matched: last.slice(0, 40),
        preserve: ['original_intent', 'cognitive_point', 'tone'],
      });
    }
  }

  // 去重（同層同詞同位置）
  const seen = new Set();
  return out.filter(v => {
    const k = `${v.layer}|${v.term}|${v.span ? v.span[0] + ',' + v.span[1] : 'n'}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ─────────────────────────────────────────────────────────────
// ③ 局部重寫
// ─────────────────────────────────────────────────────────────

function splitSentences(text) {
  return String(text).split(/(?<=[。！？!?；;\n])/);
}

function applyTable(text, table) {
  let s = text, n = 0;
  for (const [bad, good] of table) {
    const re = flexRe(bad);
    if (re.test(s)) { s = s.replace(flexRe(bad), good); n++; }
  }
  return { text: s, applied: n };
}

function rewriteTerms(text, violations) {
  let s = text, n = 0;
  const seen = new Set();
  for (const v of violations) {
    if (v.layer !== 'L1' || seen.has(v.term)) continue;
    seen.add(v.term);
    const good = TERM_FALLBACK[v.term];
    if (!good) continue;
    const re = flexRe(v.term);
    if (re.test(s)) { s = s.replace(flexRe(v.term), good); n++; }
  }
  return { text: s, applied: n };
}

function dropViolatingSentences(text, userInput, ctx) {
  const kept = [], dropped = [];
  for (const sen of splitSentences(text)) {
    if (!sen.trim()) { kept.push(sen); continue; }
    const v = scan(userInput, sen, ctx).filter(x => x.severity !== 'MEDIUM');
    if (v.length) dropped.push({ sentence: sen, violations: v.map(x => x.term) });
    else kept.push(sen);
  }
  return { text: kept.join('').trim(), dropped };
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

const LOCAL_REWRITE_MAX = 1;
const SAFE_REGEN_MAX = 1;
const SAFE_FALLBACK = '抱歉，姐姐換個講法。你可以再問一次，或者講清楚你而家最想解決嘅係邊一件事。';

function blockingOf(vs) { return vs.filter(x => x.severity !== 'MEDIUM'); }

function run({ userInput = '', answer = '', ctx = {}, regen = null } = {}) {
  const t0 = Date.now();
  const trace = {
    generation: { raw_answer: answer, violations: [] },
    repair: null,
    validation: { pass_1: false, pass_2: null },
    metrics: { raw_hit: 0, repair_ok: 0, blocked: 0 },
    latency_ms: 0,
  };

  let v = scan(userInput, answer, ctx);
  trace.generation.violations = v;
  trace.validation.pass_1 = v.length === 0;
  if (!v.length) { trace.latency_ms = Date.now() - t0; return { answer, violations: [], trace, blocked: false, gate_status: 'PASS' }; }

  trace.metrics.raw_hit = 1;
  let blocking = blockingOf(v);
  trace.metrics.blocking_hit = blocking.length ? 1 : 0;

  // 語言守門：中文模式閘門不得改寫英文文本（避免往英文句裡塞中文＝製造新違規）
  // 英文回覆只做「偵測 + 記日誌」，修復屬於英文 prompt 層的責任。
  if (String((ctx && ctx.lang) || 'zh').toLowerCase() === 'english') {
    trace.metrics.english_log_only = 1;
    trace.latency_ms = Date.now() - t0;
    return { answer, violations: v, trace, blocked: false, note: 'ENGLISH_LOG_ONLY' };
  }

  // 只有 MEDIUM（記錄級）違規 → 不改寫、不阻斷，直接放行並留痕
  if (!blocking.length) {
    trace.validation.pass_1 = true;
    trace.metrics.medium_only = 1;
    trace.latency_ms = Date.now() - t0;
    return { answer, violations: v, trace, blocked: false, note: 'MEDIUM_ONLY' };
  }

  let current = answer;
  let attempts = 0;
  while (attempts < LOCAL_REWRITE_MAX && blocking.length) {
    attempts++;
    // 首選：已知句式表
    current = applyTable(current, PHRASE_TABLE).text;
    // 次選：L1 詞級兜底
    current = rewriteTerms(current, blocking).text;
    // L3：還權改寫（CRITICAL 優先）
    current = applyTable(current, L3_REWRITE).text;

    let v2 = blockingOf(scan(userInput, current, ctx));
    let strategy = 'PHRASE_TABLE+TERM_FALLBACK+L3_RESTORE';
    if (v2.length) {
      // 最後的確定性手段：局部刪句（保留其餘內容）
      const drop = dropViolatingSentences(current, userInput, ctx);
      current = drop.text;
      v2 = blockingOf(scan(userInput, current, ctx));
      strategy += '+SENTENCE_DROP';
      trace.repair = { action: 'LOCAL_REWRITE', strategy, result: current, dropped: drop.dropped };
    } else {
      trace.repair = { action: 'LOCAL_REWRITE', strategy, result: current };
    }

    // 長度守門：修復不得把答案削成空殼
    const tooShort = current.replace(/\s/g, '').length < Math.max(6, Math.floor(String(answer).replace(/\s/g, '').length * 0.30));
    if (!v2.length && !tooShort) {
      trace.validation.pass_2 = true;
      trace.metrics.repair_ok = 1;
      trace.latency_ms = Date.now() - t0;
      return { answer: current, violations: v, trace, blocked: false, gate_status: 'REPAIR' };
    }
    if (!v2.length && tooShort) { trace.repair.too_short = true; trace.validation.pass_2 = false; break; }
    trace.validation.pass_2 = false;
    blocking = v2;
  }

  // ⑤ 攔截 → 安全重生成（由呼叫方提供）
  if (typeof regen === 'function') {
    try {
      const safe = regen(userInput, v);
      if (safe && !blockingOf(scan(userInput, safe, ctx)).length) {
        trace.repair = { action: 'SAFE_REGEN', result: safe };
        trace.validation.pass_2 = true;
        trace.metrics.repair_ok = 1;
        trace.latency_ms = Date.now() - t0;
        return { answer: safe, violations: v, trace, blocked: false };
      }
    } catch (e) { /* fallthrough */ }
  }

  // ⑥ ESCALATE：連續高風險（同一 session 第 ≥2 次）→ 內部升級，非轉人工
  //    依 V10.8 規格：ESCALATE ≠ 自動轉人工，僅內部處理狀態（回安全模板）
  if (ctx && Number(ctx.priorRiskCount || 0) >= 1) {
    trace.repair = { action: 'ESCALATE', result: SAFE_FALLBACK,
                     note: '連續高風險，內部升級（非轉人工）' };
    trace.metrics.blocked = 1;
    trace.metrics.escalated = 1;
    trace.validation.blocked = true;
    trace.validation.escalate = true;
    trace.latency_ms = Date.now() - t0;
    return { answer: SAFE_FALLBACK, violations: v, trace, blocked: true,
             gate_status: 'ESCALATE' };
  }

  // ⑦ 永不放行：回退安全模板
  trace.repair = { action: 'FALLBACK', result: SAFE_FALLBACK };
  trace.metrics.blocked = 1;
  trace.validation.blocked = true;
  trace.latency_ms = Date.now() - t0;
  return { answer: SAFE_FALLBACK, violations: v, trace, blocked: true, gate_status: 'BLOCK' };
}

// ─────────────────────────────────────────────────────────────
// 異步版本：確定性優先 → LLM 局部改寫（只改仍違規的句子）→ 局部刪句兜底
// 判定權仍在確定性掃描；rewriter 只提供修復文本。
// ─────────────────────────────────────────────────────────────

async function runAsync({ userInput = '', answer = '', ctx = {}, rewriter = null, regen = null } = {}) {
  const t0 = Date.now();
  const trace = {
    generation: { raw_answer: answer, violations: [] },
    repair: null, validation: { pass_1: false, pass_2: null },
    metrics: { raw_hit: 0, repair_ok: 0, blocked: 0 }, latency_ms: 0,
  };

  let v = scan(userInput, answer, ctx);
  trace.generation.violations = v;
  trace.validation.pass_1 = v.length === 0;
  if (!v.length) { trace.latency_ms = Date.now() - t0; return { answer, violations: [], trace, blocked: false }; }

  trace.metrics.raw_hit = 1;
  let blocking = blockingOf(v);
  trace.metrics.blocking_hit = blocking.length ? 1 : 0;
  if (!blocking.length) {
    trace.validation.pass_1 = true; trace.metrics.medium_only = 1; trace.latency_ms = Date.now() - t0;
    return { answer, violations: v, trace, blocked: false, note: 'MEDIUM_ONLY' };
  }

  // ① 確定性修復（零延遲）
  let current = answer;
  current = applyTable(current, PHRASE_TABLE).text;
  current = rewriteTerms(current, blocking).text;
  current = applyTable(current, L3_REWRITE).text;
  let v2 = blockingOf(scan(userInput, current, ctx));
  const strategies = ['PHRASE_TABLE+TERM_FALLBACK+L3_RESTORE'];

  // ② LLM 局部改寫——只把仍違規的句子送出去，其餘逐字保留
  if (v2.length && typeof rewriter === 'function') {
    const sents = String(current).split(/(?<=[。！？!?；;\n])/);
    const rebuilt = [];
    for (const sen of sents) {
      if (!sen.trim()) { rebuilt.push(sen); continue; }
      const sv = blockingOf(scan(userInput, sen, ctx));
      if (!sv.length) { rebuilt.push(sen); continue; }
      // 路由規則（由 11 行盲評反推）：SOP 語境的收尾反問 → 不走 LLM（避免把反問改寫成對用戶心理的斷言），
      // 交由下方確定性刪句處理。情緒／STOP 語境的收尾反問 → 走 LLM 產出定心丸式收尾。
      const onlyL7 = sv.every(v => v.layer === 'L7');
      if (onlyL7 && ctx && ctx.stopShape === 'SOP') { trace.llm_skipped = (trace.llm_skipped || 0) + 1; rebuilt.push(sen); continue; }
      let fixed = sen;
      try { fixed = (await rewriter(sen, sv, ctx)) || sen; } catch (e) { fixed = sen; }
      // 逐句守門：防加話／防掏空／防引入新違規；任一不合格 → 退回原句（由上層兜底）
      const olen = sen.replace(/\s/g, '').length;
      const flen = String(fixed).replace(/\s/g, '').length;
      const tooLong = flen > olen * 1.3 + 10;
      const tooBare = flen < olen * 0.35;
      const cnt = t => (String(t).match(/[。！？!?；;]/g) || []).length;
      const padded = cnt(fixed) > cnt(sen) + 1;   // 句數暴增＝加話
      const newBad = blockingOf(scan(userInput, fixed, ctx)).length > 0;
      if (tooLong || tooBare || newBad || padded) { trace.llm_rejected = (trace.llm_rejected || 0) + 1; fixed = sen; }
      rebuilt.push(fixed);
    }
    current = rebuilt.join('').trim();
    v2 = blockingOf(scan(userInput, current, ctx));
    strategies.push('LLM_LOCAL_REWRITE');
  }

  // ③ 確定性兜底：局部刪句
  if (v2.length) {
    const drop = dropViolatingSentences(current, userInput, ctx);
    current = drop.text;
    v2 = blockingOf(scan(userInput, current, ctx));
    strategies.push('SENTENCE_DROP');
    trace.repair = { action: 'LOCAL_REWRITE', strategy: strategies.join('+'), result: current, dropped: drop.dropped };
  } else {
    trace.repair = { action: 'LOCAL_REWRITE', strategy: strategies.join('+'), result: current };
  }

  const tooShort = current.replace(/\s/g, '').length < Math.max(6, Math.floor(String(answer).replace(/\s/g, '').length * 0.30));
  if (!v2.length && !tooShort) {
    trace.validation.pass_2 = true; trace.metrics.repair_ok = 1; trace.latency_ms = Date.now() - t0;
    return { answer: current, violations: v, trace, blocked: false };
  }
  if (!v2.length && tooShort) { trace.repair.too_short = true; }

  if (typeof regen === 'function') {
    try {
      const safe = regen(userInput, v);
      if (safe && !blockingOf(scan(userInput, safe, ctx)).length) {
        trace.repair = { action: 'SAFE_REGEN', result: safe };
        trace.validation.pass_2 = true; trace.metrics.repair_ok = 1; trace.latency_ms = Date.now() - t0;
        return { answer: safe, violations: v, trace, blocked: false };
      }
    } catch (e) { /* fallthrough */ }
  }

  trace.repair = { action: 'FALLBACK', result: SAFE_FALLBACK };
  trace.metrics.blocked = 1; trace.validation.blocked = true; trace.latency_ms = Date.now() - t0;
  return { answer: SAFE_FALLBACK, violations: v, trace, blocked: true };
}

// ─────────────────────────────────────────────────────────────
// 指標
// ─────────────────────────────────────────────────────────────

function metricsFrom(results) {
  const n = results.length || 1;
  const raw = results.filter(r => r.trace.metrics.raw_hit).length;
  const repairOk = results.filter(r => r.trace.metrics.repair_ok).length;
  const blocked = results.filter(r => r.trace.metrics.blocked).length;
  // 分母只算「有待修復的阻斷級違規」——MEDIUM（記錄級）不計入修復率
  const needRepair = results.filter(r => r.trace.metrics.blocking_hit).length;
  return {
    total: results.length,
    RAW_LEAKAGE_RATE: raw / n,
    REPAIR_SUCCESS_RATE: needRepair ? repairOk / needRepair : 1,
    FINAL_BLOCK_RATE: blocked / n,
    raw, repairOk, blocked, needRepair,
  };
}





// ─────────────────────────────────────────────────────────────
// 前端便利層（V10.7）
// ─────────────────────────────────────────────────────────────

/** 前端 Router（簡化版，與後台 derive_ctx 規則一致） */
function deriveCtx(message, lang) {
  const L = String(lang || '').toLowerCase();
  if (L === 'en' || L === 'english') {
    return { caseId: null, productBudget: 'OPEN', stopShape: 'NONE', lang: 'english' };
  }
  const msg = String(message || '');
  const TXN = /(怎麼裝|怎么装|安裝|安装|綁定|绑定|權限|权限|API|價格|价格|多少錢|多少钱|退款|分期|客服|下載|下载|開通|开通|試用|试用)/;
  const EMO = /(虧|亏|怕|崩潰|崩溃|焦慮|焦虑|睡不著|睡不着|翻本|騙|骗|割韭菜|垃圾|沒用|没用|後悔|后悔|不敢|完了)/;
  if (TXN.test(msg)) return { caseId: null, productBudget: 'OPEN', stopShape: 'SOP' };
  if (EMO.test(msg)) return { caseId: null, productBudget: 'OFF', stopShape: 'STRICT' };
  return { caseId: null, productBudget: 'ONCE', stopShape: 'NONE' };
}

/** 一行接入：gateText(reply, 用戶原話, lang) → { answer, blocked, violations, trace }（fail-safe） */
function gateText(reply, userInput, lang) {
  const text = reply == null ? '' : String(reply);
  try {
    const ctx = deriveCtx(userInput, lang);
    return run({ userInput: userInput || '', answer: text, ctx: ctx });
  } catch (e) {
    let banned = [];
    try { banned = L1_TERMS.filter(function (w) { return canonicalize(text).indexOf(canonicalize(w)) >= 0; }); } catch (_) {}
    if (!banned.length) return { answer: text, violations: [], blocked: false, degraded: true, trace: { metrics: { gate_error: 1 } } };
    return { answer: SAFE_FALLBACK, violations: [], blocked: true, degraded: true, trace: { metrics: { gate_error: 1 } } };
  }
}

const _api = {
  canonicalize: canonicalize, stripNoise: stripNoise, locate: locate, scan: scan, run: run,
  metricsFrom: metricsFrom, applyTable: applyTable, rewriteTerms: rewriteTerms,
  dropViolatingSentences: dropViolatingSentences,
  L1_TERMS: L1_TERMS, L2_PATTERNS: L2_PATTERNS, L3_PATTERNS: L3_PATTERNS,
  L4_PRODUCT_TERMS: L4_PRODUCT_TERMS, L4_PUSHBACK: L4_PUSHBACK,
  PHRASE_TABLE: PHRASE_TABLE, L3_REWRITE: L3_REWRITE, TERM_FALLBACK: TERM_FALLBACK,
  L5_CASE_PATTERNS: L5_CASE_PATTERNS, L6_ENGINE_PATTERNS: L6_ENGINE_PATTERNS,
  LOCAL_REWRITE_MAX: LOCAL_REWRITE_MAX, SAFE_REGEN_MAX: SAFE_REGEN_MAX,
  SAFE_FALLBACK: SAFE_FALLBACK, BUDGETS: BUDGETS, resolveBudget: resolveBudget,
  deriveCtx: deriveCtx, gateText: gateText, version: 'V10.7'
};

  if (typeof window !== "undefined") { window.DCSafetyGate = _api; }
})();
/* ===== /V10.7 Safety Gate ===== */