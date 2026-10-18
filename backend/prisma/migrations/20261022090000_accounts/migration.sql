-- AlterEnum
ALTER TYPE "EmailCodePurpose" ADD VALUE 'SCHOOL_EMAIL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "notificationPrefs" JSONB,
ADD COLUMN     "pendingSchoolEmail" TEXT,
ADD COLUMN     "schoolEmail" TEXT,
ADD COLUMN     "schoolEmailVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_schoolEmail_key" ON "User"("schoolEmail");


-- Everyone who signed up so far used a school email (D7), so it's their confirmed school email too
UPDATE "User" SET "schoolEmail" = "email", "schoolEmailVerifiedAt" = "emailVerifiedAt"
WHERE "role" IN ('BUYER', 'SELLER') AND "institutionId" IS NOT NULL;
