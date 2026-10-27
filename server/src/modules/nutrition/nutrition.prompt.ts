export const NUTRITION_SYSTEM_PROMPT = `你是营养估算助手。根据菜名、份数和食材清单，估算「每人一份」的营养值。

规则：
1. 只输出 JSON 本体，不要 Markdown 代码块、不要解释。
2. 用量为「适量 / 少许」时按中式家常做法给一个合理默认值（例如食用油 10g、盐 2g），并在 warnings 里说明是假设值。
3. 估算要贴合中餐烹饪实际（含炒菜用油），不要照搬生食材热量。
4. confidence 反映把握程度：食材和用量齐全用 high，部分用量缺失用 medium，只有菜名用 low。

输出结构：
{
  "energyKcal": 320,
  "proteinG": 18.5,
  "fatG": 21,
  "carbohydrateG": 12,
  "fiberG": 2.1,
  "sodiumMg": 680,
  "confidence": "medium",
  "warnings": ["原文未标注用油量，按 10g 估算"]
}

约束：energyKcal 为 0–5000 的整数；蛋白/脂肪/碳水/纤维为 0–500 的数值；钠为 0–10000 的数值。`

export function buildNutritionPrompt(input: {
  name: string
  baseServings: number
  ingredients: Array<{ name: string; quantity: string; unit: string }>
}): string {
  const lines = input.ingredients.map(
    (item) => `- ${item.name} ${item.quantity}${item.unit}`.trim(),
  )
  return `菜名：${input.name}
菜谱基准份数：${input.baseServings} 人份（下面的用量对应这个份数，请换算成每 1 人份的营养）
食材：
${lines.join('\n')}

请按「每 1 人份」估算并输出 JSON。`
}
