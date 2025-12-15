import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/check", (req, res) => {
  const drugs = req.body.drugs;

  if (!Array.isArray(drugs) || drugs.length < 2) {
    return res.status(400).json({
      error: "2剤以上入力してください"
    });
  }

  const results = [];

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      results.push({
        drug_a: drugs[i],
        drug_b: drugs[j],
        severity: "Medium",
        description: "（サンプル）相互作用の可能性があります"
      });
    }
  }

  res.json({
    summary: {
      checked_pairs: results.length
    },
    pairs: results
  });
});

app.listen(3000, () => {
  console.log("API 起動中：http://localhost:3000");
});
