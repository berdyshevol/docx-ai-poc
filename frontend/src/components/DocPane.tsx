import { SuperDocEditor } from "@superdoc-dev/react";
import "@superdoc-dev/react/style.css";

interface Props {
  file: File;
  reloadKey: number;
}

export function DocPane({ file, reloadKey }: Props) {
  return (
    <div className="doc-pane">
      <SuperDocEditor
        key={reloadKey}
        document={file}
        documentMode="editing"
        contained
        onReady={() => console.log("[SuperDoc] ready")}
      />
    </div>
  );
}
