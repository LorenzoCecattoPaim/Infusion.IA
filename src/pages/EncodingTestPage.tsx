import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";

const words = ["Ação", "Coração", "Informação", "Descrição", "Títulos"];

export default function EncodingTestPage() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Teste de Encoding (UTF-8)
          </h1>
          <p className="text-muted-foreground mt-1">
            Verifique se todos os acentos aparecem corretamente.
          </p>
        </div>

        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-3">
              {words.map((word) => (
                <span
                  key={word}
                  className="px-3 py-1.5 rounded-full bg-secondary text-foreground text-sm font-medium"
                >
                  {word}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
