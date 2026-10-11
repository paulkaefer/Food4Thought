-- CreateEnum
CREATE TYPE "FoodItemUsdaMatchSource" AS ENUM ('verified_mapping', 'ai_selected', 'name_search', 'user_selected');

-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "usdaCandidates" JSONB,
ADD COLUMN     "usdaDescription" TEXT,
ADD COLUMN     "usdaFdcId" INTEGER,
ADD COLUMN     "usdaMatchSource" "FoodItemUsdaMatchSource";
