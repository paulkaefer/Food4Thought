# Feature Specification: Meal Photo Nutrition Tracking

**Feature Branch**: `001-meal-photo-nutrition-tracking`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Build a food photo nutrition-tracking app. Users photograph or upload a picture of a meal, and the app identifies the foods, estimates nutrition, flags allergens and dietary conflicts, and tracks how much of the meal was actually eaten. The goal is to make calorie and nutrient logging fast and low-effort while being honest, and lighthearted, about how uncertain visual estimates are."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identify foods and estimate nutrition from a photo (Priority: P1)

A user takes or uploads a clear photo of a meal and receives nutrition information — calories, macronutrients, and micronutrients — without any manual data entry, for both single-item and multi-item plates.

**Why this priority**: This is the core value proposition of the app. Without accurate, fast food identification and nutrition estimation, there is no product.

**Independent Test**: Can be fully tested by uploading a clear photo of a single known food (e.g., an apple) and a clear photo of a multi-item plate (e.g., grilled chicken, rice, broccoli), and verifying that per-item and combined nutrition data is returned within the target time.

**Acceptance Scenarios**:

1. **Given** a clear photo of a single food (e.g., one apple), **When** the user submits the photo, **Then** the app identifies the food and displays estimated calories, protein, carbohydrates, fat, and relevant vitamins/minerals.
2. **Given** a clear photo of a plate with multiple distinct foods (e.g., grilled chicken, rice, broccoli), **When** the user submits the photo, **Then** the app identifies each food item separately, shows per-item macros and micronutrients, and shows a combined meal total.
3. **Given** any successfully processed photo, **When** the scan completes, **Then** results are displayed within 5 seconds.
4. **Given** the user has not granted camera access, **When** the user attempts to take a photo, **Then** the app requests camera permission, and the user may alternatively upload an existing photo without granting camera access.
5. **Given** a photo showing a very large portion of food, **When** the app estimates the portion size, **Then** the estimate reflects the actual visible size rather than defaulting to a standard serving size.

---

### User Story 2 - Be honest about uncertainty and bad input, with a lighthearted tone (Priority: P1)

A user submits a photo that is unclear, doesn't contain food, is empty, or is otherwise problematic, and the app responds with a friendly, playful, but informative message that never presents guesses as verified fact and never fabricates nutrition data.

**Why this priority**: Presenting fabricated or overconfident nutrition data erodes trust and can mislead health-conscious users. Handling bad or ambiguous input honestly (while staying lighthearted) is core to the product's identity and is as critical as the happy path.

**Independent Test**: Can be fully tested by submitting a set of known problematic images (non-food, blurry, empty plate, ambiguous portion, hidden-ingredient dish, visually-ambiguous food, invalid file type, corrupted file) and verifying each produces the correct category of response with no fabricated real nutrition data.

**Acceptance Scenarios**:

1. **Given** a photo containing no food (e.g., a shoe), **When** the user submits it, **Then** the app cheerfully reports that no real food was detected, may optionally show a clearly labeled "just for fun" estimate, and that fun estimate is never added to the food log or daily totals and is never presented as real nutrition data.
2. **Given** a blurry or poorly lit photo, **When** the user submits it, **Then** the app lightheartedly explains the image quality is insufficient to identify the food, asks the user to retake or upload a clearer image, and shows no nutrition data.
3. **Given** a photo of an empty plate, **When** the user submits it, **Then** the app recognizes no measurable food is present, assigns 0 calories, and responds with a lighthearted note.
4. **Given** a photo with an ambiguous portion size (no scale reference, unusual angle, or distance), **When** the app estimates nutrition, **Then** the app shows a range rather than a single exact number and labels the result as approximate; estimates for the same food from different angles/distances remain reasonably consistent or the app warns that portion size can't be reliably determined.
5. **Given** a photo of a dish with hidden or unclear ingredients (e.g., a burger with sauces or toppings), **When** the app estimates nutrition, **Then** the app states the values are estimates because ingredients can't be seen, and may playfully reference the "mystery" ingredients.
6. **Given** a photo of a food that closely resembles a different food with very different nutrition (e.g., mashed potatoes vs. cauliflower mash), **When** the app identifies it, **Then** the app shows its confidence level and lets the user confirm or correct the identification before finalizing nutrition data.
7. **Given** an invalid file type (e.g., PDF, plain text) or a corrupted/unsupported image, **When** the user submits it, **Then** the app rejects it with a clear, friendly, understandable message describing what went wrong and how to fix it, without crashing.

