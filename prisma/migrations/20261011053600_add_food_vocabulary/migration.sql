-- CreateEnum
CREATE TYPE "FoodVocabularyVerificationStatus" AS ENUM ('proposed', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "FoodVocabularyVerifiedBy" AS ENUM ('automated', 'human');

-- CreateTable
CREATE TABLE "FoodVocabulary" (
    "id" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "foodDescription" TEXT NOT NULL,
    "usdaFdcId" INTEGER NOT NULL,
    "usdaDescription" TEXT NOT NULL,
    "usdaDataType" TEXT NOT NULL,
    "verificationStatus" "FoodVocabularyVerificationStatus" NOT NULL DEFAULT 'proposed',
    "verifiedBy" "FoodVocabularyVerifiedBy",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "FoodVocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodVocabulary_normalizedDescription_key" ON "FoodVocabulary"("normalizedDescription");

-- CreateIndex
CREATE INDEX "FoodVocabulary_usdaFdcId_idx" ON "FoodVocabulary"("usdaFdcId");

-- CreateIndex
CREATE INDEX "FoodVocabulary_verificationStatus_idx" ON "FoodVocabulary"("verificationStatus");
