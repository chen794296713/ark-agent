import { z } from 'zod';
import { PACKAGE_IDS } from './types';
export const packageIdSchema = z.enum(PACKAGE_IDS);
export const packageOverlaySchema = z.object({
  name: z.string().trim().min(1).max(80),
  instructions: z.string().max(8000).default(''),
  organization: z.string().max(500).default(''),
  goals: z.string().max(4000).default(''),
  tone: z.enum(['professional', 'warm', 'concise']).default('professional'),
  harness: z.enum(['openclaw', 'hermes', 'codex']).default('openclaw'),
}).strict();
