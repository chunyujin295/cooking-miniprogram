-- 菜谱图片改为多图（数量不设上限，第一张为封面）
ALTER TABLE "recipes" ADD COLUMN "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "recipes" DROP COLUMN "image_url";
