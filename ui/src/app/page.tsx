import { PlumbApp } from "@/components/plumb/plumb-app";
import { loadFlagsFile } from "@/lib/flags";

export default function Home() {
  const flagsFile = loadFlagsFile();

  return (
    <PlumbApp
      sources={flagsFile.sources}
      flags={flagsFile.flags}
      governanceNote={flagsFile.governance_note}
    />
  );
}
