-- CreateTable
CREATE TABLE "FoodMappingCandidate" (
    "id" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "foodDescription" TEXT NOT NULL,
    "usdaFdcId" INTEGER NOT NULL,
    "usdaDescription" TEXT NOT NULL,
    "usdaDataType" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "FoodVocabularyVerificationStatus" NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "FoodMappingCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodMappingCandidate_normalizedDescription_idx" ON "FoodMappingCandidate"("normalizedDescription");

-- CreateIndex
CREATE INDEX "FoodMappingCandidate_status_idx" ON "FoodMappingCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FoodMappingCandidate_normalizedDescription_usdaFdcId_key" ON "FoodMappingCandidate"("normalizedDescription", "usdaFdcId");
