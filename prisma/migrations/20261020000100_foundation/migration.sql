-- CreateSchema
BEGIN;

CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSING', 'AWAITING_PAYMENT', 'WINNER_CONFIRMED', 'REFUNDING', 'CANCELLED', 'FULFILLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "entryFeeMinor" INTEGER NOT NULL,
    "maxBidsPerUser" INTEGER,
    "paymentWindowSeconds" INTEGER NOT NULL,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionImage" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuctionImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_slug_key" ON "Auction"("slug");

-- CreateIndex
CREATE INDEX "Auction_status_opensAt_idx" ON "Auction"("status", "opensAt");

-- CreateIndex
CREATE INDEX "Auction_status_closesAt_idx" ON "Auction"("status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionImage_auctionId_position_key" ON "AuctionImage"("auctionId", "position");

-- AddForeignKey
ALTER TABLE "AuctionImage" ADD CONSTRAINT "AuctionImage_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve these business constraints when creating future migrations.
ALTER TABLE "User" ADD CONSTRAINT "User_contact_required"
    CHECK (NULLIF(btrim("email"), '') IS NOT NULL OR NULLIF(btrim("phone"), '') IS NOT NULL);

ALTER TABLE "Auction" ADD CONSTRAINT "Auction_entry_fee_positive"
    CHECK ("entryFeeMinor" > 0);
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_bid_limit_positive"
    CHECK ("maxBidsPerUser" IS NULL OR "maxBidsPerUser" > 0);
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_payment_window_positive"
    CHECK ("paymentWindowSeconds" > 0);
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_schedule_valid"
    CHECK ("closesAt" > "opensAt");

ALTER TABLE "AuctionImage" ADD CONSTRAINT "AuctionImage_position_nonnegative"
    CHECK ("position" >= 0);

COMMIT;
