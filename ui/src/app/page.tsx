import { PlumbApp } from "@/components/plumb/plumb-app";
import { applyDecisions, loadDecisions, loadFlagsFile } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [flagsFile, decisions] = await Promise.all([loadFlagsFile(), loadDecisions()]);
  const flags = applyDecisions(flagsFile.flags, decisions);

  return (
    <PlumbApp
      sources={flagsFile.sources}
      flags={flags}
      governanceNote={flagsFile.governance_note}
    />
  );
}
