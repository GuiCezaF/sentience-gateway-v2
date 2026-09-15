CREATE TABLE "classifications" (
	"user_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	"sync_id" uuid NOT NULL,
	"subject_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"emotion" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classifications_user_id_classification_id_pk" PRIMARY KEY("user_id","classification_id")
);
--> statement-breakpoint
CREATE TABLE "syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" text,
	"sent_at" timestamp with time zone NOT NULL,
	"health" text NOT NULL,
	"received_count" integer NOT NULL,
	"inserted_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_sync_id_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "syncs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classifications_user_occurred_idx" ON "classifications" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "syncs_user_received_idx" ON "syncs" USING btree ("user_id","received_at");