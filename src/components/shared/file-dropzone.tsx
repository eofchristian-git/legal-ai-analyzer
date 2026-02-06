"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  onTextPaste?: (text: string) => void;
  accept?: Record<string, string[]>;
  selectedFile?: File | null;
  onClear?: () => void;
}

const defaultAccept = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
};

export function FileDropzone({
  onFileSelect,
  onTextPaste,
  accept = defaultAccept,
  selectedFile,
  onClear,
}: FileDropzoneProps) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [pastedText, setPastedText] = useState("");

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB
  });

  if (mode === "text") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Paste document text</span>
          <Button variant="ghost" size="sm" onClick={() => setMode("file")}>
            Upload file instead
          </Button>
        </div>
        <Textarea
          placeholder="Paste contract or document text here..."
          value={pastedText}
          onChange={(e) => {
            setPastedText(e.target.value);
            onTextPaste?.(e.target.value);
          }}
          rows={12}
          className="font-mono text-sm"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selectedFile ? (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          )}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {isDragActive
              ? "Drop the file here"
              : "Drag & drop a file, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supports PDF, DOCX, and TXT (max 20MB)
          </p>
        </div>
      )}
      {onTextPaste && (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => setMode("text")}>
            Paste text instead
          </Button>
        </div>
      )}
    </div>
  );
}
