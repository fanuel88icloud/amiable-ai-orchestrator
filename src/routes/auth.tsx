import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accedi | FMS AI Platform" },
      {
        name: "description",
        content: "Accedi o registrati alla FMS AI Platform per gestire agenti AI su telefono, WhatsApp, email e documenti.",
      },
      { property: "og:title", content: "Accedi | FMS AI Platform" },
      {
        property: "og:description",
        content: "Autenticazione alla piattaforma FMS AI.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await router.invalidate();
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registrazione completata. Controlla la tua email se richiesta la conferma.");
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Accesso con Google non riuscito.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="gradient-hero relative hidden flex-col justify-between p-12 lg:flex">
        <div className="surface-grid absolute inset-0 opacity-40" />
        <div className="relative flex items-center gap-2.5 text-sidebar-foreground">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold">FMS AI Platform</span>
        </div>
        <div className="relative max-w-md space-y-4">
          <h2 className="text-gradient-brand font-display text-4xl font-semibold leading-tight">
            Agenti AI per telefono, WhatsApp, email e documenti
          </h2>
          <p className="text-sm text-sidebar-foreground/70">
            Una base modulare e professionale su cui costruire agenti, canali, tool e workflow.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-foreground/50">Fondamenta della piattaforma</p>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-display text-xl">Accedi alla piattaforma</CardTitle>
            <CardDescription>Usa le tue credenziali oppure il tuo account Google.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  Accedi
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">
                  Registrati
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-5">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <AuthFields
                    email={email}
                    password={password}
                    onEmail={setEmail}
                    onPassword={setPassword}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                    Accedi
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-5">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <AuthFields
                    email={email}
                    password={password}
                    onEmail={setEmail}
                    onPassword={setPassword}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                    Crea account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">oppure</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
              Continua con Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuthFields({
  email,
  password,
  onEmail,
  onPassword,
}: {
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="nome@azienda.it"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
    </>
  );
}
