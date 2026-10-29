import { useState, useEffect } from "react";

export function useAttachmentSrc(file?: File | Blob | null, initialUrl?: string): string | undefined {
  const [src, setSrc] = useState<string | undefined>(initialUrl);
  useEffect(() => {
    if (initialUrl) {
      setSrc(initialUrl);
      return;
    }
    if (!file) {
      setSrc(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file, initialUrl]);
  return src;
}