---

### User Story 3 - Allergens and dietary restrictions (Priority: P1)

A user sees explicit allergen labeling on every result, and the app checks identified foods against the user's saved dietary restrictions, asking for confirmation whenever compliance can't be verified from the photo alone.

**Why this priority**: Undetected allergens or falsely-assumed dietary compliance can cause real physical harm, making this a P1 alongside core identification and honesty.

**Independent Test**: Can be fully tested by submitting photos of foods with common allergens (with and without a restriction on file) and photos of ambiguous-compliance foods (e.g., a muffin for a gluten-free user), and verifying flags and confirmation prompts appear correctly.

**Acceptance Scenarios**:

1. **Given** any identified food containing a common allergen (shellfish, peanuts, tree nuts, and similar) or pork, **When** results are displayed, **Then** the allergen is explicitly labeled regardless of whether the user has a related restriction on file.
2. **Given** a user profile, **When** the user sets dietary restrictions (e.g., gluten-free, vegetarian, nut allergy, avoid pork), **Then** those restrictions are saved and applied to future results.
3. **Given** a food whose compliance with a saved restriction cannot be visually verified (e.g., a muffin for a gluten-free user), **When** results are shown, **Then** the app does not assume compliance and instead flags a potential conflict.
4. **Given** an identified food that conflicts with or cannot be verified against a saved restriction, **When** the user attempts to log it, **Then** the app asks the user to confirm the ingredients before logging, rather than silently estimating nutrition.

---

### User Story 4 - Track how much of the meal was actually eaten (Priority: P2)

A user records how much of a logged meal they actually consumed — manually as a whole-meal fraction, per individual food item, or via a before/after photo comparison — and the app recalculates consumed calories and nutrients accordingly.

**Why this priority**: This refines logging accuracy after the meal has already been identified and is valuable but not required for the app's core MVP of identifying and estimating nutrition.

**Independent Test**: Can be fully tested by logging a meal, then setting a consumption fraction (manually, per-item, or via a second photo) and verifying consumed nutrition values scale correctly.

**Acceptance Scenarios**:

1. **Given** a logged meal, **When** the user marks it as 100%, 50%, 25%, or 0% eaten, **Then** consumed calories and all nutrients scale proportionally (e.g., 50% of a 600-calorie meal is about 300 calories; 0% is 0).
2. **Given** a logged meal with multiple identified food items, **When** the user sets consumption separately per item (e.g., all the chicken, half the rice, none of the broccoli), **Then** the meal totals are recalculated from the per-item amounts.
3. **Given** a "before" photo of a full plate and a later "after" photo of the same plate, **When** the user submits the after photo, **Then** the app estimates the portion remaining and the portion consumed and reports the calorie/nutrient difference, never assuming 100% consumption unless the after photo shows an empty plate.
4. **Given** an after photo showing less food than the before photo, **When** the app suspects food was removed rather than eaten, **Then** it does not log the difference as consumed and asks the user to confirm what happened.
5. **Given** an after photo showing additional food not present in the before photo, **When** the app compares the photos, **Then** it treats the addition as added food rather than a change in consumption.

---

### User Story 5 - Prefer authoritative nutrition data over visual guesses (Priority: P2)

When a photo shows a packaged food with a visible barcode/label, or a recognizable restaurant item, the app uses published nutrition data instead of a visual estimate, and discloses which data source was used.

**Why this priority**: This improves accuracy for a common subset of meals but is an enhancement layered on top of the core visual-estimation flow, so it is not required for MVP.

**Independent Test**: Can be fully tested by submitting a photo of a packaged food with a visible label/barcode and a photo of a recognizable restaurant item (with network access available), and verifying the displayed nutrition data matches the published source and that the source is disclosed.

**Acceptance Scenarios**:

