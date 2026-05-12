-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_themeSlug_fkey";

-- AlterTable
ALTER TABLE "Submission" ALTER COLUMN "themeSlug" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Submission"
  ADD CONSTRAINT "Submission_themeSlug_fkey"
  FOREIGN KEY ("themeSlug") REFERENCES "Theme"("slug")
  ON DELETE NO ACTION ON UPDATE CASCADE;
