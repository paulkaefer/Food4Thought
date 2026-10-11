-- CreateEnum
CREATE TYPE "DietaryRestrictionType" AS ENUM ('gluten_free', 'vegetarian', 'vegan', 'nut_allergy', 'shellfish_allergy', 'avoid_pork');

-- CreateEnum
CREATE TYPE "MealLogStatus" AS ENUM ('processing', 'identified', 'needs_confirmation', 'rejected_non_food', 'rejected_low_quality', 'rejected_invalid_file', 'empty_plate');

-- CreateEnum
CREATE TYPE "FoodItemIdentificationStatus" AS ENUM ('confirmed', 'pending_user_confirmation');

-- CreateEnum
CREATE TYPE "FoodItemDataSource" AS ENUM ('visual_estimate', 'packaged_label', 'restaurant_data');

-- CreateEnum
CREATE TYPE "Allergen" AS ENUM ('shellfish', 'peanuts', 'tree_nuts', 'pork');

-- CreateEnum
CREATE TYPE "DietaryConflictReason" AS ENUM ('conflict_detected', 'cannot_verify');

-- CreateEnum
CREATE TYPE "ConsumptionMethod" AS ENUM ('manual_fraction', 'per_item', 'photo_comparison');

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietaryRestriction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DietaryRestrictionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DietaryRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLogEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforePhotoUrl" TEXT NOT NULL,
    "afterPhotoUrl" TEXT,
    "status" "MealLogStatus" NOT NULL,
    "isFunEstimate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MealLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL,
    "mealLogEntryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "identificationStatus" "FoodItemIdentificationStatus" NOT NULL DEFAULT 'pending_user_confirmation',
    "dataSource" "FoodItemDataSource" NOT NULL DEFAULT 'visual_estimate',
    "consumptionFraction" DOUBLE PRECISION,
    "portionAmount" DOUBLE PRECISION,
    "portionRangeMin" DOUBLE PRECISION,
    "portionRangeMax" DOUBLE PRECISION,
    "portionUnit" TEXT NOT NULL DEFAULT 'g',
    "portionIsApproximate" BOOLEAN NOT NULL DEFAULT false,
    "portionConfidenceWarning" TEXT,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "micronutrients" JSONB NOT NULL DEFAULT '{}',
    "nutritionIsApproximate" BOOLEAN NOT NULL DEFAULT false,
    "uncertaintyReason" TEXT,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllergenLabel" (
    "id" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "allergen" "Allergen" NOT NULL,

    CONSTRAINT "AllergenLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietaryConflictFlag" (
    "id" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "restrictionType" "DietaryRestrictionType" NOT NULL,
    "reason" "DietaryConflictReason" NOT NULL,
    "confirmedByUser" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DietaryConflictFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionRecord" (
    "id" TEXT NOT NULL,
    "mealLogEntryId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "method" "ConsumptionMethod" NOT NULL,
    "consumedFraction" DOUBLE PRECISION NOT NULL,
    "derivedFromAfterPhotoUrl" TEXT,
    "removalSuspected" BOOLEAN NOT NULL DEFAULT false,
    "addedFoodDetected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DietaryRestriction_userId_type_key" ON "DietaryRestriction"("userId", "type");

-- AddForeignKey
ALTER TABLE "DietaryRestriction" ADD CONSTRAINT "DietaryRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLogEntry" ADD CONSTRAINT "MealLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_mealLogEntryId_fkey" FOREIGN KEY ("mealLogEntryId") REFERENCES "MealLogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllergenLabel" ADD CONSTRAINT "AllergenLabel_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietaryConflictFlag" ADD CONSTRAINT "DietaryConflictFlag_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionRecord" ADD CONSTRAINT "ConsumptionRecord_mealLogEntryId_fkey" FOREIGN KEY ("mealLogEntryId") REFERENCES "MealLogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionRecord" ADD CONSTRAINT "ConsumptionRecord_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
