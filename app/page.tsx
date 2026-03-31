import { ClientDashboard } from "./ClientDashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";

export default function Home() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const fromDefault = `${yyyy}-${mm}-01`;
  const toDefault = `${yyyy}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;

  return (
    <div className="max-w-full mx-auto bg-muted/30">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="flex h-14 w-full items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="rounded-sm"
              priority
            />
            <div className="text-sm font-semibold tracking-tight">
              Attendance
            </div>
          </div>
        </div>
      </header>

        <div className="w-full max-w-full mx-auto">
          <DevicePanel fromDefault={fromDefault} toDefault={toDefault} />
        </div>
    </div>
  );
}

function DevicePanel(props: { fromDefault: string; toDefault: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <ClientDashboard fromDefault={props.fromDefault} toDefault={props.toDefault} />
      </CardContent>
    </Card>
  );
}
