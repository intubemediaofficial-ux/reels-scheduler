-- DropForeignKey
ALTER TABLE "PostDestination" DROP CONSTRAINT "PostDestination_socialAccountId_fkey";

-- DropForeignKey
ALTER TABLE "PublishJob" DROP CONSTRAINT "PublishJob_socialAccountId_fkey";

-- AddForeignKey
ALTER TABLE "PostDestination" ADD CONSTRAINT "PostDestination_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
