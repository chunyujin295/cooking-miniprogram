-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('url', 'text', 'images');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "recipe_imports" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" "ImportSourceType" NOT NULL,
    "source_url" TEXT,
    "source_title" TEXT,
    "input_chars" INTEGER NOT NULL DEFAULT 0,
    "image_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "error_code" TEXT,
    "draft" JSONB,
    "fallback_text" TEXT,
    "token_in" INTEGER NOT NULL DEFAULT 0,
    "token_out" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "recipe_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_imports_household_id_created_at_idx" ON "recipe_imports"("household_id", "created_at");

-- CreateIndex
CREATE INDEX "recipe_imports_user_id_created_at_idx" ON "recipe_imports"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "recipe_imports" ADD CONSTRAINT "recipe_imports_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_imports" ADD CONSTRAINT "recipe_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
