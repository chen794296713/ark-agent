import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentProfile } from "@/components/marketing/AgentProfile";
import { agentCatalog, getAgent } from "@/lib/agent-catalog";

type AgentPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return agentCatalog.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: AgentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  return {
    title: `${agent.copy.en.name} | ArkAgent`,
    description: agent.copy.en.description,
  };
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  return <AgentProfile agent={agent} />;
}
