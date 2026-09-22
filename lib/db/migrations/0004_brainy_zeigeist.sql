CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'paid', 'failed', 'closed', 'refunded');--> statement-breakpoint
-- NOTE: agent_manager_config was added to lib/db/schema.ts and applied with
-- `db:push` without ever being captured in a migration, so drizzle-kit emits it
-- here as new. These three statements are guarded so this migration applies
-- cleanly to BOTH a fresh database and one that was already pushed.
CREATE TABLE IF NOT EXISTS "agent_manager_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_id" varchar(120) NOT NULL,
	"status" varchar(40) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"event_id" varchar(160) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"order_id" uuid,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"out_trade_no" varchar(64) NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "payment_order_status" DEFAULT 'pending' NOT NULL,
	"plan_id" "plan_tier" NOT NULL,
	"cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"agent_id" uuid,
	"amount_minor" integer NOT NULL,
	"currency" varchar(8) NOT NULL,
	"return_url" text,
	"pay_url" text,
	"stripe_session_id" varchar(120),
	"stripe_payment_intent_id" varchar(120),
	"stripe_subscription_id" varchar(120),
	"stripe_customer_id" varchar(64),
	"alipay_trade_status" varchar(32),
	"provider_payload" jsonb,
	"invoice_id" uuid,
	"subscription_id" uuid,
	"failure_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "provider_ref" varchar(120);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "hosted_url" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "monthly_price_fen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "overage_fen_per_1k" integer DEFAULT 1400 NOT NULL;--> statement-breakpoint
-- Backfill the CNY ladder. The DEFAULT 0 above only helps a fresh database; an
-- already-seeded one would otherwise carry monthly_price_fen = 0 on every row
-- and quote every China-market seat at ¥0.00 until someone re-seeded. Values
-- must match `priceLadder.cny` in lib/pricing.ts.
UPDATE "plans" SET "overage_fen_per_1k" = 1400, "monthly_price_fen" = CASE "id"
  WHEN 'associate' THEN 34900
  WHEN 'professional' THEN 106800
  WHEN 'director' THEN 286800
  ELSE "monthly_price_fen"
END;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider" "payment_provider";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "external_id" varchar(80);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "currency" varchar(8) DEFAULT 'usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_customer_id" varchar(64);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "agent_manager_config" ADD CONSTRAINT "agent_manager_config_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_manager_config_agent_provider_uniq" ON "agent_manager_config" USING btree ("agent_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_manager_config_external_idx" ON "agent_manager_config" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uniq" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_out_trade_no_uniq" ON "payment_orders" USING btree ("out_trade_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_stripe_session_uniq" ON "payment_orders" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "payment_orders_workspace_idx" ON "payment_orders" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_orders_status_idx" ON "payment_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_stripe_customer_uniq" ON "workspaces" USING btree ("stripe_customer_id");