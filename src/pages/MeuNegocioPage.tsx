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

const SEGMENTOS = [
  "E-commerce",
  "ServiÃ§os",
  "SeguranÃ§a, Infraestrutura ou Obras",
  "Transportes, Frete ou Viagens",
  "Agricultura, Alimentos ou Restaurante",
  "Ensino",
  "InstituiÃ§Ã£o Financeira",
  "Corretor de ImÃ³veis ou ImobiliÃ¡ria",
  "Loja de VestuÃ¡rio, DecoraÃ§Ã£o ou Lar",
  "ServiÃ§os de SaÃºde ou ClÃ­nica",
  "ComunicaÃ§Ãµes ou ProduÃ§Ã£o de ConteÃºdo",
  "Beleza, EstÃ©tica ou Barbearia",
  "Loja de AutomÃ³veis ou Bem DurÃ¡vel",
  "Outro",
];

const OBJETIVOS = [
  "Vender mais",
  "Gerar leads",
  "Aumentar reconhecimento de marca",
  "Melhorar autoridade",
  "LanÃ§ar um produto",
  "Outro",
];

const PUBLICOS = [
  "Jovens (13â€“24 anos)",
  "Adultos (25â€“40 anos)",
  "Adultos (40+)",
  "Empresas (B2B)",
  "PÃºblico geral",
];

const TONS = [
  "Formal",
  "Profissional",
  "DescontraÃ­do",
  "EngraÃ§ado / IrÃ´nico",
  "Inspirador / Motivacional",
];

const MARCA_OPCOES = [
  "Moderna e inovadora",
  "Tradicional e confiÃ¡vel",
  "Luxuosa / premium",
  "AcessÃ­vel / popular",
  "Criativa / disruptiva",
];

const CANAIS = ["Instagram", "TikTok", "YouTube", "LinkedIn", "Site prÃ³prio", "WhatsApp"];

const TIPOS_CONTEUDO = [
  "Posts para redes sociais",
  "AnÃºncios (ads)",
  "Textos para site",
  "E-mails marketing",
  "Roteiros de vÃ­deo",
  "Imagens com IA",
];

const NIVEIS = ["Iniciante", "IntermediÃ¡rio", "AvanÃ§ado"];

const DESAFIOS = [
  "Falta de vendas",
  "Baixo engajamento",
  "Pouco trÃ¡fego",
  "Falta de consistÃªncia",
  "Dificuldade em criar conteÃºdo",
  "Outro",
];

const USO_IA = [
  "Criar conteÃºdo automaticamente",
  "Gerar ideias",
  "Melhorar textos existentes",
  "Criar imagens",
  "Automatizar marketing",
  "Tudo isso",
];

