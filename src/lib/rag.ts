export interface RagFile {
  id: string;
  name: string;
  content: string;
  size: string;
  uploadedAt: string;
}

const RAG_KEY = "ai_marketing_rag_files";

export function getRagFiles(): RagFile[] {
  try {
    return JSON.parse(localStorage.getItem(RAG_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveRagFile(file: RagFile): void {
  const files = getRagFiles();
  const existing = files.findIndex((f) => f.id === file.id);
  if (existing >= 0) {
    files[existing] = file;
  } else {
    files.push(file);
  }
  localStorage.setItem(RAG_KEY, JSON.stringify(files));
}

export function deleteRagFile(id: string): void {
  const files = getRagFiles().filter((f) => f.id !== id);
  localStorage.setItem(RAG_KEY, JSON.stringify(files));
}

export function buildRagContext(): string {
  const files = getRagFiles();
  if (!files.length) return "";
  return "\n\nMATERIAIS DO CLIENTE:\n" + files.map((f) => `[${f.name}]:\n${f.content}`).join("\n\n");
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file, "utf-8");
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