1. **Given** a photo of a packaged food with a visible barcode or nutrition label, **When** the app processes it, **Then** it uses the manufacturer's published nutrition facts and falls back to visual estimation only if no label/barcode is found or readable.
2. **Given** a photo of a recognizable restaurant item and an available internet connection, **When** the app processes it, **Then** it uses the restaurant's published ingredients and nutrition facts instead of a visual estimate, and shows which data source was used.
3. **Given** no internet access, **When** the user submits a photo of a restaurant item, **Then** the app falls back to visual estimation and discloses that restaurant lookup was unavailable.

---

### Edge Cases

- Mixed dishes where food items overlap or touch on the plate (e.g., a stir-fry) may be harder to separate; the app should identify what it can and disclose reduced confidence rather than guessing item boundaries silently.
- Multiple photos of the same meal (e.g., retaken for clarity) should not create duplicate log entries unless the user explicitly logs both.
- A user who changes/corrects the identified food after the initial estimate should see nutrition data recalculated for the corrected food, not the original guess.
- Offline use disables restaurant lookup; the app must fall back to visual estimation and clearly disclose that restaurant data was unavailable.
- Photos containing both food and non-food objects (e.g., a meal next to a phone) should have the non-food object ignored or disclosed as ignored, without blocking identification of the food.
- Users who set no dietary restrictions still see allergen labels on every result, but never see restriction-conflict flags (since none are on file).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST allow users to capture a meal photo via device camera or upload an existing image file.
- **FR-002**: The app MUST identify distinct food items present in a submitted photo, separating individual items on a multi-item plate.
- **FR-003**: The app MUST display estimated calories, protein, carbohydrates, fat, and key vitamins/minerals for each identified food item and as a combined meal total.
- **FR-004**: The app MUST return nutrition results within 5 seconds of a submitted photo under normal conditions.
- **FR-005**: The app MUST estimate portion size based on the actual visible quantity in the photo rather than defaulting to a standard serving size.
- **FR-006**: The app MUST detect non-food images and respond with a friendly, clearly-labeled message stating no real food was detected, without logging any real nutrition data.
- **FR-007**: The app MAY show a clearly-labeled "just for fun" nutrition estimate for non-food images, which MUST be visually distinguished from real nutrition data and MUST NOT be included in the food log or daily totals.
- **FR-008**: The app MUST detect insufficient image quality (blur, poor lighting) and, when detected, ask the user to retake or upload a clearer photo instead of showing nutrition data.
- **FR-009**: The app MUST detect an empty plate, assign 0 calories, and respond with a lighthearted message rather than an error.
- **FR-010**: The app MUST detect ambiguous portion-size conditions (no scale reference, unusual angle/distance) and, when detected, display a range instead of a single number and label the result as approximate.
- **FR-011**: The app MUST produce reasonably consistent portion estimates for the same food across different photo angles/distances, or explicitly warn that portion size could not be reliably determined.
- **FR-012**: The app MUST disclose when nutrition values are estimates due to hidden or unclear ingredients (e.g., sauces, toppings, mixed dishes).
- **FR-013**: The app MUST show a confidence indicator when a food's identification is ambiguous between visually-similar items with differing nutrition profiles, and MUST let the user confirm or correct the identification before finalizing the log entry.
- **FR-014**: The app MUST reject invalid file types (e.g., PDF, plain text) and corrupted or unsupported image files with a clear, friendly, actionable error message, and MUST NOT crash on such input.
- **FR-015**: The app MUST explicitly label common allergens (including but not limited to shellfish, peanuts, tree nuts) and pork on every result, regardless of whether the user has a related dietary restriction on file.
- **FR-016**: The app MUST allow users to set and update dietary restrictions in their profile (e.g., gluten-free, vegetarian, nut allergy, avoid pork).
- **FR-017**: The app MUST NOT assume a food complies with a user's saved dietary restriction based on visual appearance alone.
- **FR-018**: The app MUST flag an identified food as a potential conflict when it conflicts with, or cannot be verified against, a saved dietary restriction, and MUST require the user to confirm ingredients before logging that food.
- **FR-019**: The app MUST allow users to mark a logged meal as a percentage eaten (100%, 50%, 25%, or 0%) and MUST scale consumed calories and all nutrients proportionally.
- **FR-020**: The app MUST allow users to set consumption per individual food item within a meal and MUST recalculate meal totals from per-item amounts.
- **FR-021**: The app MUST support comparing a "before" and "after" photo of the same meal to estimate the portion consumed and report the calorie/nutrient difference, and MUST NOT assume 100% consumption unless the after photo shows an empty plate.
- **FR-022**: The app MUST distinguish between food that was removed (not eaten) and food that was consumed when comparing before/after photos, asking the user to confirm when removal is suspected.
- **FR-023**: The app MUST treat food present in an "after" photo but absent from the "before" photo as added food, not as a change in consumption.
- **FR-024**: The app MUST use manufacturer-published nutrition facts when a packaged food's barcode or label is visible and readable, falling back to visual estimation only when no label/barcode is found or readable.
- **FR-025**: The app MUST use a restaurant's published nutrition facts for recognized restaurant items when internet access is available, and MUST disclose which data source (visual estimate, packaged label, or restaurant data) was used for each result.
- **FR-026**: The app MUST fall back to visual estimation and disclose reduced accuracy when offline and restaurant/label lookup is unavailable.
- **FR-027**: The app MUST allow users to correct or change an identified food after the initial estimate, recalculating nutrition data for the corrected food.
- **FR-028**: The app MUST request camera permission only when the user attempts to use the camera, and MUST allow photo upload as a fully functional alternative that does not require camera permission.

