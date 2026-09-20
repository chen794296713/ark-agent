CREATE TABLE "agent_packages" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idempotency_key" varchar(80) NOT NULL,
	"request_digest" varchar(64) NOT NULL,
	"package_id" varchar(80) NOT NULL,
	"package_version" varchar(40) NOT NULL,
	"bundle_digest" varchar(64) NOT NULL,
	"definition" jsonb NOT NULL,
	"overlay" jsonb NOT NULL,
	"bundle" json NOT NULL,
	"deployment_state" varchar(24) DEFAULT 'configured' NOT NULL,
	"deployment_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"deployment_claim" uuid,
	"deployment_started_at" timestamp with time zone,
	"acknowledgment" jsonb,
	"last_error" varchar(100),
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_packages_deployment_state_check" CHECK ("agent_packages"."deployment_state" in ('configured', 'deploying', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_packages" ADD CONSTRAINT "agent_packages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_packages" ADD CONSTRAINT "agent_packages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_packages_workspace_idempotency_uniq" ON "agent_packages" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_packages_deployment_uniq" ON "agent_packages" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "agent_packages_workspace_idx" ON "agent_packages" USING btree ("workspace_id");
