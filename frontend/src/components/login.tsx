import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ErrorMessage } from "@/components/error-message";
import { TextField } from "@/components/text-field";
import { Brand } from "@/components/brand";

export function Login() {
  const client = useQueryClient(),
    [username, setUsername] = useState("admin"),
    [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () =>
      api("/api/login", { method: "POST", body: { username, password } }),
    onSuccess: async () => {
      setPassword("");
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  return (
    <section id="login" className="login-card">
      <Brand />
      <div>
        <h1>
          Your spending,
          <br />
          in one place.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Sign in to your private statement archive.
        </p>
      </div>
      <form
        id="login-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <TextField
          id="username"
          label="Username"
          value={username}
          onChange={setUsername}
          required
        />
        <TextField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          required
        />
        <Button className="w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
        <ErrorMessage error={login.error} />
      </form>
    </section>
  );
}
