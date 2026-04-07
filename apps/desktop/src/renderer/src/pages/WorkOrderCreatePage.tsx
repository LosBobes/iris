import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";

function WorkOrderCreatePage(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="space-y-6 p-8">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/work-orders")}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Nazad na naloge
          </Button>
          <h1 className="text-base font-semibold">Novi radni nalog</h1>
        </div>

        <div className="max-w-2xl space-y-3 border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Forma za kreiranje radnog naloga još nije dostupna u ovoj iteraciji.
          </p>
          <p className="text-sm text-muted-foreground">
            Povratak na listu naloga ostaje dostupan dok se unos novog naloga ne
            implementira.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export default WorkOrderCreatePage;
