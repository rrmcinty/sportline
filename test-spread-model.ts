import { getHomeSpreadCoverProbabilities, getHomeWinModelProbabilities } from "./dist/model/apply.js";

async function test() {
  console.log("Testing spread model predictions...");
  const mlProbs = await getHomeWinModelProbabilities("cfb", "20251129");
  const spreadProbs = await getHomeSpreadCoverProbabilities("cfb", "20251129");
  
  if (!mlProbs) {
    console.log("❌ No moneyline model probabilities returned");
  } else {
    console.log(`✅ Got ${mlProbs.size} moneyline predictions`);
  }
  
  if (!spreadProbs) {
    console.log("❌ No spread model probabilities returned");
  } else {
    console.log(`✅ Got ${spreadProbs.size} spread predictions`);
  }
  
  if (!mlProbs || !spreadProbs) return;
  
  // Show first 5 with both predictions
  console.log("\nSample predictions:");
  let count = 0;
  for (const [eventId, spreadProb] of spreadProbs) {
    const mlProb = mlProbs.get(eventId);
    if (mlProb) {
      console.log(`  Event ${eventId}:`);
      console.log(`    Moneyline: ${(mlProb * 100).toFixed(1)}% home win`);
      console.log(`    Spread:    ${(spreadProb * 100).toFixed(1)}% home cover`);
    }
    count++;
    if (count >= 5) break;
  }
}

test().catch(console.error);
