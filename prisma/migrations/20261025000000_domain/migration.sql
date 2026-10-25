-- CreateEnum
CREATE TYPE "MutationOperation" AS ENUM ('CREATE_TRIP', 'SAVE_TRIP', 'DELETE_TRIP');

-- CreateEnum
CREATE TYPE "MutationResultKind" AS ENUM ('CREATED', 'SAVED', 'DELETED');

-- CreateTable
CREATE TABLE "trip" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "finishMinute" INTEGER NOT NULL,

    CONSTRAINT "day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "placeLabel" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "fixedStartMinute" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_estimate" (
    "dayId" UUID NOT NULL,
    "fromActivityId" UUID NOT NULL,
    "toActivityId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "travel_estimate_pkey" PRIMARY KEY ("dayId","fromActivityId","toActivityId")
);

-- CreateTable
CREATE TABLE "mutation_receipt" (
    "userId" TEXT NOT NULL,
    "mutationId" UUID NOT NULL,
    "operation" "MutationOperation" NOT NULL,
    "targetTripId" UUID NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "resultRevision" INTEGER,
    "resultKind" "MutationResultKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutation_receipt_pkey" PRIMARY KEY ("userId","mutationId")
);

-- CreateIndex
CREATE INDEX "trip_userId_updatedAt_id_idx" ON "trip"("userId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "day_tripId_date_key" ON "day"("tripId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "activity_dayId_position_key" ON "activity"("dayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "activity_id_dayId_key" ON "activity"("id", "dayId");

-- CreateIndex
CREATE INDEX "travel_estimate_fromActivityId_dayId_idx" ON "travel_estimate"("fromActivityId", "dayId");

-- CreateIndex
CREATE INDEX "travel_estimate_toActivityId_dayId_idx" ON "travel_estimate"("toActivityId", "dayId");

-- CreateIndex
CREATE INDEX "mutation_receipt_createdAt_idx" ON "mutation_receipt"("createdAt");

-- AddForeignKey
ALTER TABLE "trip" ADD CONSTRAINT "trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day" ADD CONSTRAINT "day_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_estimate" ADD CONSTRAINT "travel_estimate_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_estimate" ADD CONSTRAINT "travel_estimate_fromActivityId_dayId_fkey" FOREIGN KEY ("fromActivityId", "dayId") REFERENCES "activity"("id", "dayId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "travel_estimate" ADD CONSTRAINT "travel_estimate_toActivityId_dayId_fkey" FOREIGN KEY ("toActivityId", "dayId") REFERENCES "activity"("id", "dayId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mutation_receipt" ADD CONSTRAINT "mutation_receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints. Keep these when generating later migrations.
ALTER TABLE "trip"
  ADD CONSTRAINT "trip_title_check" CHECK (char_length(title) BETWEEN 1 AND 120 AND title !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "trip_destination_check" CHECK (char_length(destination) BETWEEN 1 AND 120 AND destination !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "trip_revision_check" CHECK (revision >= 1);

ALTER TABLE "day"
  ADD CONSTRAINT "day_date_check" CHECK (date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  ADD CONSTRAINT "day_minutes_check" CHECK ("startMinute" BETWEEN 0 AND 1438 AND "finishMinute" BETWEEN 1 AND 1439 AND "startMinute" < "finishMinute");

ALTER TABLE "activity"
  ADD CONSTRAINT "activity_title_check" CHECK (char_length(title) BETWEEN 1 AND 120 AND title !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "activity_place_check" CHECK ("placeLabel" IS NULL OR (char_length("placeLabel") BETWEEN 1 AND 200 AND "placeLabel" !~ '^[[:space:]]|[[:space:]]$')),
  ADD CONSTRAINT "activity_duration_check" CHECK ("durationMinutes" BETWEEN 1 AND 1439),
  ADD CONSTRAINT "activity_booking_check" CHECK ("fixedStartMinute" IS NULL OR "fixedStartMinute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "activity_position_check" CHECK (position >= 0);

ALTER TABLE "travel_estimate"
  ADD CONSTRAINT "travel_distinct_check" CHECK ("fromActivityId" <> "toActivityId"),
  ADD CONSTRAINT "travel_minutes_check" CHECK (minutes BETWEEN 0 AND 1439);

ALTER TABLE "mutation_receipt"
  ADD CONSTRAINT "receipt_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "receipt_result_check" CHECK (
    (operation = 'CREATE_TRIP' AND "resultKind" = 'CREATED' AND "resultRevision" IS NOT NULL AND "resultRevision" = 1) OR
    (operation = 'SAVE_TRIP' AND "resultKind" = 'SAVED' AND "resultRevision" IS NOT NULL AND "resultRevision" >= 2) OR
    (operation = 'DELETE_TRIP' AND "resultKind" = 'DELETED' AND "resultRevision" IS NULL)
  );
