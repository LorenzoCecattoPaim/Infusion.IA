import { buildRagContext, deleteRagFile, getRagFiles, saveRagFile } from "@/lib/rag";

describe("rag local storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and builds context", () => {
    expect(getRagFiles()).toEqual([]);

    saveRagFile({
      id: "file-1",
      name: "brief.txt",
      content: "Conteudo do cliente",
      size: "1 KB",
      uploadedAt: new Date().toISOString(),
    });

    const stored = getRagFiles();
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe("brief.txt");

    const context = buildRagContext();
    expect(context).toContain("MATERIAIS DO CLIENTE");
    expect(context).toContain("Conteudo do cliente");

    deleteRagFile("file-1");
    expect(getRagFiles()).toEqual([]);
  });
});
