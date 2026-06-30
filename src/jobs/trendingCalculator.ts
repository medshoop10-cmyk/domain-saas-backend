import { recalculateRanks } from "../services/trending";

export async function calculateTrending() {
  console.log("[TrendingCalculator] Recalculating trending ranks...");
  await recalculateRanks();
  console.log("[TrendingCalculator] Complete.");
}