export default function MeuNegocioPage() {
  const { profile: savedProfile, isLoading, persistProfile } = useBusinessProfile();
  const [profile, setProfile] = useState<BusinessProfile>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState("");
  const [materials, setMaterials] = useState(getRagFiles());
  const [segmentoOutro, setSegmentoOutro] = useState("");
  const [objetivoOutro, setObjetivoOutro] = useState("");
  const [desafioOutro, setDesafioOutro] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savedProfile) {
      setProfile(savedProfile);
      setSegmentoOutro(
        savedProfile.segmento_atuacao && !SEGMENTOS.includes(savedProfile.segmento_atuacao)
          ? String(savedProfile.segmento_atuacao)
          : ""
      );
      setObjetivoOutro(
        savedProfile.objetivo_principal && !OBJETIVOS.includes(savedProfile.objetivo_principal)
          ? String(savedProfile.objetivo_principal)
          : ""
      );
      setDesafioOutro(
        savedProfile.maior_desafio && !DESAFIOS.includes(savedProfile.maior_desafio)
          ? String(savedProfile.maior_desafio)
          : ""
      );
    }
  }, [savedProfile]);

  const buildContext = (data: BusinessProfile) => ({
    segmento: data.segmento_atuacao || "",
    objetivo: data.objetivo_principal || "",
    publico: data.publico_alvo || "",
    tom: data.tom_comunicacao || "",
    marca: data.marca_descricao || "",
    canais: data.canais_atuacao || [],
    conteudo: data.tipo_conteudo || [],
    nivel: data.nivel_experiencia || "",
    desafio: data.maior_desafio || "",
    uso_ia: data.uso_ia || "",
  });

  const debouncedSave = useCallback(
    debounce(async (data: Partial<BusinessProfile>) => {
      setSaveStatus("saving");
      try {
        await persistProfile({
          ...data,
          contexto_json: buildContext(data as BusinessProfile),
        });
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

  const handleMultiSelect = (field: keyof BusinessProfile, value: string, checked: boolean) => {
    const current = (profile[field] as string[] | null) || [];
    const updated = checked
      ? [...current, value]
      : current.filter((item) => item !== value);
    handleChange(field, updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} Ã© maior que 20MB.`);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" /> Meu NegÃ³cio
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure o contexto da sua empresa para personalizar a IA
            </p>
          </div>
          <div>
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground animate-pulse">Salvando...</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Salvo Ã s {lastSaved}
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Erro ao salvar
              </span>
            )}
          </div>
        </div>

        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground">Contexto do NegÃ³cio</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Nome da empresa (opcional)</Label>
              <Input
                value={profile.nome_empresa || ""}
                onChange={(e) => handleChange("nome_empresa", e.target.value)}
                placeholder="Ex: Padaria do JoÃ£o"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">1. Qual Ã© o seu segmento de atuaÃ§Ã£o?</Label>
              <RadioGroup
                value={
                  SEGMENTOS.includes(profile.segmento_atuacao || "")
                    ? profile.segmento_atuacao || ""
                    : "Outro"
                }
                onValueChange={(v) => {
                  handleChange("segmento_atuacao", v === "Outro" ? "Outro" : v);
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SEGMENTOS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        (profile.segmento_atuacao || "") === opt
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
              {(profile.segmento_atuacao === "Outro" || (profile.segmento_atuacao && !SEGMENTOS.includes(profile.segmento_atuacao))) && (
                <Input
                  value={segmentoOutro}
                  onChange={(e) => {
                    setSegmentoOutro(e.target.value);
                    handleChange("segmento_atuacao", e.target.value);
                  }}
                  placeholder="Descreva seu segmento"
                  className="bg-secondary border-border"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">2. Qual Ã© o principal objetivo da sua empresa atualmente?</Label>
              <RadioGroup
                value={
                  OBJETIVOS.includes(profile.objetivo_principal || "")
                    ? profile.objetivo_principal || ""
                    : "Outro"
                }
                onValueChange={(v) => {
                  handleChange("objetivo_principal", v === "Outro" ? "Outro" : v);
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {OBJETIVOS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        (profile.objetivo_principal || "") === opt
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
              {(profile.objetivo_principal === "Outro" || (profile.objetivo_principal && !OBJETIVOS.includes(profile.objetivo_principal))) && (
                <Input
                  value={objetivoOutro}
                  onChange={(e) => {
                    setObjetivoOutro(e.target.value);
                    handleChange("objetivo_principal", e.target.value);
                  }}
                  placeholder="Descreva seu objetivo"
                  className="bg-secondary border-border"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">3. Quem Ã© o seu pÃºblico-alvo?</Label>
              <RadioGroup
                value={profile.publico_alvo || ""}
                onValueChange={(v) => handleChange("publico_alvo", v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PUBLICOS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        profile.publico_alvo === opt
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

            <div className="space-y-2">
              <Label className="text-foreground font-medium">4. Qual Ã© o tom de comunicaÃ§Ã£o da sua marca?</Label>
              <RadioGroup
                value={profile.tom_comunicacao || ""}
                onValueChange={(v) => handleChange("tom_comunicacao", v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TONS.map((opt) => (
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

            <div className="space-y-2">
              <Label className="text-foreground font-medium">5. Qual dessas opÃ§Ãµes descreve melhor sua marca? (mÃºltipla escolha)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MARCA_OPCOES.map((opt) => (
                  <label
                    key={opt}
                    className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                      (profile.marca_descricao || "").split(", ").includes(opt)
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Checkbox
                      checked={(profile.marca_descricao || "").split(", ").includes(opt)}
                      onCheckedChange={(checked) => {
                        const current = (profile.marca_descricao || "")
                          .split(", ")
                          .filter((v) => v);
                        const updated = checked
                          ? [...current, opt]
                          : current.filter((v) => v !== opt);
                        handleChange("marca_descricao", updated.join(", "));
                      }}
                      className="shrink-0"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">6. Em quais canais vocÃª mais atua? (mÃºltipla escolha)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CANAIS.map((opt) => (
                  <label
                    key={opt}
                    className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                      (profile.canais_atuacao || []).includes(opt)
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Checkbox
                      checked={(profile.canais_atuacao || []).includes(opt)}
                      onCheckedChange={(checked) =>
                        handleMultiSelect("canais_atuacao", opt, checked as boolean)
                      }
                      className="shrink-0"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">7. Qual tipo de conteÃºdo vocÃª mais precisa gerar?</Label>
              <RadioGroup
                value={(profile.tipo_conteudo || [])[0] || ""}
                onValueChange={(v) => handleChange("tipo_conteudo", [v])}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TIPOS_CONTEUDO.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        (profile.tipo_conteudo || []).includes(opt)
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

            <div className="space-y-2">
              <Label className="text-foreground font-medium">8. Qual Ã© o nÃ­vel de experiÃªncia com marketing digital?</Label>
              <RadioGroup
                value={profile.nivel_experiencia || ""}
                onValueChange={(v) => handleChange("nivel_experiencia", v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {NIVEIS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        profile.nivel_experiencia === opt
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

            <div className="space-y-2">
              <Label className="text-foreground font-medium">9. Qual Ã© o maior desafio da sua empresa hoje?</Label>
              <RadioGroup
                value={
                  DESAFIOS.includes(profile.maior_desafio || "")
                    ? profile.maior_desafio || ""
                    : "Outro"
                }
                onValueChange={(v) => {
                  handleChange("maior_desafio", v === "Outro" ? "Outro" : v);
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DESAFIOS.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        (profile.maior_desafio || "") === opt
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
              {(profile.maior_desafio === "Outro" || (profile.maior_desafio && !DESAFIOS.includes(profile.maior_desafio))) && (
                <Input
                  value={desafioOutro}
                  onChange={(e) => {
                    setDesafioOutro(e.target.value);
                    handleChange("maior_desafio", e.target.value);
                  }}
                  placeholder="Descreva seu desafio"
                  className="bg-secondary border-border"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">10. Como vocÃª quer que a IA te ajude?</Label>
              <RadioGroup
                value={profile.uso_ia || ""}
                onValueChange={(v) => handleChange("uso_ia", v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {USO_IA.map((opt) => (
                    <label
                      key={opt}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                        profile.uso_ia === opt
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

        <Card className="bg-card border-border shadow-card">
          <CardHeader className="border-b border-border">
            <CardTitle className="font-display text-foreground flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" /> Materiais da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              FaÃ§a upload de documentos (cardÃ¡pios, catÃ¡logos, briefings,
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
                PDF, DOC, TXT â€” mÃ¡x. 20MB por arquivo
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

        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              As informaÃ§Ãµes sÃ£o salvas automaticamente e usadas para
              personalizar todas as respostas da IA ao seu negÃ³cio especÃ­fico.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
