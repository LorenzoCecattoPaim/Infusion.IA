import { useState, useRef, useCallback, useEffect } from "react";
import {
  Briefcase,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileText,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import DashboardLayout from "@/components/DashboardLayout";
import { useBusinessProfile, type BusinessProfile } from "@/hooks/useBusinessProfile";
import { getRagFiles, saveRagFile, deleteRagFile, readFileAsText, formatFileSize } from "@/lib/rag";
import { toast } from "sonner";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const REDES_SOCIAIS_OPTIONS = [
  "Instagram",
  "Facebook",
  "WhatsApp",
  "LinkedIn",
  "TikTok",
  "YouTube",
];

const TOM_OPTIONS = [
  "Formal e profissional",
  "Descontraído e jovem",
  "Inspiracional",
  "Técnico e especialista",
  "Amigável e próximo",
];

const ORCAMENTO_OPTIONS = [
  "Até R$ 500/mês",
  "R$ 500 a R$ 2.000/mês",
  "R$ 2.000 a R$ 5.000/mês",
  "Acima de R$ 5.000/mês",
  "Não definido",
];

export default function MeuNegocioPage() {
  const { profile: savedProfile, isLoading, persistProfile } = useBusinessProfile();
  const [profile, setProfile] = useState<BusinessProfile>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState("");
  const [materials, setMaterials] = useState(getRagFiles());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync profile from db
  useEffect(() => {
    if (savedProfile) {
      setProfile(savedProfile);
    }
  }, [savedProfile]);

  const debouncedSave = useCallback(
    debounce(async (data: Partial<BusinessProfile>) => {
      setSaveStatus("saving");
      try {
        await persistProfile(data);
        setSaveStatus("saved");
        setLastSaved(
          new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
        setTimeout(() => setSaveStatus("idle"), 3000);
      } catch {
        setSaveStatus("error");
      }
    }, 700),
    [persistProfile]
  );

  const handleChange = (field: keyof BusinessProfile, value: any) => {
    const updated = { ...profile, [field]: value };
    setProfile(updated);
    debouncedSave(updated);
  };

  const handleRedesSociais = (rede: string, checked: boolean) => {
    const current = profile.redes_sociais || [];
    const updated = checked
      ? [...current, rede]
      : current.filter((r) => r !== rede);
    handleChange("redes_sociais", updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} é maior que 20MB.`);
        continue;
      }
      try {
        const content = await readFileAsText(file);
        const ragFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          content,
          size: formatFileSize(file.size),
          uploadedAt: new Date().toISOString(),
        };
        saveRagFile(ragFile);
        setMaterials(getRagFiles());
        toast.success(`${file.name} adicionado ao contexto da IA.`);
      } catch {
        toast.error(`Erro ao ler ${file.name}.`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteMaterial = (id: string) => {
    deleteRagFile(id);
    setMaterials(getRagFiles());
    toast.success("Material removido.");
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-muted-foreground">Carregando perfil...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" /> Meu Negócio
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure o perfil da sua empresa para personalizar a IA
            </p>
          </div>
          <div>
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Salvando...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Salvo às {lastSaved}
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Erro ao salvar
              </span>
            )}
          </div>
        </div>

        {/* Questionnaire */}
        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">
              Perfil da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Nome da empresa *
              </Label>
              <Input
                value={profile.nome_empresa || ""}
                onChange={(e) => handleChange("nome_empresa", e.target.value)}
                placeholder="Ex: Padaria do João"
                className="bg-secondary border-border"
              />
            </div>

            {/* Segmento */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Segmento / Tipo de negócio
              </Label>
              <Input
                value={profile.segmento || ""}
                onChange={(e) => handleChange("segmento", e.target.value)}
                placeholder="Ex: Restaurante, E-commerce, Clínica, etc."
                className="bg-secondary border-border"
              />
            </div>

            {/* Porte */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Porte da empresa
              </Label>
              <RadioGroup
                value={profile.porte || ""}
                onValueChange={(v) => handleChange("porte", v)}
              >
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {["MEI", "Pequena", "Média", "Grande", "Startup"].map(
                    (opt) => (
                      <label
                        key={opt}
                        className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                          profile.porte === opt
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <RadioGroupItem value={opt} className="shrink-0" />
                        {opt}
                      </label>
                    )
                  )}
                </div>
              </RadioGroup>
            </div>

            {/* Público-alvo */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Público-alvo
              </Label>
              <Input
                value={profile.publico_alvo || ""}
                onChange={(e) => handleChange("publico_alvo", e.target.value)}
                placeholder="Ex: Mulheres de 25-45 anos, classe B/C, interessadas em saúde"
                className="bg-secondary border-border"
              />
            </div>

            {/* Diferenciais */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Diferenciais / Pontos fortes
              </Label>
              <textarea
                value={profile.diferenciais || ""}
                onChange={(e) => handleChange("diferenciais", e.target.value)}
                placeholder="O que torna seu negócio único? Ex: Atendimento 24h, entrega grátis, produto artesanal..."
                className="w-full min-h-[80px] bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* Desafios */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Principais desafios de marketing
              </Label>
              <textarea
                value={profile.desafios || ""}
                onChange={(e) => handleChange("desafios", e.target.value)}
                placeholder="Ex: Pouco engajamento no Instagram, dificuldade em converter seguidores em clientes..."
                className="w-full min-h-[80px] bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* Tom de comunicação */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Tom de comunicação
              </Label>
              <RadioGroup
                value={profile.tom_comunicacao || ""}
                onValueChange={(v) => handleChange("tom_comunicacao", v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TOM_OPTIONS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        profile.tom_comunicacao === opt
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <RadioGroupItem value={opt} className="shrink-0" />
                      {opt}
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>

            {/* Redes sociais */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Redes sociais utilizadas
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {REDES_SOCIAIS_OPTIONS.map((rede) => (
                  <label
                    key={rede}
                    className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                      profile.redes_sociais?.includes(rede)
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Checkbox
                      checked={profile.redes_sociais?.includes(rede) || false}
                      onCheckedChange={(checked) =>
                        handleRedesSociais(rede, checked as boolean)
                      }
                      className="shrink-0"
                    />
                    {rede}
                  </label>
                ))}
              </div>
            </div>

            {/* Concorrentes */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Principais concorrentes
              </Label>
              <Input
                value={profile.concorrentes || ""}
                onChange={(e) => handleChange("concorrentes", e.target.value)}
                placeholder="Ex: Empresa A, Empresa B (nome ou perfil nas redes)"
                className="bg-secondary border-border"
              />
            </div>

            {/* Objetivos */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Objetivos de marketing (próximos 3 meses)
              </Label>
              <textarea
                value={profile.objetivos_marketing || ""}
                onChange={(e) =>
                  handleChange("objetivos_marketing", e.target.value)
                }
                placeholder="Ex: Dobrar seguidores, aumentar vendas online em 30%, lançar novo produto..."
                className="w-full min-h-[80px] bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* Orçamento */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                Orçamento mensal para marketing
              </Label>
              <RadioGroup
                value={profile.orcamento_mensal || ""}
                onValueChange={(v) => handleChange("orcamento_mensal", v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ORCAMENTO_OPTIONS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        profile.orcamento_mensal === opt
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <RadioGroupItem value={opt} className="shrink-0" />
                      {opt}
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Materials upload */}
        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" /> Materiais da
              Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Faça upload de documentos (cardápios, catálogos, briefings,
              scripts) para que a IA use como contexto nas respostas.
            </p>

            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dt = e.dataTransfer;
                if (dt.files.length) {
                  const fakeEvent = {
                    target: { files: dt.files },
                  } as React.ChangeEvent<HTMLInputElement>;
                  handleFileUpload(fakeEvent);
                }
              }}
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Clique para fazer upload ou arraste arquivos aqui
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, DOC, TXT — máx. 20MB por arquivo
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {materials.length > 0 && (
              <div className="space-y-2">
                {materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="border border-border rounded-lg px-3 py-2 bg-secondary/20 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate">
                        {mat.name}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {mat.size}
                      </Badge>
                    </div>
                    <button
                      onClick={() => handleDeleteMaterial(mat.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              As informações são salvas automaticamente e usadas para
              personalizar todas as respostas da IA ao seu negócio específico.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
