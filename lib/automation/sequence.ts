import { z } from "zod";

/**
 * Extra messages sent one after another once the reveal is delivered, each
 * after its own pause — the "typing a few bubbles" flow other DM tools offer.
 * Stored as JSON on Automation.sequenceSteps.
 */
export const sequenceStepSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  // Pause before this message, counted from the previous one. Capped at 24h so
  // the whole sequence stays inside Instagram's messaging window.
  delaySeconds: z.number().int().min(0).max(86_400),
});

export const sequenceStepsSchema = z.array(sequenceStepSchema).max(10);

export type SequenceStep = z.infer<typeof sequenceStepSchema>;

/** Read stored steps, dropping anything malformed instead of throwing. */
export function parseSequenceSteps(value: unknown): SequenceStep[] {
  const parsed = sequenceStepsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
