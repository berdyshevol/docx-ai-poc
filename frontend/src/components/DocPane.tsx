import { forwardRef, useImperativeHandle, useRef } from "react";
import { SuperDocEditor, type SuperDocRef } from "@superdoc-dev/react";
import "@superdoc-dev/react/style.css";

interface Props {
  file: File;
  reloadKey: number;
}

export interface DocPaneHandle {
  /** Export the editor's current state as a .docx Blob. */
  exportDocx: () => Promise<Blob | null>;
}

export const DocPane = forwardRef<DocPaneHandle, Props>(function DocPane(
  { file, reloadKey },
  ref,
) {
  const superdocRef = useRef<SuperDocRef>(null);

  useImperativeHandle(ref, () => ({
    async exportDocx() {
      const instance = superdocRef.current?.getInstance();
      if (!instance) return null;
      const blobs = await instance.exportEditorsToDOCX({});
      return blobs?.[0] ?? null;
    },
  }));

  return (
    <div className="doc-pane">
      <SuperDocEditor
        key={reloadKey}
        ref={superdocRef}
        document={file}
        documentMode="editing"
        contained
        onReady={() => console.log("[SuperDoc] ready")}
      />
    </div>
  );
});
