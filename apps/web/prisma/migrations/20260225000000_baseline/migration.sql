-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'EXTRACTING', 'READY_TO_PUBLISH', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "PostTripleRole" AS ENUM ('MAIN', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "Stance" AS ENUM ('SUPPORTS', 'REFUTES');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT NOT NULL,
    "avatar" TEXT,
    "displayName" TEXT,
    "energyBalance" INTEGER NOT NULL DEFAULT 1000,
    "isWeb2User" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "parentPostId" TEXT,
    "themeSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stance" "Stance",
    "originSubmissionId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTripleLink" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termId" TEXT NOT NULL,
    "role" "PostTripleRole" NOT NULL,

    CONSTRAINT "PostTripleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedPostId" TEXT,
    "parentPostId" TEXT,
    "stance" "Stance",
    "themeSlug" TEXT NOT NULL,
    "publishIdempotencyKey" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE INDEX "User_address_idx" ON "User"("address");

-- CreateIndex
CREATE INDEX "Post_themeSlug_createdAt_idx" ON "Post"("themeSlug", "createdAt");

-- CreateIndex
CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_parentPostId_idx" ON "Post"("parentPostId");

-- CreateIndex
CREATE INDEX "Post_originSubmissionId_idx" ON "Post"("originSubmissionId");

-- CreateIndex
CREATE INDEX "PostTripleLink_termId_idx" ON "PostTripleLink"("termId");

-- CreateIndex
CREATE INDEX "PostTripleLink_postId_createdAt_idx" ON "PostTripleLink"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostTripleLink_postId_role_idx" ON "PostTripleLink"("postId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PostTripleLink_postId_termId_key" ON "PostTripleLink"("postId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_publishedPostId_key" ON "Submission"("publishedPostId");

-- CreateIndex
CREATE INDEX "Submission_userId_status_idx" ON "Submission"("userId", "status");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_themeSlug_fkey" FOREIGN KEY ("themeSlug") REFERENCES "Theme"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_originSubmissionId_fkey" FOREIGN KEY ("originSubmissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTripleLink" ADD CONSTRAINT "PostTripleLink_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_themeSlug_fkey" FOREIGN KEY ("themeSlug") REFERENCES "Theme"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique index: max 1 MAIN triple per post (not expressible in Prisma schema)
CREATE UNIQUE INDEX "PostTripleLink_postId_main_unique"
  ON "PostTripleLink" ("postId")
  WHERE "role" = 'MAIN';
