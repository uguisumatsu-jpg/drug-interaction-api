import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/**
 * ルートA：自前DB（最小） + PMDA検索リンク
 * - まずは「よく出る相互作用」だけ入れて拡張していく
 * - PMDA本文を自動抽出しない（著作権/運用/品質の観点）
 */

// 1) 同義語辞書（入力 → 成分キー）
// ここを増やしていく。最初は腎臓内科頻出からでOK。
const DRUG_SYNONYMS = {
  // NSAIDs / ACEi例
  "ロキソプロフェン": "loxoprofen",
  "ロキソプロフェンナトリウム": "loxoprofen",
  "ロキソニン": "loxoprofen",
  "エナラプリル": "enalapril",
  "エナラプリルマレイン酸塩": "enalapril",

  // 例：クラリスロマイシン（CYP3A4阻害薬の例として）
  "クラリスロマイシン": "clarithromycin",
  "クラリシッド": "clarithromycin",
};

// 2) 相互作用DB（成分キー×成分キー）
// keyは "a|b"（a<bでソートしたもの）で統一
const INTERACTIONS = {
  // 例：NSAIDs + ACEi（腎機能低下/高Kなど）
  "enalapril|loxoprofen": {
    severity: "Medium",
    description:
      "NSAIDs併用で腎血流低下→ACE阻害薬の降圧効果減弱や腎機能悪化の可能性。高齢・脱水・CKDでは注意。腎機能/電解質モニター推奨。",
    // PMDAは「根拠確認」用に検索URLを返す（スクレイピングしない）
  },

  // 例：クラリスロマイシン +（CYP3A4基質薬があれば追加していく）
  // "drugA|clarithromycin": {...}
};

// 日本語の表記ゆれ吸収（最小）
// - 全角スペース除去、前後トリム、括弧内を落とす等（必要に応じて拡張）
function normalizeName(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .replace(/\s+/g, "")        // 空白除去
    .replace(/（.*?）/g, "");   // （）内を除去（商品名注記など）
}

function toIngredientKey(name) {
  const n = normalizeName(name);
  // 完全一致をまず優先（将来ここに部分一致/かな変換等を追加してもよい）
  return DRUG_SYNONYMS[n] || null;
}

function makePairKey(a, b) {
  return [a, b].sort().join("|");
}

// PMDA検索URL（入力語で検索させる）
// ※PMDAのURL仕様は変更される可能性があるので、最初は「検索クエリURL」で十分
function pmdaSearchUrl(query) {
  const q = encodeURIComponent(query);
  // 「PMDA + 薬剤名」でユーザーに検索させる方式（仕様変更に強い）
  // もしPMDAサイト内検索URLを使いたければ後で差し替え可
  return `https://www.google.com/search?q=${q}+PMDA+%E6%B7%BB%E4%BB%98%E6%96%87%E6%9B%B8`;
}

app.post("/api/check", (req, res) => {
  const drugsRaw = req.body?.drugs;

  if (!Array.isArray(drugsRaw) || drugsRaw.length < 2) {
    return res.status(400).json({ error: "2剤以上入力してください" });
  }

  // 入力を正規化し、空を除外
  const drugs = drugsRaw.map(normalizeName).filter(Boolean);

  if (drugs.length < 2) {
    return res.status(400).json({ error: "2剤以上入力してください" });
  }

  const results = [];

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const drugA = drugs[i];
      const drugB = drugs[j];

      const keyA = toIngredientKey(drugA);
      const keyB = toIngredientKey(drugB);

      // 成分キーが取れない場合は「不明」扱い（MVPでは正直に返す）
      if (!keyA || !keyB) {
        results.push({
          drug_a: drugA,
          drug_b: drugB,
          severity: "Unknown",
          description:
            "相互作用データベースに未登録の可能性があります。添付文書（PMDA）で相互作用欄を確認してください。",
          pmda_url_a: pmdaSearchUrl(drugA),
          pmda_url_b: pmdaSearchUrl(drugB),
        });
        continue;
      }

      const pairKey = makePairKey(keyA, keyB);
      const hit = INTERACTIONS[pairKey];

      if (hit) {
        results.push({
          drug_a: drugA,
          drug_b: drugB,
          severity: hit.severity,
          description: hit.description,
          pmda_url_a: pmdaSearchUrl(drugA),
          pmda_url_b: pmdaSearchUrl(drugB),
        });
      } else {
        // DBにない＝相互作用なし とは断定しない（医師向けに誠実に）
        results.push({
          drug_a: drugA,
          drug_b: drugB,
          severity: "Unknown",
          description:
            "相互作用データベースに該当ペアが未登録です。添付文書（PMDA）で相互作用欄を確認してください。",
          pmda_url_a: pmdaSearchUrl(drugA),
          pmda_url_b: pmdaSearchUrl(drugB),
        });
      }
    }
  }

  res.json({
    meta: { version: "v2-2026-02-24" },
    summary: { checked_pairs: results.length },
    pairs: results,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API 起動中：http://localhost:${PORT}`);
});