### Key Entities

- **Meal Log Entry**: A single logged eating occasion; includes timestamp, source photo(s), identified food items, combined nutrition totals, consumption percentage, and data-source disclosure per item.
- **Food Item**: A single identified food within a photo; includes name, confidence level, estimated or authoritative nutrition values (macros and micronutrients), portion estimate (exact or range), allergen labels, and data source (visual estimate, packaged label, restaurant data).
- **Nutrition Estimate**: The calorie/macro/micronutrient values associated with a food item or meal, including whether it is exact or approximate, and the reason for any uncertainty (e.g., hidden ingredients, ambiguous portion).
- **User Profile**: Stores a user's saved dietary restrictions (e.g., gluten-free, vegetarian, nut allergy, avoid pork).
- **Dietary Conflict Flag**: A flag attached to a food item indicating it conflicts with, or cannot be verified against, one or more of the user's saved restrictions, along with a required user confirmation step.
- **Consumption Record**: The recorded portion of a meal or food item actually eaten, whether set manually, per-item, or derived from before/after photo comparison.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nutrition results are displayed within 5 seconds of a photo scan in at least 95% of submissions.
- **SC-002**: 100% of non-food, blurry, empty-plate, or invalid/corrupted image submissions result in no real nutrition data being logged, with any "just for fun" estimate visibly labeled as such and excluded from totals.
- **SC-003**: 100% of results containing a common allergen, a dietary restriction conflict, or an unverifiable restriction display an explicit flag before the item can be logged.
- **SC-004**: Partial-consumption values (manual, per-item, or photo-derived) match the stated or estimated consumption fraction within a 5% tolerance across all nutrients.
- **SC-005**: 100% of results with ambiguous portion sizes or hidden/unclear ingredients are labeled as approximate/estimated.
- **SC-006**: 100% of rejected or failed uploads show a clear, actionable, friendly message describing what went wrong and how to fix it, with zero application crashes.
- **SC-007**: At least 90% of users can log a typical meal (photo to confirmed result) in under 30 seconds of active effort, excluding photo capture time.

## Assumptions

- Users have a device with a camera and/or the ability to upload photo files, and a mobile or web client capable of displaying images and nutrition data.
- "Common allergens" for labeling purposes include at minimum shellfish, peanuts, and tree nuts, consistent with major regulatory allergen lists, plus pork as explicitly requested.
- Restaurant nutrition lookup depends on an external, internet-accessible data source; when offline or when the item isn't recognized, the app relies solely on visual estimation.
- Packaged food label/barcode reading is treated as authoritative when successfully read; no additional manual verification step is required beyond user confirmation of the identified product.
- "Reasonably consistent" portion estimates across angles/distances means estimates for the same actual portion should not vary by more than a moderate, user-perceptible margin; exact tolerance is a downstream implementation detail informed by testing.
- Medical-grade dietary compliance verification (e.g., trace-allergen cross-contamination guarantees) is out of scope; the app flags likely conflicts and defers final judgment to user confirmation.
- Meal planning, recipe suggestions, medical/clinical dietary advice, and social features are out of scope for this feature.
