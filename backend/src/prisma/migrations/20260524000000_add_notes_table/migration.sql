-- CreateEnum
CREATE TYPE "NoteTag" AS ENUM ('GENERAL', 'IMPORTANT', 'FOLLOW_UP', 'TODO');

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(500),
    "content" TEXT NOT NULL,
    "tag" "NoteTag" NOT NULL DEFAULT 'GENERAL',
    "agent_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_agent_id_idx" ON "notes"("agent_id");

-- CreateIndex
CREATE INDEX "notes_tag_idx" ON "notes"("tag");

-- CreateIndex
CREATE INDEX "notes_created_at_idx" ON "notes"("created_at");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
