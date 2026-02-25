/*
  Warnings:

  - A unique constraint covering the columns `[atomTermId]` on the table `Theme` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "atomTermId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Theme_atomTermId_key" ON "Theme"("atomTermId");
